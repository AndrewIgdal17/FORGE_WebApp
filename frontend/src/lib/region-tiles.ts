import bboxOf from '@turf/bbox';
import booleanPointInPolygon from '@turf/boolean-point-in-polygon';
import type { Feature, FeatureCollection, MultiLineString, Polygon } from 'geojson';

import { sortRegions } from '@/lib/regions';
import type { RegionShape } from '@/lib/regions';

/** Martin tile server. Table sources live at `<origin>/<id>`. */
export const TILE_ORIGIN = 'https://tiles.forge-calc.com';

/** Heavy layers whose sources are served per region set (function sources). */
export const REGION_FILTERED_LAYERS = [
  'ref.corridors',
  'ref.substations_display',
  'ref.highways_nhs',
  'ref.rail_narn',
] as const;

/**
 * Tile URL template for a region-filtered layer. Codes are sorted so one set
 * gives one address; the commas stay literal and the z/x/y placeholders are
 * not encoded (MapLibre fills them in).
 */
export function regionTileUrl(layerId: string, regions: readonly string[]): string {
  return `${TILE_ORIGIN}/${layerId}_by_region/{z}/{x}/{y}?regions=${sortRegions(regions).join(',')}`;
}

/** Plain tile template for a table source (no region query). */
export function plainTileUrl(layerId: string): string {
  return `${TILE_ORIGIN}/${layerId}/{z}/{x}/{y}`;
}

export interface HeavySourceSpec {
  type: 'vector';
  tiles: string[];
  minzoom: number;
  maxzoom: number;
  promoteId: string;
}

/**
 * Vector source for a heavy layer. It uses `tiles`, not a TileJSON url, so the
 * region query can be swapped later with setTiles. The zoom range is fixed
 * (TileJSON is not read); 22 is the map's own maximum zoom.
 */
export function heavySourceSpec(layerId: string, regions: readonly string[]): HeavySourceSpec {
  const tile = regions.length > 0 ? regionTileUrl(layerId, regions) : plainTileUrl(layerId);
  return { type: 'vector', tiles: [tile], minzoom: 0, maxzoom: 22, promoteId: 'gid' };
}

/** Bounding box [west, south, east, north], padded by `pad` of its width and height on each side. */
export function paddedBounds(
  bounds: readonly [number, number, number, number],
  pad = 0.1,
): [number, number, number, number] {
  const [west, south, east, north] = bounds;
  const padX = (east - west) * pad;
  const padY = (north - south) * pad;
  return [
    Math.max(-180, west - padX),
    Math.max(-90, south - padY),
    Math.min(180, east + padX),
    Math.min(90, north + padY),
  ];
}

/** Bounding box of the ticked shapes, or null when none is ticked. */
export function tickedBounds(
  shapes: readonly RegionShape[],
  regions: readonly string[],
): [number, number, number, number] | null {
  const ticked = new Set(regions);
  const features: Array<Feature<RegionShape['geometry']>> = [];
  for (const shape of shapes) {
    if (!ticked.has(shape.code)) continue;
    features.push({ type: 'Feature', properties: {}, geometry: shape.geometry });
  }
  if (features.length === 0) return null;
  const collection: FeatureCollection = { type: 'FeatureCollection', features };
  const [west, south, east, north] = bboxOf(collection);
  return [west, south, east, north];
}

const WORLD_RING: Array<[number, number]> = [
  [-180, -85],
  [180, -85],
  [180, 85],
  [-180, 85],
  [-180, -85],
];

/** Shoelace sum: its sign is the ring's orientation. */
function orientation(ring: readonly (readonly number[])[]): number {
  let sum = 0;
  for (let i = 0; i < ring.length - 1; i += 1) {
    const [x1, y1] = ring[i] as [number, number];
    const [x2, y2] = ring[i + 1] as [number, number];
    sum += (x2 - x1) * (y2 + y1);
  }
  return Math.sign(sum);
}

/**
 * Holes must wind opposite to the outer ring or the renderer fills them.
 * Reverses a hole whose orientation matches the world ring.
 */
function holeRing(ring: Array<[number, number]>, outerOrientation: number): Array<[number, number]> {
  return orientation(ring) === outerOrientation ? [...ring].reverse() : ring;
}

/**
 * Grey mask over everything outside the ticked regions: a world polygon with
 * each ticked polygon's outer ring as a hole. Interior rings of a ticked
 * region are not holed out, so a hole inside a ticked region is not masked.
 */
export function regionMaskGeometry(
  shapes: readonly RegionShape[],
  regions: readonly string[],
): Feature<Polygon> {
  const ticked = new Set(regions);
  const outerOrientation = orientation(WORLD_RING);
  const holes: Array<Array<[number, number]>> = [];
  for (const shape of shapes) {
    if (!ticked.has(shape.code)) continue;
    if (shape.geometry.type === 'Polygon') {
      holes.push(holeRing(shape.geometry.coordinates[0] as Array<[number, number]>, outerOrientation));
    } else {
      for (const polygon of shape.geometry.coordinates) {
        holes.push(holeRing(polygon[0] as Array<[number, number]>, outerOrientation));
      }
    }
  }
  return {
    type: 'Feature',
    properties: {},
    geometry: {
      type: 'Polygon',
      coordinates: [WORLD_RING, ...holes],
    },
  };
}

// Route vertices can be far apart, so each segment is sampled about every
// 0.02 degrees (roughly 2 km at US latitudes) before the containment test.
const SAMPLE_STEP_DEG = 0.02;

/**
 * Codes of unticked regions that the route enters, in shape order. Checked by
 * sampling points along each segment against the simplified shapes. A region
 * clipped by a gap narrower than about 2 km between samples can be missed.
 */
export function unlistedRegionsOnRoute(
  route: MultiLineString | null,
  regions: readonly string[],
  shapes: readonly RegionShape[],
): string[] {
  if (!route) return [];
  const ticked = new Set(regions);
  const candidates = shapes
    .filter((shape) => !ticked.has(shape.code))
    .map((shape) => ({ code: shape.code, shape, box: bboxOf(shape.geometry) }));
  const hit = new Set<string>();

  for (const line of route.coordinates) {
    for (let index = 1; index < line.length; index += 1) {
      const from = line[index - 1];
      const to = line[index];
      if (!from || !to) continue;
      const span = Math.max(Math.abs(to[0] - from[0]), Math.abs(to[1] - from[1]));
      const steps = Math.max(1, Math.ceil(span / SAMPLE_STEP_DEG));
      for (let step = 0; step <= steps; step += 1) {
        const t = step / steps;
        const point: [number, number] = [
          from[0] + (to[0] - from[0]) * t,
          from[1] + (to[1] - from[1]) * t,
        ];
        for (const candidate of candidates) {
          if (hit.has(candidate.code)) continue;
          const [west, south, east, north] = candidate.box;
          if (point[0] < west || point[0] > east || point[1] < south || point[1] > north) continue;
          if (booleanPointInPolygon(point, candidate.shape.geometry)) hit.add(candidate.code);
        }
      }
    }
  }

  return shapes.filter((shape) => hit.has(shape.code)).map((shape) => shape.code);
}

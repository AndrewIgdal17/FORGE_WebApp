import type { MultiLineString } from 'geojson';

const COORD_EPS = 1e-7;

function coordsEqual(a: readonly number[], b: readonly number[]): boolean {
  return (
    Math.abs(a[0]! - b[0]!) <= COORD_EPS && Math.abs(a[1]! - b[1]!) <= COORD_EPS
  );
}

export interface RouteConnectorSegment {
  end: 'sending' | 'receiving';
  coordinates: [number, number][];
}

/** Route line geometry without connector vertices (connectors render dashed). */
export function solidRouteGeometry(
  route: MultiLineString | null | undefined,
  connectors: readonly RouteConnectorSegment[],
): MultiLineString | null {
  if (!route?.coordinates.length) return route ?? null;
  const primary = route.coordinates[0];
  if (!primary || primary.length < 2) return route;

  let start = 0;
  let end = primary.length;
  const sending = connectors.find((segment) => segment.end === 'sending');
  if (sending && sending.coordinates.length >= 2) {
    const skip = sending.coordinates.length - 1;
    if (skip > 0 && primary.length > skip) {
      let matches = true;
      for (let index = 0; index < skip; index += 1) {
        const routeCoord = primary[index];
        const connectorCoord = sending.coordinates[index];
        if (!routeCoord || !connectorCoord || !coordsEqual(routeCoord, connectorCoord)) {
          matches = false;
          break;
        }
      }
      if (matches) start = skip;
    }
  }

  const receiving = connectors.find((segment) => segment.end === 'receiving');
  if (receiving && receiving.coordinates.length >= 2) {
    const skip = receiving.coordinates.length - 1;
    if (skip > 0 && end - start > skip) {
      let matches = true;
      for (let offset = 0; offset < skip; offset += 1) {
        const routeCoord = primary[end - 1 - offset];
        const connectorCoord = receiving.coordinates[receiving.coordinates.length - 1 - offset];
        if (!routeCoord || !connectorCoord || !coordsEqual(routeCoord, connectorCoord)) {
          matches = false;
          break;
        }
      }
      if (matches) end -= skip;
    }
  }

  if (start >= end) return route;
  const trimmed = primary.slice(start, end).map(
    (pair) => [pair[0]!, pair[1]!] as [number, number],
  );
  if (trimmed.length < 2) return route;

  return { type: 'MultiLineString', coordinates: [trimmed] };
}
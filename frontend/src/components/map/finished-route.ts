import type { MultiLineString } from 'geojson';

export const ROW_WIDTH_REQUIRED = 'row_width_ft must be a positive number';

export interface HeldRouteSegments {
  route: MultiLineString;
  segments: unknown[];
}

export type FinishedRouteStep =
  | { kind: 'none' }
  | {
      kind: 'pending';
      route: MultiLineString;
      segments: unknown[] | null;
      message: string;
    }
  | { kind: 'analyze'; route: MultiLineString; rowWidthFt: number };

/** A finished line is kept when width is missing. Analysis waits for a positive width. */
export function finishedRouteStep(
  finishedRoute: MultiLineString | null,
  rowWidthFt: number | null,
  held: HeldRouteSegments | null,
  widthMessage: string = ROW_WIDTH_REQUIRED,
): FinishedRouteStep {
  if (finishedRoute == null) return { kind: 'none' };
  if (typeof rowWidthFt === 'number' && rowWidthFt > 0) {
    return { kind: 'analyze', route: finishedRoute, rowWidthFt };
  }
  const segments = held != null && held.route === finishedRoute ? held.segments : null;
  return {
    kind: 'pending',
    route: finishedRoute,
    segments,
    message: widthMessage,
  };
}

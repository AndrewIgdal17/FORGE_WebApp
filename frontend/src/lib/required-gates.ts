import type { RequiredField, RequiredResponse } from './api';

/** Drawing waits on inputs the route cannot supply. */
export function canDraw(required: RequiredResponse): boolean {
  return required.before_route.length === 0;
}

/** The first calculation waits on a route and on every required input. */
export function canCalculate(required: RequiredResponse, routePresent: boolean): boolean {
  return routePresent && required.before_route.length === 0 && required.after_route.length === 0;
}

/** Fields the workspace lists once a route exists. */
export function panelFields(required: RequiredResponse, routePresent: boolean): RequiredField[] {
  return routePresent ? required.after_route : [];
}

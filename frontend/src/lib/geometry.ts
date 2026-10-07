export function milesToAcres(miles: number, rowWidthFeet: number): number {
  return (miles * 5280 * rowWidthFeet) / 43560;
}

import { useFormStore } from '@/stores/form-store';

const MEASUREMENT_PATHS = [
  '01_project_technical_details.market_measurements.congestion_spread_per_mwh',
  '01_project_technical_details.market_measurements.hours_receiving_more_congested',
  '01_project_technical_details.market_measurements.hours_sending_more_congested',
  '01_project_technical_details.market_measurements.receiving_energy_value_per_mwh',
] as const;

export function applyDrawnRouteReset(): void {
  const zeroChanges: Record<string, unknown> = {};
  const terrainCategories = [
    'forested',
    'wetland',
    'scrubbed_flat',
    'urban',
    'farmland',
    'desert_barren',
    'mountain',
    'rolling_hills',
  ];
  for (const cat of terrainCategories) {
    zeroChanges[`02_project_physical_details.terrain.terrain_miles.${cat}`] = 0;
  }
  for (let zone = 1; zone <= 15; zone += 1) {
    zeroChanges[`11_project_row_details.right_of_way.zone_${zone}.miles`] = 0;
  }
  const terminalPaths = [
    '01_project_technical_details.terminals.sending.gea',
    '01_project_technical_details.terminals.sending.egrid_subregion',
    '01_project_technical_details.terminals.sending.state',
    '01_project_technical_details.terminals.receiving.gea',
    '01_project_technical_details.terminals.receiving.egrid_subregion',
    '01_project_technical_details.terminals.receiving.state',
  ];
  for (const path of terminalPaths) {
    zeroChanges[path] = null;
  }
  for (const path of MEASUREMENT_PATHS) {
    zeroChanges[path] = null;
  }
  useFormStore.setState({ routeAnalysis: null });
  useFormStore.getState().applyChanges(zeroChanges);
}

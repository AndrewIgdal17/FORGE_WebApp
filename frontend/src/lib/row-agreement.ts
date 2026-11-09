/**
 * Methodology §II.3: with no agreement chosen, greenfield takes a new
 * permanent easement and reconductoring or rebuild takes a lease of the
 * existing corridor. Mirrors the calculator's loader.
 */
export function effectiveRowAgreement(chosen: string, projectType: string): string {
  if (chosen) return chosen;
  return projectType === 'greenfield' ? 'permanent_easement_new' : 'lease_license_existing';
}

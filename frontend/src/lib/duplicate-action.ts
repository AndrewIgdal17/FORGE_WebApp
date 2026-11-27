export type DuplicateAction = 'offer_project_duplicate' | 'duplicate_scenario' | 'none';

/** Which duplicate path the workspace should run for the active scenario tab. */
export function duplicateAction(
  projectReadOnly: boolean,
  activeId: string,
): DuplicateAction {
  if (projectReadOnly) return 'offer_project_duplicate';
  if (activeId.length > 0) return 'duplicate_scenario';
  return 'none';
}
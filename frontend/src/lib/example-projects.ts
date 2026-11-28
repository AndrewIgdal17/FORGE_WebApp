/** A project shown under "Example Projects" on Home. */
export interface ExampleProject {
  id: string;
  name: string;
  terminals: string;
  scenarioCount: number;
}

interface ProjectLike {
  id: string;
  name: string;
  sending_name: string;
  receiving_name: string;
  created_at: string;
}

interface ScenarioLike {
  project_id: string | null;
  source: string;
}

/**
 * Example projects are the projects that hold a research-paper scenario
 * (`source === 'paper'`). Those projects are read-only, so opening one is safe.
 * Oldest first, so the list order does not jump as projects are edited.
 */
export function exampleProjects(
  projects: readonly ProjectLike[],
  scenarios: readonly ScenarioLike[],
): ExampleProject[] {
  const counts = new Map<string, number>();
  const hasPaper = new Set<string>();
  for (const scenario of scenarios) {
    if (!scenario.project_id) continue;
    counts.set(scenario.project_id, (counts.get(scenario.project_id) ?? 0) + 1);
    if (scenario.source === 'paper') hasPaper.add(scenario.project_id);
  }
  return projects
    .filter((project) => hasPaper.has(project.id))
    .slice()
    .sort((a, b) => a.created_at.localeCompare(b.created_at))
    .map((project) => ({
      id: project.id,
      name: project.name,
      terminals: `${project.sending_name} → ${project.receiving_name}`,
      scenarioCount: counts.get(project.id) ?? 0,
    }));
}

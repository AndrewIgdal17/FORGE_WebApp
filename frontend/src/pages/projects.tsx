import { useEffect, useMemo, useState } from 'react';
import type { FormEvent, ReactElement } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router';
import { AuthGuard } from '@/components/auth-guard';
import { ComparisonTable } from '@/components/comparison/comparison-table';
import { AppNav } from '@/components/layout/app-nav';
import { ProjectCard } from '@/components/projects/project-card';
import { CompareSelector } from '@/components/scenarios/compare-selector';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/hooks/use-auth';
import { toast } from '@/hooks/use-toast';
import { getValueAtPath } from '@/lib/path';
import { cn } from '@/lib/utils';
import { useProjectStore, type Project } from '@/stores/project-store';
import {
  scenarioForWorkspace,
  useScenarioStore,
  workspaceUrl,
  type Scenario,
} from '@/stores/scenario-store';

type ProjectsView = 'list' | 'compare';
type OwnerFilter = 'mine' | 'everyone';

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return 'Something went wrong';
}

function readSocietalRatio(results: Record<string, unknown> | null): number | null {
  if (!results) return null;
  const value = getValueAtPath(results, 'bcr.bcr_societal');
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function baseRatioForProject(project: Project, scenarios: Scenario[]): number | null {
  const inProject = scenarios.filter((item) => item.project_id === project.id);
  if (project.base_scenario_id) {
    const base = inProject.find((item) => item.id === project.base_scenario_id);
    if (base) return readSocietalRatio(base.results);
  }
  const oldest =
    [...inProject].sort(
      (a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id),
    )[0] ?? null;
  return oldest ? readSocietalRatio(oldest.results) : null;
}

function ownerNameForProject(project: Project, scenarios: Scenario[]): string {
  const match = scenarios.find((item) => item.user_id === project.user_id);
  return match?.ownerUsername ?? '';
}

export function ProjectDetailRedirect(): ReactElement {
  const { id } = useParams<{ id: string }>();
  const projects = useProjectStore((state) => state.projects);
  const scenarios = useScenarioStore((state) => state.scenarios);
  const loadProjects = useProjectStore((state) => state.loadProjects);
  const loadScenarios = useScenarioStore((state) => state.loadScenarios);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([loadProjects(), loadScenarios()])
      .catch((error: unknown) => {
        if (!cancelled) toast.error(errorMessage(error));
      })
      .finally(() => {
        if (!cancelled) setReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, [loadProjects, loadScenarios]);

  if (!id) {
    return <Navigate to="/app/projects" replace />;
  }

  if (!ready) {
    return (
      <AuthGuard>
        <div className="flex min-h-screen flex-col bg-slate-50">
          <AppNav />
          <main className="mx-auto w-full max-w-3xl px-6 py-8 text-sm text-slate-600">
            Loading project…
          </main>
        </div>
      </AuthGuard>
    );
  }

  const project = projects.find((item) => item.id === id);
  if (!project) {
    return <Navigate to="/app/projects" replace />;
  }

  const scenario = scenarioForWorkspace(project, scenarios);
  if (!scenario) {
    return <Navigate to="/app/projects" replace />;
  }

  return <Navigate to={workspaceUrl(project.id, scenario.id)} replace />;
}

export default function ProjectsPage(): ReactElement {
  const navigate = useNavigate();
  const { session } = useAuth();
  const currentUserId = session?.user.id ?? null;

  const projects = useProjectStore((state) => state.projects);
  const loadingProjects = useProjectStore((state) => state.loading);
  const loadProjects = useProjectStore((state) => state.loadProjects);
  const renameProject = useProjectStore((state) => state.renameProject);
  const removeProject = useProjectStore((state) => state.removeProject);
  const duplicateProject = useProjectStore((state) => state.duplicate);

  const scenarios = useScenarioStore((state) => state.scenarios);
  const loadScenarios = useScenarioStore((state) => state.loadScenarios);
  const setActiveScenario = useScenarioStore((state) => state.setActiveScenario);

  const [view, setView] = useState<ProjectsView>('list');
  const [filter, setFilter] = useState<OwnerFilter>('mine');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [baselineId, setBaselineId] = useState<string | null>(null);
  const [showDelta, setShowDelta] = useState(false);
  const [showPercentDelta, setShowPercentDelta] = useState(false);

  const [renaming, setRenaming] = useState<Project | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [pendingDelete, setPendingDelete] = useState<Project | null>(null);

  useEffect(() => {
    document.title = 'FORGE — Projects';
  }, []);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([loadProjects(), loadScenarios()]).catch((error: unknown) => {
      if (!cancelled) toast.error(errorMessage(error));
    });
    return () => {
      cancelled = true;
    };
  }, [loadProjects, loadScenarios]);

  const filteredProjects = useMemo(() => {
    if (filter === 'everyone') return projects;
    if (!currentUserId) return [];
    return projects.filter((project) => project.user_id === currentUserId);
  }, [projects, filter, currentUserId]);

  const scenarioCountByProject = useMemo(() => {
    const counts = new Map<string, number>();
    for (const scenario of scenarios) {
      if (scenario.project_id === null) continue;
      counts.set(scenario.project_id, (counts.get(scenario.project_id) ?? 0) + 1);
    }
    return counts;
  }, [scenarios]);

  const selectedScenarios = scenarios.filter((scenario) => selectedIds.has(scenario.id));

  function openProject(project: Project): void {
    const scenario = scenarioForWorkspace(project, scenarios);
    if (!scenario) {
      toast.error('This project has no scenario.');
      return;
    }
    setActiveScenario(scenario.id);
    window.location.assign(workspaceUrl(project.id, scenario.id));
  }

  function startRename(project: Project): void {
    setRenaming(project);
    setRenameValue(project.name);
  }

  async function handleRenameSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!renaming) return;
    const name = renameValue.trim();
    if (!name || name.length > 200) return;
    try {
      if (name !== renaming.name) {
        await renameProject(renaming.id, name, renaming.revision);
      }
      setRenaming(null);
    } catch (error) {
      toast.error(errorMessage(error));
    }
  }

  async function handleDuplicate(project: Project): Promise<void> {
    try {
      const copy = await duplicateProject(project.id);
      await loadScenarios();
      const opened = scenarioForWorkspace(copy, useScenarioStore.getState().scenarios);
      if (!opened) {
        toast.error('The duplicated project has no scenario.');
        return;
      }
      window.location.assign(workspaceUrl(copy.id, opened.id));
    } catch (error) {
      toast.error(errorMessage(error));
    }
  }

  async function handleConfirmDelete(): Promise<void> {
    if (!pendingDelete) return;
    const target = pendingDelete;
    try {
      await removeProject(target.id);
      await loadScenarios();
    } catch (error) {
      toast.error(errorMessage(error));
    }
  }

  const renameTrimmed = renameValue.trim();

  return (
    <AuthGuard>
      <div className="flex min-h-screen flex-col bg-slate-50">
        <AppNav />
        <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-6 py-8">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Projects</h1>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setView(view === 'compare' ? 'list' : 'compare')}
                className="text-slate-600"
              >
                {view === 'compare' ? 'Back to projects' : 'Compare across projects'}
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={() => navigate('/app/workspace?new=1')}
                className="bg-forge-primary text-white hover:bg-forge-primary-hover"
              >
                New project
              </Button>
            </div>
          </div>

          {view === 'list' ? (
            <>
              <div role="tablist" aria-label="Project ownership" className="flex gap-2">
                <button
                  type="button"
                  role="tab"
                  aria-selected={filter === 'mine'}
                  className={cn(
                    'rounded-full px-4 py-1.5 text-sm font-medium',
                    filter === 'mine'
                      ? 'bg-forge-primary text-white'
                      : 'bg-white text-slate-600 ring-1 ring-slate-200 hover:text-slate-900',
                  )}
                  onClick={() => setFilter('mine')}
                >
                  Mine
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={filter === 'everyone'}
                  className={cn(
                    'rounded-full px-4 py-1.5 text-sm font-medium',
                    filter === 'everyone'
                      ? 'bg-forge-primary text-white'
                      : 'bg-white text-slate-600 ring-1 ring-slate-200 hover:text-slate-900',
                  )}
                  onClick={() => setFilter('everyone')}
                >
                  Everyone&apos;s
                </button>
              </div>
              <div className="flex flex-col gap-3">
                {filteredProjects.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    {loadingProjects
                      ? 'Loading projects…'
                      : filter === 'mine'
                        ? 'No projects yet. Start a new project from the workspace.'
                        : 'No projects to show.'}
                  </p>
                ) : (
                  filteredProjects.map((project) => (
                    <ProjectCard
                      key={project.id}
                      project={project}
                      scenarioCount={scenarioCountByProject.get(project.id) ?? 0}
                      baseRatio={baseRatioForProject(project, scenarios)}
                      ownerName={ownerNameForProject(project, scenarios)}
                      isOwner={currentUserId !== null && project.user_id === currentUserId}
                      onOpen={openProject}
                      onRename={startRename}
                      onDuplicate={(item) => {
                        void handleDuplicate(item);
                      }}
                      onDelete={setPendingDelete}
                    />
                  ))
                )}
              </div>
            </>
          ) : (
            <div className="flex flex-col gap-6">
              <CompareSelector
                selectedIds={selectedIds}
                onSelectionChange={setSelectedIds}
                baselineId={baselineId}
                onBaselineChange={setBaselineId}
              />
              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2 text-sm text-slate-700">
                  <Checkbox
                    checked={showDelta}
                    onCheckedChange={(checked) => setShowDelta(checked === true)}
                    aria-label="Show Δ"
                  />
                  Show Δ
                </label>
                <label className="flex items-center gap-2 text-sm text-slate-700">
                  <Checkbox
                    checked={showPercentDelta}
                    onCheckedChange={(checked) => setShowPercentDelta(checked === true)}
                    aria-label="Show %Δ"
                  />
                  Show %Δ
                </label>
              </div>
              <ComparisonTable
                scenarios={selectedScenarios}
                baselineId={baselineId ?? ''}
                showDelta={showDelta}
                showPercentDelta={showPercentDelta}
              />
            </div>
          )}
        </main>

        <Dialog
          open={renaming !== null}
          onOpenChange={(open) => {
            if (!open) setRenaming(null);
          }}
        >
          <DialogContent>
            <form onSubmit={(event) => void handleRenameSubmit(event)}>
              <DialogHeader>
                <DialogTitle>Rename project</DialogTitle>
              </DialogHeader>
              <div className="grid gap-2 py-4">
                <Label htmlFor="project-rename">Name</Label>
                <Input
                  id="project-rename"
                  value={renameValue}
                  maxLength={200}
                  onChange={(event) => setRenameValue(event.target.value)}
                  autoFocus
                />
              </div>
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setRenaming(null)}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={!renameTrimmed || renameTrimmed.length > 200}>
                  Save
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        <ConfirmDialog
          open={pendingDelete !== null}
          onOpenChange={(open) => {
            if (!open) setPendingDelete(null);
          }}
          title="Delete project?"
          description="This deletes the project and all of its scenarios. This cannot be undone."
          confirmLabel="Delete"
          onConfirm={() => void handleConfirmDelete()}
        />
      </div>
    </AuthGuard>
  );
}
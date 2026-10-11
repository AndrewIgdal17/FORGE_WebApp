import { useState, useCallback } from 'react';
import type { FormEvent, ReactElement } from 'react';
import { ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
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
import { getDefaults } from '@/lib/api';
import {
  exportAsCsv,
  exportAsForge,
  useScenarioStore,
  type Scenario,
} from '@/stores/scenario-store';
import { ScenarioCard } from '@/components/scenarios/scenario-card';

export interface ScenarioListProps {
  onOpen: (scenario: Scenario) => void;
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

export function ScenarioList({
  onOpen,
}: ScenarioListProps): ReactElement {
  const scenarios = useScenarioStore((state) => state.scenarios);
  const loading = useScenarioStore((state) => state.loading);
  const renameScenario = useScenarioStore((state) => state.renameScenario);
  const duplicateScenario = useScenarioStore((state) => state.duplicateScenario);
  const deleteScenario = useScenarioStore((state) => state.deleteScenario);
  const { session } = useAuth();
  const currentUserId = session?.user.id ?? null;

  const [renaming, setRenaming] = useState<Scenario | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [pendingDelete, setPendingDelete] = useState<Scenario | null>(null);

  const examples = scenarios.filter((scenario) => scenario.source === 'paper');
  const yours = scenarios.filter(
    (scenario) =>
      scenario.source !== 'paper' &&
      currentUserId !== null &&
      scenario.user_id === currentUserId,
  );

  function startRename(scenario: Scenario): void {
    setRenaming(scenario);
    setRenameValue(scenario.name);
  }

  async function handleRenameSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!renaming) return;
    const name = renameValue.trim();
    if (!name) return;
    try {
      if (name !== renaming.name) {
        await renameScenario(renaming.id, name, renaming.revision);
      }
      setRenaming(null);
    } catch (error) {
      toast.error(errorMessage(error, 'Could not rename scenario'));
    }
  }

  async function handleDuplicate(scenario: Scenario): Promise<void> {
    try {
      const copy = await duplicateScenario(scenario.id);
      if (scenario.source === 'paper') onOpen(copy);
    } catch (error) {
      toast.error(errorMessage(error, 'Could not duplicate scenario'));
    }
  }

  async function handleConfirmDelete(): Promise<void> {
    if (!pendingDelete) return;
    const target = pendingDelete;
    try {
      await deleteScenario(target.id);
    } catch (error) {
      toast.error(errorMessage(error, 'Could not delete scenario'));
    }
  }

  async function handleExportForge(scenario: Scenario): Promise<void> {
    try {
      const { defaults, calculator } = await getDefaults();
      exportAsForge(scenario, defaults, calculator.defaults_id, calculator);
    } catch (error) {
      toast.error(errorMessage(error, 'Could not export scenario'));
    }
  }

  async function handleExportCsv(scenario: Scenario): Promise<void> {
    try {
      const { defaults } = await getDefaults();
      exportAsCsv(scenario, defaults);
    } catch (error) {
      toast.error(errorMessage(error, 'Could not export scenario'));
    }
  }

  const renameTrimmed = renameValue.trim();

  const [examplesOpen, setExamplesOpen] = useState(true);
  const [yoursOpen, setYoursOpen] = useState(true);

  const toggleExamples = useCallback(() => setExamplesOpen((v) => !v), []);
  const toggleYours = useCallback(() => setYoursOpen((v) => !v), []);

  return (
    <div className="flex flex-col gap-8">
      {examples.length > 0 ? (
        <section>
          <button
            type="button"
            onClick={toggleExamples}
            className="flex w-full items-center gap-2 rounded-lg px-1 py-1 text-left transition-colors hover:bg-slate-100"
          >
            <ChevronDown
              className={`size-4 text-slate-400 transition-transform ${examplesOpen ? '' : '-rotate-90'}`}
            />
            <h2 className="text-base font-bold text-slate-900">
              Examples
            </h2>
            <span className="text-xs text-slate-400">{examples.length}</span>
          </button>
          {examplesOpen && (
            <div className="mt-2 flex flex-col gap-2 border-l-2 border-slate-200 pl-3">
              {examples.map((scenario) => (
                <ScenarioCard
                  key={scenario.id}
                  scenario={scenario}
                  currentUserId={currentUserId}
                  onOpen={onOpen}
                  onRename={startRename}
                  onDuplicate={(item) => {
                    void handleDuplicate(item);
                  }}
                  onDelete={setPendingDelete}
                  onExportForge={(item) => {
                    void handleExportForge(item);
                  }}
                  onExportCsv={(item) => {
                    void handleExportCsv(item);
                  }}
                />
              ))}
            </div>
          )}
        </section>
      ) : null}

      <section>
        <button
          type="button"
          onClick={toggleYours}
          className="flex w-full items-center gap-2 rounded-lg px-1 py-1 text-left transition-colors hover:bg-slate-100"
        >
          <ChevronDown
            className={`size-4 text-slate-400 transition-transform ${yoursOpen ? '' : '-rotate-90'}`}
          />
          <h2 className="text-base font-bold text-slate-900">
            Your Scenarios
          </h2>
          <span className="text-xs text-slate-400">{yours.length}</span>
        </button>
        {yoursOpen && (
          <div className="mt-2 flex flex-col gap-2 border-l-2 border-slate-200 pl-3">
            {yours.length === 0 ? (
              <p className="py-2 text-sm text-muted-foreground">
                {loading
                  ? 'Loading scenarios…'
                  : 'No scenarios yet. Create one to get started.'}
              </p>
            ) : (
              yours.map((scenario) => (
                <ScenarioCard
                  key={scenario.id}
                  scenario={scenario}
                  currentUserId={currentUserId}
                  onOpen={onOpen}
                  onRename={startRename}
                  onDuplicate={(item) => {
                    void handleDuplicate(item);
                  }}
                  onDelete={setPendingDelete}
                  onExportForge={(item) => {
                    void handleExportForge(item);
                  }}
                  onExportCsv={(item) => {
                    void handleExportCsv(item);
                  }}
                />
              ))
            )}
          </div>
        )}
      </section>

      <Dialog
        open={renaming !== null}
        onOpenChange={(open) => {
          if (!open) setRenaming(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename Scenario</DialogTitle>
          </DialogHeader>
          <form className="grid gap-4" onSubmit={(event) => void handleRenameSubmit(event)}>
            <div className="grid gap-2">
              <Label htmlFor="rename-scenario-name">Name</Label>
              <Input
                id="rename-scenario-name"
                value={renameValue}
                onChange={(event) => setRenameValue(event.target.value)}
                autoComplete="off"
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setRenaming(null)}>
                Cancel
              </Button>
              <Button type="submit" disabled={!renameTrimmed}>
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
        title="Delete Scenario"
        description={
          pendingDelete
            ? `Delete "${pendingDelete.name}"? This cannot be undone.`
            : 'Delete this scenario? This cannot be undone.'
        }
        confirmLabel="Delete"
        variant="destructive"
        onConfirm={() => {
          void handleConfirmDelete();
        }}
      />
    </div>
  );
}

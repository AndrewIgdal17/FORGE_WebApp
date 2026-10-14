import { useEffect, useRef, useState } from 'react';
import type { ChangeEvent, ReactElement } from 'react';
import { useNavigate } from 'react-router';
import { AuthGuard } from '@/components/auth-guard';
import { AppNav } from '@/components/layout/app-nav';
import { Button } from '@/components/ui/button';
import { toast } from '@/hooks/use-toast';
import { getDefaults } from '@/lib/api';
import {
  importCsvFile,
  importForgeFile,
  useScenarioStore,
  type Scenario,
} from '@/stores/scenario-store';

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return 'Something went wrong';
}

export default function HomePage(): ReactElement {
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const scenarios = useScenarioStore((state) => state.scenarios);
  const loadScenarios = useScenarioStore((state) => state.loadScenarios);
  const createScenario = useScenarioStore((state) => state.createScenario);
  const duplicateScenario = useScenarioStore((state) => state.duplicateScenario);
  const setActiveScenario = useScenarioStore((state) => state.setActiveScenario);

  const [defaults, setDefaults] = useState<Record<string, unknown> | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    document.title = 'FORGE — Home';
  }, []);

  useEffect(() => {
    let cancelled = false;
    void loadScenarios().catch((error: unknown) => {
      if (!cancelled) toast.error(errorMessage(error));
    });
    void getDefaults()
      .then((response) => {
        if (!cancelled) setDefaults(response.defaults);
      })
      .catch((error: unknown) => {
        if (!cancelled) toast.error(errorMessage(error));
      });
    return () => {
      cancelled = true;
    };
  }, [loadScenarios]);

  async function handleFileSelected(event: ChangeEvent<HTMLInputElement>): Promise<void> {
    const input = event.currentTarget;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;

    const isCsv = file.name.toLowerCase().endsWith('.csv');
    if (isCsv && !defaults) {
      toast.error('Reference data is not loaded yet. Please wait a moment and try again.');
      return;
    }
    const loadedDefaults = defaults;

    setBusy(true);
    try {
      const text = await file.text();
      const draft =
        isCsv && loadedDefaults
          ? importCsvFile(text, file.name, loadedDefaults)
          : importForgeFile(text, file.name);
      const scenario = await createScenario(draft.name, draft.source, draft.changes);
      setActiveScenario(scenario.id);
      toast.success(`Imported "${scenario.name}"`);
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function handleDuplicate(scenario: Scenario): Promise<void> {
    setBusy(true);
    try {
      const copy = await duplicateScenario(scenario.id);
      setActiveScenario(copy.id);
      navigate('/app/workspace');
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  const examples = scenarios.filter((s) => s.source === 'paper');
  const hasScenarios = scenarios.length > 0;

  return (
    <AuthGuard>
      <div className="flex min-h-screen flex-col bg-slate-50">
        <AppNav />
        <main className="flex flex-1 flex-col items-center px-6 py-16 text-center">
          <h1 className="text-5xl font-bold tracking-tight text-forge-primary sm:text-6xl">
            FORGE
          </h1>
          <p className="mt-4 text-xl font-medium text-slate-800">
            Framework for Open Reproducible Grid Economics
          </p>
          <p className="mt-2 max-w-xl text-base leading-relaxed text-slate-600">
            Full-cost benefit-cost analysis for transmission projects
          </p>
          <div className="mt-10 flex w-full max-w-sm flex-col gap-2.5">
            <Button
              type="button"
              size="lg"
              disabled={busy}
              onClick={() => navigate('/app/workspace?new=1')}
              className="h-12 bg-forge-primary text-base font-semibold text-white shadow-md hover:bg-forge-primary-hover"
            >
              + New Scenario
            </Button>
            <div className="flex gap-2.5">
              <Button
                type="button"
                variant="outline"
                size="lg"
                disabled={busy}
                onClick={() => fileInputRef.current?.click()}
                className="h-10 flex-1 border-slate-300 bg-white text-sm text-slate-600 hover:border-forge-primary hover:text-forge-primary"
              >
                Load from File
              </Button>
              <Button
                type="button"
                variant="outline"
                size="lg"
                disabled={!hasScenarios}
                onClick={() => navigate('/app/scenarios-manager')}
                className="h-10 flex-1 border-slate-300 bg-white text-sm text-slate-600 hover:border-forge-primary hover:text-forge-primary disabled:border-slate-200 disabled:text-slate-400"
              >
                Go to Scenarios
              </Button>
            </div>
          </div>

          {examples.length > 0 && (
            <section className="mt-16 w-full max-w-2xl text-left">
              <h2 className="text-lg font-semibold text-slate-900">Examples</h2>
              <p className="mt-1 text-sm text-slate-500">
                Case studies from the research papers. Click to duplicate and explore.
              </p>
              <div className="mt-4 grid gap-2">
                {examples.map((scenario) => (
                  <button
                    key={scenario.id}
                    type="button"
                    disabled={busy}
                    onClick={() => void handleDuplicate(scenario)}
                    className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-4 py-3 text-left shadow-sm transition-colors hover:border-forge-primary hover:bg-forge-primary-light"
                  >
                    <span className="text-sm font-medium text-slate-900">
                      {scenario.name}
                    </span>
                    <span className="text-xs text-slate-500">Duplicate &amp; Edit →</span>
                  </button>
                ))}
              </div>
            </section>
          )}
        </main>
        <input
          ref={fileInputRef}
          type="file"
          accept=".forge,.csv,.json"
          className="hidden"
          aria-label="Load scenario from file"
          onChange={(event) => {
            void handleFileSelected(event);
          }}
        />
      </div>
    </AuthGuard>
  );
}

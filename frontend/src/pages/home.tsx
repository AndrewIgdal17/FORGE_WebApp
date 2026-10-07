import { useEffect, useRef, useState } from 'react';
import type { ChangeEvent, ReactElement } from 'react';
import { Link, useNavigate } from 'react-router';
import { AuthGuard } from '@/components/auth-guard';
import { AppNav } from '@/components/layout/app-nav';
import { ScenarioWizard } from '@/components/scenarios/scenario-wizard';
import { Button } from '@/components/ui/button';
import { toast } from '@/hooks/use-toast';
import { getDefaults } from '@/lib/api';
import { diffChanges } from '@/lib/changes';
import {
  importCsvFile,
  importForgeFile,
  useScenarioStore,
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
  const setActiveScenario = useScenarioStore((state) => state.setActiveScenario);

  const [wizardOpen, setWizardOpen] = useState(false);
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

  async function handleWizardComplete(
    name: string,
    fullInputs: Record<string, unknown>,
  ): Promise<void> {
    if (!defaults) {
      toast.error('Reference data is not loaded yet. Please wait a moment and try again.');
      return;
    }
    setBusy(true);
    try {
      const changes = diffChanges(defaults, fullInputs);
      const scenario = await createScenario(name, 'wizard', changes);
      setActiveScenario(scenario.id);
      navigate('/app/workspace');
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

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

  const scenariosDisabled = scenarios.length === 0;

  return (
    <AuthGuard>
      <div className="flex min-h-screen flex-col bg-slate-50">
        <AppNav />
        <main className="flex flex-1 flex-col items-center justify-center px-6 py-16 text-center">
          <h1 className="text-5xl font-bold tracking-tight text-forge-primary sm:text-6xl">
            FORGE
          </h1>
          <p className="mt-4 text-xl font-medium text-slate-800">
            Comprehensive Transmission Cost Calculator
          </p>
          <p className="mt-2 max-w-xl text-base leading-relaxed text-slate-600">
            Full-cost benefit-cost analysis for transmission projects
          </p>
          <div className="mt-10 flex w-full max-w-sm flex-col gap-3">
            <Button
              type="button"
              size="lg"
              disabled={defaults === null || busy}
              onClick={() => setWizardOpen(true)}
              className="h-11 bg-forge-primary text-base text-white hover:bg-forge-primary-hover"
            >
              + New Scenario
            </Button>
            <Button
              type="button"
              variant="outline"
              size="lg"
              disabled={busy}
              onClick={() => fileInputRef.current?.click()}
              className="h-11 border-forge-primary bg-white text-base text-forge-primary hover:bg-forge-primary-light hover:text-forge-primary"
            >
              Load from File
            </Button>
            {scenariosDisabled ? (
              <Button
                type="button"
                variant="outline"
                size="lg"
                disabled
                className="h-11 text-base"
              >
                Go to Scenarios
              </Button>
            ) : (
              <Button
                nativeButton={false}
                render={<Link to="/app/scenarios-manager" />}
                variant="outline"
                size="lg"
                className="h-11 border-forge-primary bg-white text-base text-forge-primary hover:bg-forge-primary-light hover:text-forge-primary"
              >
                Go to Scenarios
              </Button>
            )}
          </div>
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
        <ScenarioWizard
          open={wizardOpen}
          onOpenChange={setWizardOpen}
          defaultsSnapshot={defaults}
          onComplete={(name, fullInputs) => {
            void handleWizardComplete(name, fullInputs);
          }}
        />
      </div>
    </AuthGuard>
  );
}

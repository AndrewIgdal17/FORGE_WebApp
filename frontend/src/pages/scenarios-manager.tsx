import { useEffect, useRef, useState } from 'react';
import type { ChangeEvent, ReactElement } from 'react';
import { useSearchParams } from 'react-router';
import { AuthGuard } from '@/components/auth-guard';
import { AppNav } from '@/components/layout/app-nav';
import { CompareSelector } from '@/components/scenarios/compare-selector';
import { ScenarioList } from '@/components/scenarios/scenario-list';
import { Button } from '@/components/ui/button';
import { toast } from '@/hooks/use-toast';
import { getDefaults } from '@/lib/api';
import { cn } from '@/lib/utils';
import {
  importCsvFile,
  importForgeFile,
  useScenarioStore,
  type Scenario,
} from '@/stores/scenario-store';

type ManagerTab = 'manage' | 'compare';
type UploadKind = 'csv' | 'forge';

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return 'Something went wrong';
}

function uploadKind(fileName: string): UploadKind | null {
  const lower = fileName.toLowerCase();
  if (lower.endsWith('.csv')) return 'csv';
  if (lower.endsWith('.forge') || lower.endsWith('.json')) return 'forge';
  return null;
}

export default function ScenariosManagerPage(): ReactElement {
  const [searchParams] = useSearchParams();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const promptedUpload = useRef(false);

  const loadScenarios = useScenarioStore((state) => state.loadScenarios);
  const createScenario = useScenarioStore((state) => state.createScenario);
  const setActiveScenario = useScenarioStore((state) => state.setActiveScenario);

  const [tab, setTab] = useState<ManagerTab>('manage');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [baselineId, setBaselineId] = useState<string | null>(null);
  const [defaults, setDefaults] = useState<Record<string, unknown> | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    document.title = 'FORGE — Scenario Manager';
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

  useEffect(() => {
    if (promptedUpload.current) return;
    if (searchParams.get('upload') !== '1') return;
    promptedUpload.current = true;
    fileInputRef.current?.click();
  }, [searchParams]);

  function openWorkspace(scenario: Scenario): void {
    setActiveScenario(scenario.id);
    window.location.assign(`/app/workspace?scenario=${encodeURIComponent(scenario.id)}`);
  }

  function openNewScenario(): void {
    window.location.assign('/app/workspace?new=1');
  }

  async function handleFileSelected(event: ChangeEvent<HTMLInputElement>): Promise<void> {
    const input = event.currentTarget;
    const files = Array.from(input.files ?? []).sort((a, b) =>
      a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }),
    );
    input.value = '';
    if (files.length === 0) return;

    setBusy(true);
    try {
      for (const file of files) {
        const kind = uploadKind(file.name);
        if (!kind) {
          toast.error(`Unsupported file type: ${file.name}`);
          continue;
        }
        if (kind === 'csv' && !defaults) {
          toast.error('Reference data is not loaded yet. Please wait a moment and try again.');
          continue;
        }
        try {
          const text = await file.text();
          const draft =
            kind === 'csv' && defaults
              ? importCsvFile(text, file.name, defaults)
              : importForgeFile(text, file.name);
          const scenario = await createScenario(draft.name, draft.source, draft.changes);
          toast.success(`Imported "${scenario.name}"`);
        } catch (error) {
          toast.error(errorMessage(error));
        }
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthGuard>
      <div className="flex min-h-screen flex-col bg-slate-50">
        <AppNav />
        <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-6 py-8">
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Scenarios</h1>
          <div role="tablist" aria-label="Scenario manager" className="flex gap-2">
            <button
              type="button"
              role="tab"
              id="scenarios-tab-manage"
              aria-selected={tab === 'manage'}
              aria-controls="scenarios-panel-manage"
              className={cn(
                'rounded-full px-4 py-1.5 text-sm font-medium',
                tab === 'manage'
                  ? 'bg-forge-primary text-white'
                  : 'bg-white text-slate-600 ring-1 ring-slate-200 hover:text-slate-900',
              )}
              onClick={() => setTab('manage')}
            >
              Manage
            </button>
            <button
              type="button"
              role="tab"
              id="scenarios-tab-compare"
              aria-selected={tab === 'compare'}
              aria-controls="scenarios-panel-compare"
              className={cn(
                'rounded-full px-4 py-1.5 text-sm font-medium',
                tab === 'compare'
                  ? 'bg-forge-primary text-white'
                  : 'bg-white text-slate-600 ring-1 ring-slate-200 hover:text-slate-900',
              )}
              onClick={() => setTab('compare')}
            >
              Compare
            </button>
          </div>

          {tab === 'manage' ? (
            <div
              role="tabpanel"
              id="scenarios-panel-manage"
              aria-labelledby="scenarios-tab-manage"
              className="flex flex-col gap-4"
            >
              <div>
                <Button
                  type="button"
                  variant="outline"
                  disabled={busy}
                  onClick={() => fileInputRef.current?.click()}
                >
                  Upload Scenario
                </Button>
              </div>
              <ScenarioList onOpen={openWorkspace} onNewScenario={openNewScenario} />
            </div>
          ) : (
            <div
              role="tabpanel"
              id="scenarios-panel-compare"
              aria-labelledby="scenarios-tab-compare"
              className="flex flex-col gap-6"
            >
              <CompareSelector
                selectedIds={selectedIds}
                onSelectionChange={setSelectedIds}
                baselineId={baselineId}
                onBaselineChange={setBaselineId}
              />
              <div className="rounded-lg border border-dashed border-slate-300 bg-white px-6 py-10 text-center text-sm text-slate-500">
                Comparison table coming in Phase 2c
              </div>
            </div>
          )}
        </main>
        <input
          ref={fileInputRef}
          type="file"
          accept=".forge,.csv,.json"
          multiple
          className="hidden"
          aria-label="Upload scenario"
          onChange={(event) => {
            void handleFileSelected(event);
          }}
        />
      </div>
    </AuthGuard>
  );
}

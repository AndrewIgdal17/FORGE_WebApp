import { useCallback, useEffect, useState } from 'react';
import type { ReactElement } from 'react';
import type { Polygon } from 'geojson';
import { Navigate } from 'react-router';
import { AuthGuard } from '@/components/auth-guard';
import { AuditMap } from '@/components/audit/audit-map';
import { DecisionPanel } from '@/components/audit/decision-panel';
import { StatsPanel } from '@/components/audit/stats-panel';
import { AppNav } from '@/components/layout/app-nav';
import { useAuth } from '@/hooks/use-auth';
import {
  ApiError,
  decideAudit,
  getAuditNext,
  getAuditStats,
  isAuditMismatch,
  saveAuditPolygon,
} from '@/lib/api';
import type { AuditDecisionKind, AuditNextResponse, AuditStats } from '@/lib/api';

const AUDIT_ADMIN_EMAIL = 'andrewigdal17@gmail.com';

function errorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    const body = error.body;
    if (body && typeof body === 'object' && 'detail' in body) {
      const detail = (body as { detail: unknown }).detail;
      if (typeof detail === 'string' && detail.length > 0) return detail;
    }
    return error.message;
  }
  if (error instanceof Error && error.message) return error.message;
  return 'Request failed';
}

function decisionWasStored(error: unknown): boolean {
  if (!(error instanceof ApiError)) return false;
  if (error.status === 409) return true;
  return error.status === 500 && error.message.includes('Decision saved');
}

function AuditContent(): ReactElement {
  const { session } = useAuth();
  const [queue, setQueue] = useState<AuditNextResponse | null>(null);
  const [stats, setStats] = useState<AuditStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [deciding, setDeciding] = useState(false);
  const [drawing, setDrawing] = useState(false);
  const [draftPolygon, setDraftPolygon] = useState<Polygon | null>(null);
  const [savingPolygon, setSavingPolygon] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statsError, setStatsError] = useState<string | null>(null);
  const isAdmin = session?.user?.email === AUDIT_ADMIN_EMAIL;
  const mismatch = queue && isAuditMismatch(queue) ? queue : null;
  const mismatchKey = mismatch ? `${mismatch.corridor_gid}:${mismatch.endpoint}` : '';

  const handleDraftPolygon = useCallback((polygon: Polygon | null) => {
    setDraftPolygon(polygon);
  }, []);

  useEffect(() => {
    setDrawing(false);
    setDraftPolygon(null);
  }, [mismatchKey]);

  useEffect(() => {
    if (!isAdmin) return;
    let cancelled = false;

    void (async () => {
      const [nextResult, statsResult] = await Promise.allSettled([
        getAuditNext(),
        getAuditStats(),
      ]);
      if (cancelled) return;
      if (nextResult.status === 'fulfilled') {
        setQueue(nextResult.value);
        setError(null);
      } else {
        setError(errorMessage(nextResult.reason));
      }
      if (statsResult.status === 'fulfilled') {
        setStats(statsResult.value);
        setStatsError(null);
      } else {
        setStatsError(errorMessage(statsResult.reason));
      }
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [isAdmin]);

  if (!isAdmin) {
    return <Navigate to="/app" replace />;
  }

  const done = queue?.done === true;

  async function handleDecide(decision: AuditDecisionKind, customName?: string): Promise<void> {
    if (!mismatch || deciding || drawing || savingPolygon) return;
    setDeciding(true);
    setError(null);
    try {
      const response = await decideAudit({
        corridor_gid: mismatch.corridor_gid,
        endpoint: mismatch.endpoint,
        decision,
        ...(decision === 'relabel' ? { custom_name: customName ?? '' } : {}),
      });
      setStats(response.stats);
      setStatsError(null);
      setQueue(response.next);
    } catch (err) {
      const stored = decisionWasStored(err);
      if (!stored) {
        setError(errorMessage(err));
        return;
      }
      try {
        const [next, nextStats] = await Promise.all([getAuditNext(), getAuditStats()]);
        setQueue(next);
        setStats(nextStats);
        setStatsError(null);
        setError(err instanceof ApiError && err.status === 409 ? null : errorMessage(err));
      } catch {
        setError(errorMessage(err));
      }
    } finally {
      setDeciding(false);
    }
  }

  function handleStartDraw(): void {
    if (!mismatch || deciding || savingPolygon) return;
    setError(null);
    setDraftPolygon(null);
    setDrawing(true);
  }

  function handleCancelDraw(): void {
    if (savingPolygon) return;
    setDrawing(false);
    setDraftPolygon(null);
  }

  async function handleSavePolygon(): Promise<void> {
    if (!mismatch || !draftPolygon || savingPolygon) return;
    const corridorGid = mismatch.corridor_gid;
    const endpoint = mismatch.endpoint;
    setSavingPolygon(true);
    setError(null);
    try {
      const saved = await saveAuditPolygon({
        sub_gid: mismatch.sub_gid,
        polygon: draftPolygon,
      });
      setQueue((current) => {
        if (!current || !isAuditMismatch(current)) return current;
        if (current.corridor_gid !== corridorGid || current.endpoint !== endpoint) return current;
        return {
          ...current,
          sub_geojson: saved.sub_geojson,
          sub_area_sqm: saved.sub_area_sqm,
        };
      });
      setDrawing(false);
      setDraftPolygon(null);
      try {
        const refreshed = await getAuditNext({ corridorGid, endpoint });
        if (
          isAuditMismatch(refreshed) &&
          refreshed.corridor_gid === corridorGid &&
          refreshed.endpoint === endpoint
        ) {
          setQueue(refreshed);
        }
      } catch (refreshError) {
        setError(`Polygon saved. ${errorMessage(refreshError)}`);
      }
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSavingPolygon(false);
    }
  }

  return (
    <div className="flex h-screen flex-col bg-slate-50">
      <AppNav />
      <div className="flex min-h-0 flex-1">
        <aside className="w-80 shrink-0 border-r border-black/[0.08]">
          <DecisionPanel
            mismatch={mismatch}
            done={done}
            loading={loading}
            deciding={deciding}
            reviewed={stats?.n_decisions ?? 0}
            error={error}
            drawing={drawing}
            draftReady={draftPolygon !== null}
            savingPolygon={savingPolygon}
            onDecide={(decision, customName) => {
              void handleDecide(decision, customName);
            }}
            onStartDraw={handleStartDraw}
            onSavePolygon={() => {
              void handleSavePolygon();
            }}
            onCancelDraw={handleCancelDraw}
          />
        </aside>
        <div className="relative min-w-0 flex-1">
          <AuditMap
            corridor={mismatch?.corridor_geojson ?? null}
            endpoint={mismatch?.endpoint_geojson ?? null}
            substation={mismatch?.sub_geojson ?? null}
            fitToken={mismatchKey}
            drawing={drawing}
            onDraftPolygon={handleDraftPolygon}
          />
        </div>
        <aside className="w-[360px] shrink-0 border-l border-black/[0.08]">
          <StatsPanel stats={stats} loading={loading} error={statsError} />
        </aside>
      </div>
    </div>
  );
}

export default function AuditPage(): ReactElement {
  return (
    <AuthGuard>
      <AuditContent />
    </AuthGuard>
  );
}

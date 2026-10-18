import { useEffect, useState } from 'react';
import type { ReactElement } from 'react';
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
} from '@/lib/api';
import type { AuditNextResponse, AuditStats, PhaseADecision } from '@/lib/api';

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
  const [error, setError] = useState<string | null>(null);
  const [statsError, setStatsError] = useState<string | null>(null);
  const isAdmin = session?.user?.email === AUDIT_ADMIN_EMAIL;
  const mismatch = queue && isAuditMismatch(queue) ? queue : null;
  const mismatchKey = mismatch ? String(mismatch.sub_gid) : '';

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

  async function handleDecide(decision: PhaseADecision): Promise<void> {
    if (!mismatch || deciding) return;
    setDeciding(true);
    setError(null);
    try {
      const response = await decideAudit({
        sub_gid: mismatch.sub_gid,
        decision,
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

  return (
    <div className="flex h-screen flex-col bg-slate-50">
      <AppNav />
      <div className="flex h-12 items-center border-b border-black/[0.08] bg-white px-4">
        <h1 className="text-sm font-semibold tracking-wide text-black/70">
          PHASE A — SUBSTATION IDENTITY
        </h1>
        <span className="ml-2 rounded bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
          {stats ? `${stats.remaining} remaining` : ''}
        </span>
      </div>
      <div className="flex min-h-0 flex-1">
        <aside className="w-80 shrink-0 border-r border-black/[0.08]">
          <DecisionPanel
            mismatch={mismatch}
            done={done}
            loading={loading}
            deciding={deciding}
            reviewed={stats?.n_decisions ?? 0}
            error={error}
            onDecide={(decision) => {
              void handleDecide(decision);
            }}
          />
        </aside>
        <div className="relative min-w-0 flex-1">
          <AuditMap
            hifld={mismatch?.hifld_geojson ?? null}
            osm={mismatch?.osm_geojson ?? null}
            fitToken={mismatchKey}
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

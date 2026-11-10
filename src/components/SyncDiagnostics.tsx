'use client';

import { useEffect, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { getDb } from '@/lib/db';
import { useOnline } from '@/lib/hooks';
import { createClient } from '@/lib/supabase/client';
import { flushDirty, localDelete, pullAll } from '@/lib/sync';
import { isEmptySession } from '@/lib/sessionStatus';
import {
  clearSyncErrors,
  recordSyncError,
  useSyncErrors,
} from '@/lib/syncDiagnostics';

/**
 * On-screen sync inspector — shows authed user, pending writes, recent push
 * errors, and lets the user force a flush / run a write test / clear an
 * orphaned dirty queue. Rendered at the top of /program.
 *
 * Auto-expanded when there are pending writes or errors so users notice it
 * without hunting; otherwise collapsed to stay out of the way.
 */
export function SyncDiagnostics() {
  const online = useOnline();
  const errors = useSyncErrors();
  const dirty = useLiveQuery(() => getDb().dirty.toArray(), []);
  const sessions = useLiveQuery(() => getDb().session_logs.toArray(), []);
  const sets = useLiveQuery(() => getDb().set_logs.toArray(), []);
  const readinessLogs = useLiveQuery(() => getDb().readiness_logs.toArray(), []);
  const [userId, setUserId] = useState<string | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<string | null>(null);
  const [userCollapsed, setUserCollapsed] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data } = await createClient().auth.getUser();
        if (!cancelled) {
          setUserId(data?.user?.id ?? null);
          setAuthChecked(true);
        }
      } catch {
        if (!cancelled) setAuthChecked(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const pendingByTable = useMemo(() => {
    const m = new Map<string, number>();
    for (const d of dirty ?? []) m.set(d.table, (m.get(d.table) ?? 0) + 1);
    return Array.from(m.entries()).sort((a, b) => b[1] - a[1]);
  }, [dirty]);

  const pendingTotal = dirty?.length ?? 0;
  const emptySessions = useMemo(() => {
    if (!sessions || !sets || !readinessLogs) return [];
    return sessions.filter((session) => isEmptySession(session, sets, readinessLogs));
  }, [sessions, sets, readinessLogs]);
  const emptySessionRange = useMemo(
    () => emptySessionDateRange(emptySessions.map((session) => session.date)),
    [emptySessions],
  );
  const hasIssues = pendingTotal > 0 || errors.length > 0;
  const defaultCollapsed = !hasIssues;
  const collapsed = userCollapsed ?? defaultCollapsed;

  async function onForceSync() {
    setBusy('Syncing…');
    try {
      await flushDirty();
      await pullAll();
      await flushDirty();
      setBusy('Sync complete');
    } catch (e) {
      setBusy(`Sync failed: ${(e as Error).message}`);
    } finally {
      window.setTimeout(() => setBusy(null), 4000);
    }
  }

  async function onTestSync() {
    setTestResult('Running…');
    const lines: string[] = [];
    try {
      const supabase = createClient();
      const { data, error: userErr } = await supabase.auth.getUser();
      if (userErr || !data?.user) {
        lines.push(`✗ Not authenticated${userErr ? `: ${userErr.message}` : ''}`);
        setTestResult(lines.join('\n'));
        recordSyncError({
          phase: 'push',
          message: `test write — not authed${userErr ? `: ${userErr.message}` : ''}`,
        });
        return;
      }
      const user = data.user;
      lines.push(`✓ Authed as ${user.id.slice(0, 8)}…`);

      const testId = `diag-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      const { error: writeErr } = await supabase.from('bodyweight_logs').upsert({
        id: testId,
        user_id: user.id,
        date: '1970-01-01',
        iso_week: '1970-W01',
        bodyweight: 0,
      });
      if (writeErr) {
        const code = (writeErr as { code?: string }).code;
        const status = (writeErr as { status?: number }).status;
        lines.push(`✗ Write blocked: ${writeErr.message}`);
        if (code) lines.push(`  code: ${code}`);
        if (status != null) lines.push(`  status: ${status}`);
        setTestResult(lines.join('\n'));
        recordSyncError({
          phase: 'push',
          table: 'bodyweight_logs',
          rowId: testId,
          message: writeErr.message,
          code,
          status,
        });
        return;
      }
      lines.push('✓ Direct write to Supabase succeeded');

      const { error: deleteErr } = await supabase
        .from('bodyweight_logs')
        .delete()
        .eq('id', testId);
      if (deleteErr) {
        lines.push(`⚠ Cleanup failed: ${deleteErr.message}`);
      } else {
        lines.push('✓ Cleanup ok — sync to Supabase is working');
      }
      setTestResult(lines.join('\n'));
    } catch (e) {
      lines.push(`✗ Test errored: ${(e as Error).message}`);
      setTestResult(lines.join('\n'));
    }
  }

  async function onRemoveEmptySessions() {
    const db = getDb();
    const [sessionRows, setRows, readinessRows] = await Promise.all([
      db.session_logs.toArray(),
      db.set_logs.toArray(),
      db.readiness_logs.toArray(),
    ]);
    const targets = sessionRows.filter((session) =>
      isEmptySession(session, setRows, readinessRows),
    );
    if (targets.length === 0) return;
    const n = targets.length;
    const range = emptySessionDateRange(targets.map((session) => session.date));
    const ok = window.confirm(
      `Remove ${n} empty session${n === 1 ? '' : 's'} (${range})? ` +
        'Sessions with sets, a readiness log, a note, or a skipped status are kept. ' +
        'Deletions sync to your account.',
    );
    if (!ok) return;
    setBusy('Removing empty sessions…');
    try {
      for (const session of targets) {
        const fresh = await db.session_logs.get(session.id);
        if (!fresh) continue;
        const [freshSets, freshReadiness] = await Promise.all([
          db.set_logs.where('sessionLogId').equals(session.id).toArray(),
          db.readiness_logs.where('sessionLogId').equals(session.id).toArray(),
        ]);
        if (!isEmptySession(fresh, freshSets, freshReadiness)) continue;
        await localDelete('session_logs', fresh.id);
      }
      setBusy('Empty sessions removed');
    } catch (e) {
      setBusy(`Remove failed: ${(e as Error).message}`);
    } finally {
      window.setTimeout(() => setBusy(null), 4000);
    }
  }

  async function onClearQueue() {
    const ok = window.confirm(
      `Clear ${pendingTotal} pending write${pendingTotal === 1 ? '' : 's'}? ` +
        'Anything that has never reached Supabase will be lost from this device. ' +
        'Only do this if the queue is stuck with errors.',
    );
    if (!ok) return;
    setBusy('Clearing queue…');
    try {
      await getDb().dirty.clear();
      setBusy('Queue cleared');
    } catch (e) {
      setBusy(`Clear failed: ${(e as Error).message}`);
    } finally {
      window.setTimeout(() => setBusy(null), 3000);
    }
  }

  return (
    <div className="rounded-2xl bg-zinc-900 border border-zinc-800 overflow-hidden">
      <button
        type="button"
        onClick={() => setUserCollapsed(!collapsed)}
        className="w-full flex items-center justify-between px-4 py-3 text-left"
      >
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-sm font-medium text-zinc-100">Sync diagnostics</span>
          {pendingTotal > 0 && (
            <span className="text-[10px] font-medium text-amber-300 border border-amber-700/60 rounded-full px-1.5 py-0.5 shrink-0">
              {pendingTotal} pending
            </span>
          )}
          {errors.length > 0 && (
            <span className="text-[10px] font-medium text-rose-300 border border-rose-800/60 rounded-full px-1.5 py-0.5 shrink-0">
              {errors.length} error{errors.length === 1 ? '' : 's'}
            </span>
          )}
          {emptySessions.length > 0 && (
            <span className="text-[10px] font-medium text-zinc-300 border border-zinc-700 rounded-full px-1.5 py-0.5 shrink-0">
              {emptySessions.length} empty
            </span>
          )}
        </div>
        <span className="text-zinc-600 text-xs ml-2 shrink-0">{collapsed ? '▼' : '▲'}</span>
      </button>

      {!collapsed && (
        <div className="border-t border-zinc-800 p-4 space-y-4 text-sm">
          <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
            <div>
              <span className="text-zinc-500">User ID</span>
              <div className="font-mono text-zinc-300 truncate">
                {authChecked ? userId ?? '(none — sign in again)' : 'checking…'}
              </div>
            </div>
            <div>
              <span className="text-zinc-500">Network</span>
              <div className={online ? 'text-emerald-400' : 'text-amber-400'}>
                {online ? 'online' : 'offline'}
              </div>
            </div>
            <div>
              <span className="text-zinc-500">Pending writes</span>
              <div className="font-mono text-zinc-200">{pendingTotal}</div>
            </div>
            <div>
              <span className="text-zinc-500">Recent errors</span>
              <div className="font-mono text-zinc-200">{errors.length}</div>
            </div>
          </div>

          {pendingByTable.length > 0 && (
            <div className="space-y-1">
              <div className="text-xs uppercase tracking-wider text-zinc-500">
                Pending by table
              </div>
              <ul className="text-xs space-y-1">
                {pendingByTable.map(([t, n]) => (
                  <li key={t} className="flex justify-between text-zinc-400">
                    <span className="font-mono">{t}</span>
                    <span className="font-mono">{n}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void onForceSync()}
              className="h-9 px-3 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs"
            >
              Force sync now
            </button>
            <button
              type="button"
              onClick={() => void onTestSync()}
              className="h-9 px-3 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs"
            >
              Run sync test
            </button>
            {pendingTotal > 0 && (
              <button
                type="button"
                onClick={() => void onClearQueue()}
                className="h-9 px-3 rounded-lg bg-rose-950/60 hover:bg-rose-900/60 border border-rose-800/50 text-rose-200 text-xs"
              >
                Clear stuck queue
              </button>
            )}
            {errors.length > 0 && (
              <button
                type="button"
                onClick={() => clearSyncErrors()}
                className="h-9 px-3 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-400 text-xs"
              >
                Clear error log
              </button>
            )}
          </div>

          {emptySessions.length > 0 && (
            <div className="space-y-2 rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-3">
              <div className="text-xs text-zinc-400">
                {emptySessions.length} empty session{emptySessions.length === 1 ? '' : 's'}
                {' · '}
                {emptySessionRange}
              </div>
              <button
                type="button"
                onClick={() => void onRemoveEmptySessions()}
                className="h-9 px-3 rounded-lg bg-rose-950/60 hover:bg-rose-900/60 border border-rose-800/50 text-rose-200 text-xs"
              >
                Remove {emptySessions.length} empty session{emptySessions.length === 1 ? '' : 's'}
              </button>
            </div>
          )}

          {busy && <div className="text-xs text-zinc-400">{busy}</div>}
          {testResult && (
            <pre className="text-[11px] text-zinc-300 bg-zinc-950 border border-zinc-800 rounded-lg p-2 whitespace-pre-wrap font-mono">
              {testResult}
            </pre>
          )}

          {errors.length > 0 && (
            <div className="space-y-1">
              <div className="text-xs uppercase tracking-wider text-zinc-500">
                Recent errors (newest first)
              </div>
              <ul className="space-y-1.5 max-h-72 overflow-y-auto">
                {errors.map((e, i) => (
                  <li
                    key={`${e.ts}-${i}`}
                    className="rounded-lg border border-zinc-800 bg-zinc-950 px-2 py-1.5 text-[11px]"
                  >
                    <div className="flex justify-between text-zinc-500">
                      <span className="font-mono">
                        {e.phase}
                        {e.table ? ` · ${e.table}` : ''}
                      </span>
                      <span className="font-mono">
                        {new Date(e.ts).toLocaleTimeString()}
                      </span>
                    </div>
                    {e.rowId && (
                      <div className="text-zinc-500 font-mono break-all">id: {e.rowId}</div>
                    )}
                    <div className="text-rose-300 break-words">{e.message}</div>
                    {(e.code || e.status != null) && (
                      <div className="text-zinc-500 font-mono">
                        {e.code && <span>code: {e.code} </span>}
                        {e.status != null && <span>status: {e.status}</span>}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function emptySessionDateRange(dates: string[]): string {
  if (dates.length === 0) return '';
  const sorted = [...dates].sort();
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  return first === last ? first : `${first} – ${last}`;
}

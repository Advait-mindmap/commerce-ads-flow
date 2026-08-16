/**
 * Reconciliation for calls the webhook never settled.
 *
 * The webhook is the primary path — the provider pushes each status change and
 * server/webhooks.js settles the run from that event. This exists only as a
 * safety net: a delivery can be dropped, retried past its window, or sent while
 * the app is restarting, and without reconciliation that call sits on the
 * console forever with no duration and no outcome.
 *
 * It deliberately waits before touching anything, so it never races the webhook
 * for a call that is about to be pushed normally.
 */

import { q, rowToObject, tableFor } from './db.js';
import * as voice from './voice.js';
import { patchRow, settleRun } from './call-settlement.js';

const table = (entity) => tableFor(entity);

// How stale a pending call must be before reconciliation looks at it. Longer
// than a normal call plus the provider's retry window.
const RECONCILE_AFTER_MS = 3 * 60 * 1000;
// A call the provider never publishes is closed rather than left pending.
const GIVE_UP_AFTER_MS = 20 * 60 * 1000;

export async function pollLiveCalls() {
  if (!voice.isConfigured()) return 0;

  const { rows } = await q(
    `SELECT * FROM ${table('AgentRun')}
     WHERE data->>'status' IN ('queued', 'in_progress')
       AND data->>'provider_call_id' IS NOT NULL
     LIMIT 25`
  );

  const now = Date.now();
  const stale = rows
    .map(rowToObject)
    .filter((r) => now - new Date(r.started_at || 0).getTime() > RECONCILE_AFTER_MS);

  let settled = 0;

  for (const run of stale) {
    try {
      const execution = await voice.fetchExecution(run.provider_call_id);

      if (!execution) {
        const age = now - new Date(run.started_at || 0).getTime();
        if (age > GIVE_UP_AFTER_MS) {
          await patchRow('AgentRun', run.id, {
            status: 'completed',
            outcome: 'failed',
            ended_at: new Date().toISOString(),
            settled_by: 'reconciliation'
          });
          settled += 1;
        }
        continue;
      }

      const result = await settleRun(run, voice.readExecution(execution), { source: 'reconciliation' });
      if (result.settled) {
        console.warn(`[reconcile] settled ${run.id} that no webhook delivered — outcome ${result.outcome}`);
        settled += 1;
      }
    } catch (err) {
      console.error('[reconcile] failed for run', run.id, err.message);
    }
  }

  return settled;
}

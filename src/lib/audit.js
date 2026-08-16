import { api } from '@/api/client';

// Resolved on first use rather than at import: at module-load time nobody is
// signed in yet, so an eager call would pin the actor to the fallback name.
let actorPromise = null;

function currentActor() {
  if (!actorPromise) {
    actorPromise = api.auth
      .me()
      .then((u) => u.full_name || u.email || 'Rep')
      .catch(() => 'Rep');
  }
  return actorPromise;
}

export async function logAudit({ action, entity_type, entity_id, entity_name, summary, before_value, after_value, actor_type = 'human_rep' }) {
  const actorName = await currentActor();
  return api.entities.AuditLog.create({
    actor_type,
    actor_name: actorName,
    action,
    entity_type,
    entity_id,
    entity_name,
    summary,
    before_value: before_value != null ? String(before_value) : undefined,
    after_value: after_value != null ? String(after_value) : undefined,
    timestamp: new Date().toISOString()
  });
}
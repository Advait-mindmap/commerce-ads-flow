import { base44 } from '@/api/base44Client';

let actorName = 'Rep';
base44.auth.me().then((u) => { actorName = u.full_name || u.email || 'Rep'; }).catch(() => {});

export function logAudit({ action, entity_type, entity_id, entity_name, summary, before_value, after_value, actor_type = 'human_rep' }) {
  return base44.entities.AuditLog.create({
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
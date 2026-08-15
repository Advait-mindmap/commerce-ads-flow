import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const { lead_id, channel = 'voice' } = body;
    if (!lead_id) return Response.json({ error: 'lead_id is required' }, { status: 400 });

    const svc = base44.asServiceRole;
    const lead = await svc.entities.Lead.get(lead_id);
    if (!lead) return Response.json({ allowed: false, reason: 'Lead not found' });

    const seller = lead.seller_id ? await svc.entities.Seller.get(lead.seller_id).catch(() => null) : null;
    let contact = null;
    if (lead.contact_id) contact = await svc.entities.Contact.get(lead.contact_id).catch(() => null);
    if (!contact && lead.seller_id) {
      const cs = await svc.entities.Contact.filter({ seller_id: lead.seller_id });
      contact = cs.find((c) => c.is_primary) || cs[0] || null;
    }

    const now = new Date();
    const istHour = new Date(now.getTime() + 5.5 * 3600000).getUTCHours();
    const dayMs = 86400000;

    let reason = null;

    if (contact && contact.dnd_flag) reason = 'Contact is on the DND registry';
    else if (channel === 'voice' && contact && !contact.consent_voice) reason = 'No voice consent on record';
    else if (channel === 'whatsapp' && contact && !contact.consent_whatsapp) reason = 'No WhatsApp consent on record';
    else if (seller && (seller.status === 'suspended' || seller.status === 'churned')) reason = `Seller account is ${seller.status}`;
    else if (istHour < 9 || istHour >= 20) reason = 'Outside permitted calling hours (09:00–20:00 IST)';

    if (!reason) {
      const sups = await svc.entities.Suppression.filter({ seller_id: lead.seller_id });
      const contactSups = contact ? await svc.entities.Suppression.filter({ contact_id: contact.id }) : [];
      const active = [...sups, ...contactSups].find((s) => {
        const chOk = s.channel === 'all' || s.channel === channel;
        const notExpired = !s.expires_at || new Date(s.expires_at).getTime() > now.getTime();
        return chOk && notExpired;
      });
      if (active) reason = `Active suppression: ${active.reason}`;
    }

    if (!reason) {
      const recent = await svc.entities.Interaction.filter({ seller_id: lead.seller_id }, '-started_at', 20);
      const within7 = recent.find((i) => i.started_at && now.getTime() - new Date(i.started_at).getTime() < 7 * dayMs);
      if (within7) reason = 'Contacted within the last 7 days (frequency cap)';
    }

    if (!reason && lead.stage === 'disqualified') {
      const ref = lead.updated_date || lead.created_date;
      if (ref && now.getTime() - new Date(ref).getTime() < 90 * dayMs) reason = 'Disqualified within the last 90 days';
    }

    if (!reason && (lead.agent_attempts || 0) >= 4) {
      const lastTouch = lead.last_agent_contact_at ? new Date(lead.last_agent_contact_at).getTime() : 0;
      if (now.getTime() - lastTouch < 30 * dayMs) reason = 'Maximum 4 agent attempts reached in the last 30 days';
    }

    if (reason) {
      await svc.entities.AuditLog.create({
        actor_type: 'system',
        actor_name: 'Suppression Engine',
        action: 'outreach_blocked',
        entity_type: 'Lead',
        entity_id: lead.id,
        entity_name: lead.seller_name,
        summary: `${channel} outreach blocked: ${reason}`,
        timestamp: now.toISOString()
      });
      return Response.json({ allowed: false, reason });
    }

    return Response.json({ allowed: true, reason: 'All suppression checks passed' });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}
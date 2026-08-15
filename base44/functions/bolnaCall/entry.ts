import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { secrets } from 'base44:runtime';
import { normalizePhone, extractCallId } from '../../shared/bolna.ts';

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const { lead_id } = body;
    if (!lead_id) return Response.json({ error: 'lead_id is required' }, { status: 400 });

    const svc = base44.asServiceRole;
    const lead = await svc.entities.Lead.get(lead_id);
    if (!lead) return Response.json({ error: 'Lead not found' }, { status: 404 });

    const seller = lead.seller_id ? await svc.entities.Seller.get(lead.seller_id).catch(() => null) : null;
    let contact = null;
    if (lead.contact_id) contact = await svc.entities.Contact.get(lead.contact_id).catch(() => null);
    if (!contact && lead.seller_id) {
      const cs = await svc.entities.Contact.filter({ seller_id: lead.seller_id });
      contact = cs.find((c) => c.is_primary) || cs[0] || null;
    }

    // Mandatory suppression gate — never dial before this passes.
    const supRes = await base44.functions.invoke('checkSuppression', { lead_id, channel: 'voice' });
    const sup = supRes && supRes.data ? supRes.data : supRes;
    if (!sup || sup.allowed !== true) {
      return Response.json({ blocked: true, reason: (sup && sup.reason) || 'Suppression check failed' });
    }

    const phone = normalizePhone(lead.contact_phone || (contact && contact.phone));
    if (!phone) return Response.json({ error: 'Invalid phone number — could not resolve 10 digits' }, { status: 400 });

    const reasons = (seller && seller.pta_reasons) || lead.pta_reasons || [];
    const growth = seller ? Math.abs(Math.round((seller.gmv_growth_30 || 0) * 100)) : 0;
    const liveVariant = 'v3_signal_open';

    const payload = {
      agent_id: secrets.get('BOLNA_AGENT_ID'),
      recipient_phone_number: phone,
      user_data: {
        seller_name: lead.seller_name || (seller && seller.display_name) || '',
        contact_name: lead.contact_name || (contact && contact.full_name) || '',
        category: lead.category || (seller && seller.category) || '',
        tenure_months: String(Math.round(((seller && seller.tenure_days) || 0) / 30)),
        signal_headline: reasons[0] || '',
        signal_detail: reasons[1] || '',
        organic_decline_pct: String(Math.round(((seller && seller.organic_impr_decline) || 0) * 100)),
        sku_added_30d: String((seller && seller.sku_added_30d) || 0),
        gmv_trend: (seller && seller.gmv_growth_30) > 0 ? `up ${growth}% month on month` : `down ${growth}% month on month`,
        budget_band: `${lead.budget_low || 0} to ${lead.budget_stretch || (seller && seller.budget_stretch) || 0}`,
        language: (contact && contact.preferred_language) || 'Hindi',
        script_variant: liveVariant
      }
    };

    const resp = await fetch('https://api.bolna.dev/call', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${secrets.get('BOLNA_API_KEY')}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    const text = await resp.text();
    let data = {};
    try { data = JSON.parse(text); } catch (_e) { data = { raw: text }; }

    if (!resp.ok) {
      return Response.json({ error: 'Bolna call failed', status: resp.status, details: data }, { status: 502 });
    }

    const callId = extractCallId(data);
    const startedAt = new Date().toISOString();

    const agentRun = await svc.entities.AgentRun.create({
      agent_key: 'sdr_qualification',
      lead_id: lead.id,
      seller_id: lead.seller_id,
      seller_name: lead.seller_name,
      contact_phone: phone,
      channel: 'voice_out',
      bolna_call_id: callId,
      call_status: 'queued',
      status: 'queued',
      started_at: startedAt,
      script_variant: liveVariant,
      language: payload.user_data.language
    });

    await svc.entities.Lead.update(lead.id, {
      agent_attempts: (lead.agent_attempts || 0) + 1,
      last_agent_contact_at: startedAt
    });

    return Response.json({ agent_run_id: agentRun.id, call_id: callId, status: 'queued' });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}
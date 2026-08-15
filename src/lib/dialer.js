import { base44 } from '@/api/base44Client';

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export async function dialOne(leadIdOrLead) {
  const lead_id = typeof leadIdOrLead === 'object' ? leadIdOrLead?.id || leadIdOrLead?.lead_id : leadIdOrLead;

  if (!lead_id) {
    return {
      lead_id: null,
      status: 'failed',
      error: 'No lead ID supplied for bolnaCall',
      data: null
    };
  }

  try {
    const res = await base44.functions.invoke('bolnaCall', { lead_id });
    const data = res && typeof res === 'object' && 'data' in res ? res.data : res;

    if (data && data.blocked) {
      return {
        lead_id,
        status: 'blocked',
        reason: data.reason || data.suppression_reason || 'Suppressed by policy',
        data
      };
    }

    if (data && data.error) {
      return {
        lead_id,
        status: 'failed',
        error: data.error,
        data
      };
    }

    if (data && data.agent_run_id) {
      return {
        lead_id,
        status: 'dialled',
        agent_run_id: data.agent_run_id,
        data
      };
    }

    if (data && data.id) {
      return {
        lead_id,
        status: 'dialled',
        agent_run_id: data.id,
        data
      };
    }

    return {
      lead_id,
      status: 'dialled',
      data
    };
  } catch (error) {
    return {
      lead_id,
      status: 'failed',
      error: error?.message || 'Unexpected bolnaCall error',
      data: null,
      exception: error
    };
  }
}

export async function dialSequentially(leads, onProgress) {
  const results = [];
  const items = Array.isArray(leads) ? leads : [];

  for (let index = 0; index < items.length; index += 1) {
    const lead = items[index];
    const leadId = lead?.id || lead;
    const result = await dialOne(leadId);
    results.push(result);

    onProgress?.({
      index: index + 1,
      total: items.length,
      current: index + 1,
      lead,
      status: result.status,
      result,
      message: result.status === 'blocked'
        ? result.reason || 'Suppressed by policy'
        : result.status === 'failed'
          ? result.error || 'Call failed'
          : 'Dialled successfully'
    });

    if (index < items.length - 1) {
      await wait(1500);
    }
  }

  return summarize(results);
}

export function summarize(results = []) {
  const dialled = [];
  const blocked = [];
  const failed = [];

  (Array.isArray(results) ? results : []).forEach((item) => {
    if (item?.status === 'dialled') dialled.push(item);
    else if (item?.status === 'blocked') blocked.push(item);
    else if (item?.status === 'failed') failed.push(item);
  });

  const parts = [];
  if (dialled.length) parts.push(`${dialled.length} dialled`);
  if (blocked.length) parts.push(`${blocked.length} blocked`);
  if (failed.length) parts.push(`${failed.length} failed`);

  return {
    dialled,
    blocked,
    failed,
    text: parts.join(' · ') || 'No calls attempted'
  };
}

import React, { useEffect, useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { api } from '@/api/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const FUNNEL_STAGES = ['acquisition', 'qualification', 'conversion', 'retention', 'expansion'];

const UNIT_HELP = {
  lead: 'Each lead is randomised independently. Use for prospecting and qualification tests.',
  opportunity: 'Each opportunity is randomised independently. Use for pricing and closing tests.',
  campaign: 'Each live campaign is randomised independently. Use for retention and expansion tests.'
};

/**
 * Creates a real experiment.
 *
 * The metric list is fetched from the server rather than hardcoded here,
 * because a metric is only offerable if the backend can actually evaluate it
 * against a record. Choosing the primary metric fixes the randomisation unit —
 * it is not a free choice, since the metric can only be measured on records of
 * its own type.
 */
export default function NewExperimentDialog({ open, onOpenChange, onCreated }) {
  const [metrics, setMetrics] = useState([]);
  const [form, setForm] = useState({
    name: '',
    hypothesis: '',
    funnel_stage: 'qualification',
    primary_metric: '',
    guardrail_metrics: [],
    required_n_per_arm: 100,
    traffic_split: 0.5,
    exposure: 1
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    api.functions.invoke('experimentMetrics')
      .then((res) => setMetrics((res?.data || res)?.metrics || []))
      .catch(() => setError('Could not load the metric catalogue.'));
  }, [open]);

  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));

  const primary = metrics.find((m) => m.key === form.primary_metric) || null;
  const unit = primary?.unit || null;

  // Guardrails are restricted to the primary metric's unit: measuring a
  // guardrail on a different unit would be a different randomisation and the
  // comparison would not be valid.
  const guardrailOptions = useMemo(
    () => metrics.filter((m) => unit && m.unit === unit && m.key !== form.primary_metric),
    [metrics, unit, form.primary_metric]
  );

  const grouped = useMemo(() => {
    const out = {};
    metrics.forEach((m) => { (out[m.unit] ||= []).push(m); });
    return out;
  }, [metrics]);

  const toggleGuardrail = (key) => setForm((f) => ({
    ...f,
    guardrail_metrics: f.guardrail_metrics.includes(key)
      ? f.guardrail_metrics.filter((k) => k !== key)
      : [...f.guardrail_metrics, key]
  }));

  const submit = async () => {
    setError('');
    setBusy(true);
    try {
      const res = await api.functions.invoke('createExperiment', form);
      const created = res?.data || res;
      if (created?.error) throw new Error(created.error);
      onCreated?.(created);
      onOpenChange(false);
      setForm({
        name: '', hypothesis: '', funnel_stage: 'qualification', primary_metric: '',
        guardrail_metrics: [], required_n_per_arm: 100, traffic_split: 0.5, exposure: 1
      });
    } catch (err) {
      setError(err.message || 'Could not create the experiment');
    } finally {
      setBusy(false);
    }
  };

  const canSubmit = form.name.trim().length >= 3 && form.primary_metric && !busy;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle className="text-[15px]">New experiment</DialogTitle></DialogHeader>

        {error && (
          <div className="p-3 rounded-lg bg-destructive/10 text-destructive text-sm">{error}</div>
        )}

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-xs text-slate-600">Name</Label>
            <Input
              value={form.name}
              onChange={(e) => set('name')(e.target.value)}
              placeholder="SDR script — signal-led opening"
              className="h-9 text-xs"
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs text-slate-600">Hypothesis</Label>
            <Textarea
              value={form.hypothesis}
              onChange={(e) => set('hypothesis')(e.target.value)}
              rows={2}
              className="text-xs"
              placeholder="What do you expect to happen, and why?"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs text-slate-600">Funnel stage</Label>
              <Select value={form.funnel_stage} onValueChange={set('funnel_stage')}>
                <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {FUNNEL_STAGES.map((s) => (
                    <SelectItem key={s} value={s} className="text-xs capitalize">{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-slate-600">Required n per arm</Label>
              <Input
                type="number"
                min={10}
                value={form.required_n_per_arm}
                onChange={(e) => set('required_n_per_arm')(Number(e.target.value))}
                className="h-9 text-xs tabular-nums"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs text-slate-600">Primary metric — decides the result</Label>
            <Select value={form.primary_metric} onValueChange={(v) => setForm((f) => ({ ...f, primary_metric: v, guardrail_metrics: [] }))}>
              <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="Choose what this experiment measures" /></SelectTrigger>
              <SelectContent>
                {Object.entries(grouped).map(([unitName, list]) => (
                  <React.Fragment key={unitName}>
                    <div className="px-2 py-1 text-[10px] uppercase tracking-wide text-slate-400">{unitName} metrics</div>
                    {list.map((m) => (
                      <SelectItem key={m.key} value={m.key} className="text-xs">
                        {m.label}{m.lower_is_better ? ' (lower is better)' : ''}
                      </SelectItem>
                    ))}
                  </React.Fragment>
                ))}
              </SelectContent>
            </Select>
            {primary && (
              <p className="text-[11px] text-slate-500 pt-0.5">{primary.describes}</p>
            )}
          </div>

          {unit && (
            <div className="rounded border border-slate-200 bg-slate-50 px-3 py-2">
              <div className="text-[11px] uppercase tracking-wide text-slate-500 font-medium">Randomisation unit</div>
              <div className="text-[13px] text-slate-900 capitalize mt-0.5">{unit}</div>
              <p className="text-[11px] text-slate-500 mt-1">{UNIT_HELP[unit]}</p>
            </div>
          )}

          {guardrailOptions.length > 0 && (
            <div className="space-y-1.5">
              <Label className="text-xs text-slate-600">Guardrail metrics — watched for harm</Label>
              <div className="space-y-1.5 max-h-40 overflow-y-auto border border-slate-200 rounded p-2">
                {guardrailOptions.map((m) => (
                  <label key={m.key} className="flex items-start gap-2 cursor-pointer">
                    <Checkbox
                      checked={form.guardrail_metrics.includes(m.key)}
                      onCheckedChange={() => toggleGuardrail(m.key)}
                      className="mt-0.5"
                    />
                    <span className="min-w-0">
                      <span className="block text-[13px] text-slate-800">{m.label}</span>
                      <span className="block text-[11px] text-slate-500">{m.describes}</span>
                    </span>
                  </label>
                ))}
              </div>
              <p className="text-[11px] text-slate-500">
                Each guardrail is measured on the same arms. A breach is flagged when treatment moves the wrong way
                with p &lt; 0.05.
              </p>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs text-slate-600">Traffic split (control share)</Label>
              <Input
                type="number" step="0.05" min="0.05" max="0.95"
                value={form.traffic_split}
                onChange={(e) => set('traffic_split')(Number(e.target.value))}
                className="h-9 text-xs tabular-nums"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-slate-600">Exposure (fraction enrolled)</Label>
              <Input
                type="number" step="0.05" min="0.05" max="1"
                value={form.exposure}
                onChange={(e) => set('exposure')(Number(e.target.value))}
                className="h-9 text-xs tabular-nums"
              />
            </div>
          </div>

          <p className="text-[11px] text-slate-500">
            Units are assigned by a deterministic hash of the experiment key and the record id, so enrolment is
            reproducible and needs no stored randomness. Arms begin accruing immediately from records that already
            exist.
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button>
          <Button size="sm" onClick={submit} disabled={!canSubmit}>
            {busy ? <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />Creating…</> : 'Create experiment'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

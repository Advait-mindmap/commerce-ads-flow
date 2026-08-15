import React, { useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

export default function BatchDialModal({ open, onOpenChange, onDial, liveVariant }) {
  const [band, setBand] = useState('A');
  const [maxDials, setMaxDials] = useState(25);
  const [variant, setVariant] = useState(liveVariant);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(null);
  const [summary, setSummary] = useState(null);

  const blockedRows = useMemo(() => (summary?.blocked || []).map((item) => ({
    lead_id: item.lead_id,
    reason: item.reason || 'Suppressed by policy'
  })), [summary]);

  const close = () => {
    setBusy(false);
    setProgress(null);
    setSummary(null);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => {
      if (!nextOpen) close();
      else onOpenChange(true);
    }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle className="text-[15px]">Start batch dial</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-xs text-slate-600">PTA band</Label>
            <Select value={band} onValueChange={setBand}>
              <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {['A', 'B', 'C'].map((b) => <SelectItem key={b} value={b}>Band {b}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-slate-600">Max dials</Label>
            <Input type="number" min={1} value={maxDials} onChange={(e) => setMaxDials(Number(e.target.value))} className="h-9 text-xs tabular-nums" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-slate-600">Script variant</Label>
            <Select value={variant} onValueChange={setVariant}>
              <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="v3_signal_open">v3_signal_open (live)</SelectItem>
                <SelectItem value="v2_benefit_open">v2_benefit_open</SelectItem>
                <SelectItem value="v1_control">v1_control</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {busy && progress && (
            <div className="rounded border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700">
              <div className="font-medium text-slate-900">Dialling {progress.current}/{progress.total}</div>
              <div className="mt-1">{progress.message || 'Starting call...'}</div>
            </div>
          )}

          {summary && (
            <div className="space-y-2 rounded border border-slate-200 bg-slate-50 px-3 py-2">
              <div className="text-[11px] uppercase tracking-wide text-slate-500 font-medium">Summary</div>
              <div className="text-xs text-slate-700">{summary.text}</div>
              {blockedRows.length > 0 && (
                <div className="space-y-1 pt-1">
                  <div className="text-[11px] uppercase tracking-wide text-amber-700 font-medium">Blocked leads</div>
                  <ul className="space-y-1">
                    {blockedRows.map((row, index) => (
                      <li key={`${row.lead_id || index}`} className="text-[12px] text-amber-900 border border-amber-200 bg-amber-50 rounded px-2 py-1">
                        {row.lead_id} · {row.reason}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          <p className="text-xs text-slate-500">
            Every dial passes the suppression gate before connecting. Blocked contacts are skipped and logged.
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={close} disabled={busy}>Cancel</Button>
          <Button size="sm" onClick={async () => {
            setBusy(true);
            setProgress(null);
            setSummary(null);
            try {
              const result = await onDial({ band, maxDials, variant }, (next) => setProgress(next));
              setSummary(result || null);
            } finally {
              setBusy(false);
            }
          }} disabled={busy}>{busy ? 'Dialling…' : 'Confirm and dial'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
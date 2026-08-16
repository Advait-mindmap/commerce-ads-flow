import React, { useEffect, useMemo, useState } from 'react';
import { Loader2, Phone } from 'lucide-react';
import { api } from '@/api/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { useConfig } from '@/lib/ConfigContext';

/**
 * Places a single outbound call to a typed number.
 *
 * Attaching a seller is optional but changes the call materially: the voice
 * agent is handed that seller's decline figures and opens with them, rather
 * than a generic pitch.
 */
export default function StartDialModal({ open, onOpenChange, onPlaced }) {
  const [phone, setPhone] = useState('');
  const [label, setLabel] = useState('');
  const [sellers, setSellers] = useState([]);
  const [sellerId, setSellerId] = useState(null);
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [blocked, setBlocked] = useState(null);
  const { voice_provider, voice } = useConfig();

  useEffect(() => {
    if (!open) return;
    setError(''); setBlocked(null);
    api.entities.Seller.list('-pta_score', 500).then(setSellers).catch(() => setSellers([]));
  }, [open]);

  const selected = sellers.find((s) => s.id === sellerId) || null;

  const matches = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return sellers.slice(0, 8);
    return sellers.filter((s) => (s.display_name || '').toLowerCase().includes(q)).slice(0, 8);
  }, [sellers, search]);

  // Mirrors the server's normalisation so the user sees what will be dialled.
  const normalized = useMemo(() => {
    const digits = String(phone).replace(/\D/g, '').slice(-10);
    return digits.length === 10 ? `+91${digits}` : null;
  }, [phone]);

  const place = async () => {
    setError(''); setBlocked(null);
    setBusy(true);
    try {
      const res = await api.functions.invoke('startDial', {
        phone_number: phone,
        seller_id: sellerId || undefined,
        label: label || undefined
      });
      const data = res?.data || res;
      if (data?.error) throw new Error(data.error);
      if (data?.blocked) { setBlocked(data.reason); return; }
      onPlaced?.(data);
      onOpenChange(false);
      setPhone(''); setLabel(''); setSellerId(null); setSearch('');
    } catch (err) {
      setError(err.message || 'Could not place the call');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle className="text-[15px]">Start a call</DialogTitle></DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-xs text-slate-600">Phone number</Label>
            <div className="relative">
              <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" aria-hidden="true" />
              <Input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="98765 43210"
                inputMode="tel"
                autoFocus
                className="h-9 text-xs pl-9 tabular-nums"
              />
            </div>
            <p className="text-[11px] text-slate-500 tabular-nums">
              {normalized ? `Will dial ${normalized}` : 'Enter a 10-digit Indian mobile number'}
            </p>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs text-slate-600">Attach a seller (optional)</Label>
            {selected ? (
              <div className="flex items-center justify-between gap-2 border border-slate-200 rounded px-3 py-2">
                <span className="min-w-0">
                  <span className="block text-[13px] text-slate-900 truncate">{selected.display_name}</span>
                  <span className="block text-[11px] text-slate-500">
                    {selected.category} · PTA {selected.pta_band} · {Math.round((selected.organic_impr_decline || 0) * 100)}% organic decline
                  </span>
                </span>
                <button onClick={() => setSellerId(null)} className="text-[11px] text-slate-500 hover:text-slate-800 shrink-0">Clear</button>
              </div>
            ) : (
              <Command className="border border-slate-200 rounded">
                <CommandInput placeholder="Search sellers…" value={search} onValueChange={setSearch} className="text-xs" />
                <CommandList className="max-h-40">
                  <CommandEmpty className="text-xs p-3 text-slate-500">No sellers match.</CommandEmpty>
                  <CommandGroup>
                    {matches.map((s) => (
                      <CommandItem
                        key={s.id}
                        value={s.display_name}
                        onSelect={() => { setSellerId(s.id); if (!phone) setPhone(s.contact_phone || ''); }}
                        className="text-xs"
                      >
                        <span className="truncate">{s.display_name}</span>
                        <span className="ml-2 text-[11px] text-slate-500 shrink-0">PTA {s.pta_band}</span>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </CommandList>
              </Command>
            )}
            <p className="text-[11px] text-slate-500">
              With a seller attached the agent opens using that seller&apos;s own traffic figures.
            </p>
          </div>

          {!sellerId && (
            <div className="space-y-1.5">
              <Label className="text-xs text-slate-600">Label for this call (optional)</Label>
              <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Demo call" className="h-9 text-xs" />
            </div>
          )}

          {blocked && (
            <div className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
              <span className="font-medium">Blocked by the suppression gate.</span> {blocked}
            </div>
          )}
          {error && (
            <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</div>
          )}

          {/* Say plainly what will happen, and which agent will speak — the
              configured agent is not necessarily the one the app describes. */}
          <p className="text-[11px] text-slate-500">
            {voice_provider === 'simulated'
              ? 'No voice credentials are configured, so this call is simulated locally — no phone will actually ring.'
              : voice?.reachable
                ? <>This places a <span className="font-medium text-slate-700">real outbound call</span>{voice.agent_name ? <> using the voice agent “{voice.agent_name}”</> : null}.</>
                : 'Voice credentials are set but the provider is not reachable — this call will fail.'}
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button>
          <Button size="sm" onClick={place} disabled={!normalized || busy}>
            {busy ? <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />Dialling…</> : 'Call now'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

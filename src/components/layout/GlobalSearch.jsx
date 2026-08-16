import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '@/api/client';
import { CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';

export default function GlobalSearch() {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    if (!open || data) return;
    // Search spans three entities; a role denied one of them still gets the
    // others rather than a dialog stuck on "Loading records…".
    Promise.allSettled([
      api.entities.Seller.list('-gmv_30d', 500),
      api.entities.Lead.list('-created_date', 500),
      api.entities.Campaign.list('-spend_30d', 500)
    ]).then((settled) => {
      const [sellers, leads, campaigns] = settled.map((s) => (s.status === 'fulfilled' ? s.value : []));
      setData({ sellers, leads, campaigns });
    });
  }, [open, data]);

  const go = (path) => {
    setOpen(false);
    navigate(path);
  };

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder="Search sellers, leads, campaigns…" />
      <CommandList>
        <CommandEmpty>{data ? 'No matches found.' : 'Loading records…'}</CommandEmpty>
        {data && (
          <>
            <CommandGroup heading="Sellers">
              {data.sellers.slice(0, 200).map((s) => (
                <CommandItem key={s.id} value={`seller ${s.display_name} ${s.category}`} onSelect={() => go(`/sellers/${s.id}`)}>
                  <span className="text-[13px]">{s.display_name}</span>
                  <span className="ml-2 text-[11px] text-slate-500">{s.category} · {s.tier}</span>
                </CommandItem>
              ))}
            </CommandGroup>
            <CommandGroup heading="Leads">
              {data.leads.slice(0, 200).map((l) => (
                <CommandItem key={l.id} value={`lead ${l.seller_name} ${l.stage}`} onSelect={() => go(l.stage === 'mql' ? '/mql' : '/workspace')}>
                  <span className="text-[13px]">{l.seller_name}</span>
                  <span className="ml-2 text-[11px] text-slate-500">{l.stage} · PTA {l.pta_band || '—'}</span>
                </CommandItem>
              ))}
            </CommandGroup>
            <CommandGroup heading="Campaigns">
              {data.campaigns.slice(0, 200).map((c) => (
                <CommandItem key={c.id} value={`campaign ${c.seller_name} ${c.campaign_type}`} onSelect={() => go('/campaigns')}>
                  <span className="text-[13px]">{c.seller_name}</span>
                  <span className="ml-2 text-[11px] text-slate-500">{(c.campaign_type || '').replace(/_/g, ' ')} · {c.status}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}
      </CommandList>
    </CommandDialog>
  );
}
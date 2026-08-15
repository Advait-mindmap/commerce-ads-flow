import React from 'react';
import { Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const BANDS = ['A', 'B', 'C', 'D'];
const CATEGORIES = ['Fashion', 'Electronics', 'Home & Decor', 'Beauty', 'Grocery', 'Toys', 'Sports', 'Books', 'Automotive', 'Health'];
const GMV_BANDS = [
  { value: 'all', label: 'Any GMV' },
  { value: 'lt1l', label: 'Under ₹1L' },
  { value: '1to5l', label: '₹1L – ₹5L' },
  { value: '5to20l', label: '₹5L – ₹20L' },
  { value: 'gt20l', label: 'Above ₹20L' }
];

export default function SignalFilters({ filters, setFilters, shown, total, active, onClear }) {
  const toggleBand = (b) =>
    setFilters((f) => ({ ...f, bands: f.bands.includes(b) ? f.bands.filter((x) => x !== b) : [...f.bands, b] }));

  return (
    <div className="sticky top-0 z-10 bg-white border-b border-slate-200 px-6 py-3 space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1">
          <span className="text-[11px] uppercase tracking-wide text-slate-500 font-medium mr-1">PTA</span>
          {BANDS.map((b) => (
            <button
              key={b}
              onClick={() => toggleBand(b)}
              className={`w-7 h-7 rounded border text-xs font-semibold transition-colors ${
                filters.bands.includes(b)
                  ? 'bg-blue-800 text-white border-blue-800'
                  : 'bg-white text-slate-600 border-slate-200 hover:border-slate-400'
              }`}
            >
              {b}
            </button>
          ))}
        </div>

        <Select value={filters.category} onValueChange={(v) => setFilters((f) => ({ ...f, category: v }))}>
          <SelectTrigger className="h-8 w-[160px] text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All categories</SelectItem>
            {CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
          </SelectContent>
        </Select>

        <Select value={filters.gmvBand} onValueChange={(v) => setFilters((f) => ({ ...f, gmvBand: v }))}>
          <SelectTrigger className="h-8 w-[140px] text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            {GMV_BANDS.map((g) => <SelectItem key={g.value} value={g.value}>{g.label}</SelectItem>)}
          </SelectContent>
        </Select>

        <label className="flex items-center gap-2 text-xs text-slate-600">
          <Switch checked={filters.neverAdvertised} onCheckedChange={(v) => setFilters((f) => ({ ...f, neverAdvertised: v }))} />
          Never advertised
        </label>

        <div className="relative ml-auto">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <Input
            value={filters.search}
            onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
            placeholder="Search sellers"
            className="h-8 w-56 pl-8 text-xs"
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-6">
        <div className="w-64">
          <div className="flex justify-between text-[11px] text-slate-500 mb-1">
            <span className="uppercase tracking-wide font-medium">Organic decline</span>
            <span className="tabular-nums">{filters.decline[0]}% – {filters.decline[1]}%</span>
          </div>
          <Slider min={0} max={80} step={1} value={filters.decline} onValueChange={(v) => setFilters((f) => ({ ...f, decline: v }))} />
        </div>

        <div className="w-64">
          <div className="flex justify-between text-[11px] text-slate-500 mb-1">
            <span className="uppercase tracking-wide font-medium">Tenure (months)</span>
            <span className="tabular-nums">{filters.tenure[0]} – {filters.tenure[1]}</span>
          </div>
          <Slider min={0} max={60} step={1} value={filters.tenure} onValueChange={(v) => setFilters((f) => ({ ...f, tenure: v }))} />
        </div>

        <div className="ml-auto flex items-center gap-3 text-xs">
          <span className="text-slate-500 tabular-nums">Showing {shown} of {total} sellers</span>
          {active && <button onClick={onClear} className="text-blue-800 hover:underline">Clear all</button>}
        </div>
      </div>
    </div>
  );
}
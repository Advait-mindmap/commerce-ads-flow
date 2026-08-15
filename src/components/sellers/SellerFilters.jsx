import React from 'react';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const CATEGORIES = ['Fashion', 'Electronics', 'Home & Decor', 'Beauty', 'Grocery', 'Toys', 'Sports', 'Books', 'Automotive', 'Health'];
const TIERS = ['platinum', 'gold', 'silver', 'bronze', 'new'];
const STATUSES = ['active', 'suspended', 'churned', 'dormant'];
const BANDS = ['A', 'B', 'C', 'D'];

function Picker({ label, value, onChange, options }) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="h-8 w-[140px] text-xs bg-white"><SelectValue placeholder={label} /></SelectTrigger>
      <SelectContent>
        <SelectItem value="all" className="text-xs">All {label.toLowerCase()}</SelectItem>
        {options.map((o) => <SelectItem key={o} value={o} className="text-xs capitalize">{o}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}

export default function SellerFilters({ filters, setFilters, shown, total }) {
  const set = (k) => (v) => setFilters((f) => ({ ...f, [k]: v }));
  return (
    <div className="bg-white border border-slate-200 rounded-lg px-4 py-3 flex flex-wrap items-center gap-2">
      <Input
        value={filters.q}
        onChange={(e) => set('q')(e.target.value)}
        placeholder="Search name or city…"
        className="h-8 w-56 text-xs"
      />
      <Picker label="Category" value={filters.category} onChange={set('category')} options={CATEGORIES} />
      <Picker label="Tier" value={filters.tier} onChange={set('tier')} options={TIERS} />
      <Picker label="Status" value={filters.status} onChange={set('status')} options={STATUSES} />
      <Picker label="PTA band" value={filters.band} onChange={set('band')} options={BANDS} />
      <span className="ml-auto text-[11px] text-slate-500 tabular-nums">{shown} of {total} sellers</span>
    </div>
  );
}
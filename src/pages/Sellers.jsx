import React, { useEffect, useMemo, useState } from 'react';
import { base44 } from '@/api/base44Client';
import SellerFilters from '@/components/sellers/SellerFilters';
import SellerTable from '@/components/sellers/SellerTable';
import ExportCsvButton from '@/components/common/ExportCsvButton';
import { TableSkeleton } from '@/components/common/Skeletons';

const CSV_COLUMNS = [
  { key: 'display_name', label: 'Seller' },
  { key: 'category', label: 'Category' },
  { key: 'tier', label: 'Tier' },
  { key: 'seller_type', label: 'Type' },
  { key: 'city', label: 'City' },
  { key: 'tenure_days', label: 'Tenure (days)' },
  { key: 'gmv_30d', label: 'GMV 30d' },
  { key: 'status', label: 'Status' },
  { key: 'pta_band', label: 'PTA band' },
  { key: 'pta_score', label: 'PTA score' },
  { key: 'ever_advertised', label: 'Ever advertised' }
];

const DEFAULTS = { q: '', category: 'all', tier: 'all', status: 'all', band: 'all' };

export default function Sellers() {
  const [sellers, setSellers] = useState(null);
  const [filters, setFilters] = useState(DEFAULTS);

  useEffect(() => { base44.entities.Seller.list('-gmv_30d', 500).then(setSellers); }, []);

  const rows = useMemo(() => {
    if (!sellers) return [];
    const q = filters.q.trim().toLowerCase();
    return sellers.filter((s) => {
      if (q && !`${s.display_name} ${s.city || ''}`.toLowerCase().includes(q)) return false;
      if (filters.category !== 'all' && s.category !== filters.category) return false;
      if (filters.tier !== 'all' && s.tier !== filters.tier) return false;
      if (filters.status !== 'all' && s.status !== filters.status) return false;
      if (filters.band !== 'all' && s.pta_band !== filters.band) return false;
      return true;
    });
  }, [sellers, filters]);

  if (!sellers) {
    return (
      <div className="p-6 space-y-4">
        <h1 className="text-base font-semibold text-slate-900">Sellers</h1>
        <TableSkeleton rows={10} columns={10} />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-base font-semibold text-slate-900">Sellers</h1>
        <ExportCsvButton filename="sellers" columns={CSV_COLUMNS} rows={rows} />
      </div>
      <SellerFilters filters={filters} setFilters={setFilters} shown={rows.length} total={sellers.length} />
      <SellerTable sellers={rows} />
    </div>
  );
}
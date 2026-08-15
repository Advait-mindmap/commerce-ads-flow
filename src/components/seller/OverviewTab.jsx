import React from 'react';
import KpiTile from '@/components/command/KpiTile';
import PtaExplainability from '@/components/seller/PtaExplainability';
import { inr, pct } from '@/lib/format';

export default function OverviewTab({ seller, model }) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
        <KpiTile label="GMV 30d" value={inr(seller.gmv_30d)} subtext={`${((seller.gmv_growth_30 || 0) * 100).toFixed(1)}% vs prior`} trend={seller.gmv_growth_30} />
        <KpiTile label="SKUs" value={(seller.sku_count || 0).toLocaleString('en-IN')} subtext={`+${seller.sku_added_30d || 0} in 30d`} trend={seller.sku_added_30d} />
        <KpiTile label="Organic impressions" value={(seller.organic_impr_30d || 0).toLocaleString('en-IN')} subtext={`${pct(seller.organic_impr_decline, 1)} decline`} danger={(seller.organic_impr_decline || 0) > 0.2} />
        <KpiTile label="Category SoV" value={pct(seller.category_sov, 1)} subtext={`avg position ${(seller.avg_position || 0).toFixed(1)}`} />
      </div>
      <PtaExplainability seller={seller} model={model} />
    </div>
  );
}
import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '@/api/client';
import Breadcrumbs from '@/components/common/Breadcrumbs';
import { PanelSkeleton } from '@/components/common/Skeletons';
import FeatureImportanceChart from '@/components/models/FeatureImportanceChart';
import CalibrationChart from '@/components/models/CalibrationChart';
import VersionHistory from '@/components/models/VersionHistory';
import DriftChart from '@/components/models/DriftChart';

const NAMES = {
  pta: 'Propensity to Advertise',
  budget_capacity: 'Budget Capacity',
  churn_survival: 'Churn Survival',
  elasticity: 'Spend Elasticity'
};

export default function ModelDetail() {
  const { key } = useParams();
  const [versions, setVersions] = useState(null);

  useEffect(() => {
    api.entities.ModelVersion.filter({ model_key: key }, '-trained_at', 100).then(setVersions);
  }, [key]);

  if (!versions) {
    return (
      <div className="p-6 space-y-4">
        <PanelSkeleton height={56} />
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          <PanelSkeleton height={360} />
          <PanelSkeleton height={360} />
        </div>
        <PanelSkeleton height={220} />
      </div>
    );
  }

  const champ = versions.find((v) => v.status === 'champion') || versions[0];
  if (!champ) return <div className="p-6 text-sm text-slate-500">No versions found for this model.</div>;

  return (
    <div className="p-6 space-y-4">
      <Breadcrumbs parent="Models" parentTo="/models" current={NAMES[key] || key} />

      <div>
        <h1 className="text-base font-semibold text-slate-900">{NAMES[key] || key}</h1>
        <div className="text-[11px] text-slate-500 mt-1 tabular-nums">
          Champion {champ.version} · AUC {(champ.auc || 0).toFixed(3)} · calibration error {(champ.calibration_error || 0).toFixed(3)} · drift {champ.drift_status} (max PSI {(champ.drift_psi_max || 0).toFixed(3)})
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <FeatureImportanceChart features={champ.feature_importances} />
        <CalibrationChart curve={champ.calibration_curve} />
      </div>

      <VersionHistory versions={versions} championAuc={champ.auc} />
      <DriftChart drift={champ.drift_psi_by_feature} maxPsi={champ.drift_psi_max} />
    </div>
  );
}
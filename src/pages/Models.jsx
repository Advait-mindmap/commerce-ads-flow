import React, { useEffect, useState } from 'react';
import { api } from '@/api/client';
import ModelCard from '@/components/models/ModelCard';
import { CardGridSkeleton } from '@/components/common/Skeletons';
import EmptyState from '@/components/common/EmptyState';

export default function Models() {
  const [versions, setVersions] = useState(null);

  useEffect(() => { api.entities.ModelVersion.list('-trained_at', 200).then(setVersions); }, []);

  if (!versions) {
    return (
      <div className="p-6 space-y-4">
        <h1 className="text-base font-semibold text-slate-900">Models</h1>
        <CardGridSkeleton count={4} height={150} className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-3" />
      </div>
    );
  }

  const keys = Array.from(new Set(versions.map((v) => v.model_key)));
  const champions = keys
    .map((k) => {
      const forKey = versions.filter((v) => v.model_key === k);
      return forKey.find((v) => v.status === 'champion') || forKey[0];
    })
    .filter(Boolean);

  return (
    <div className="p-6 space-y-4">
      <h1 className="text-base font-semibold text-slate-900">Models</h1>
      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-3">
        {champions.map((m) => <ModelCard key={m.id} model={m} />)}
      </div>
      {champions.length === 0 && (
        <div className="bg-white border border-slate-200 rounded-lg">
          <EmptyState message="No model versions have been registered yet." actionLabel="Open experiments" to="/experiments" />
        </div>
      )}
    </div>
  );
}
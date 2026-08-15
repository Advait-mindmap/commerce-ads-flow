import React from 'react';
import { Quote } from 'lucide-react';

export default function OpenWith({ line }) {
  return (
    <div className="bg-white rounded-lg p-4" style={{ border: '1px solid #E2E8F0' }}>
      <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-slate-500 font-medium">
        <Quote className="w-3.5 h-3.5" /> Open with
      </div>
      <p className="text-[15px] text-slate-900 mt-2 leading-relaxed">
        {line || 'No suggested opening line — lead with the strongest signal on the snapshot below.'}
      </p>
    </div>
  );
}
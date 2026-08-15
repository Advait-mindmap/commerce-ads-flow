import React from 'react';

export default function Panel({ title, action, children, className = '', bodyClassName = 'p-4' }) {
  return (
    <section className={`bg-white border border-slate-200 rounded-lg ${className}`}>
      {(title || action) && (
        <header className="flex items-center justify-between px-4 h-11 border-b border-slate-200">
          <h2 className="text-[13px] font-semibold text-slate-900">{title}</h2>
          {action}
        </header>
      )}
      <div className={bodyClassName}>{children}</div>
    </section>
  );
}
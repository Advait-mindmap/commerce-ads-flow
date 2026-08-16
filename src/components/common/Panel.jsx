import React from 'react';

export default function Panel({ title, action, children, className = '', bodyClassName = 'p-4' }) {
  return (
    <section className={`bg-white border border-slate-200 rounded-lg ${className}`}>
      {/* Wraps rather than clips: a header with several controls used to run
          past the panel edge and hide the last one entirely. */}
      {(title || action) && (
        <header className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 px-4 py-2 min-h-11 border-b border-slate-200">
          <h2 className="text-[13px] font-semibold text-slate-900 shrink-0">{title}</h2>
          {action}
        </header>
      )}
      <div className={bodyClassName}>{children}</div>
    </section>
  );
}
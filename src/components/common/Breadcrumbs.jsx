import React from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';

export default function Breadcrumbs({ parent, parentTo, current }) {
  return (
    <nav className="flex items-center gap-1 text-xs text-slate-500">
      <Link to={parentTo} className="hover:text-slate-800">{parent}</Link>
      <ChevronRight className="w-3.5 h-3.5 text-slate-300" />
      <span className="text-slate-800 truncate max-w-[380px]">{current}</span>
    </nav>
  );
}
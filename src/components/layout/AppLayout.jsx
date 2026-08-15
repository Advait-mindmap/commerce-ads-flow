import React from "react";
import { Outlet, useLocation } from "react-router-dom";
import Sidebar from "@/components/layout/Sidebar";
import GlobalSearch from "@/components/layout/GlobalSearch";
import ErrorBoundary from "@/components/common/ErrorBoundary";

export default function AppLayout() {
  const { pathname } = useLocation();
  return (
    <div className="h-screen flex flex-col bg-[#F8FAFC] text-[#0F172A]">
      <div className="h-7 shrink-0 flex items-center px-4 bg-[#F1F5F9] border-b border-[#E2E8F0]">
        <span className="text-xs text-[#94A3B8]">
          Staging environment · Synthetic data
        </span>
        <span className="ml-auto text-xs text-[#94A3B8]">Press ⌘K to search</span>
      </div>
      <div className="flex flex-1 min-h-0">
        <Sidebar />
        <main className="flex-1 overflow-y-auto">
          <ErrorBoundary key={pathname}>
            <Outlet />
          </ErrorBoundary>
        </main>
      </div>
      <GlobalSearch />
    </div>
  );
}
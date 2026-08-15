import React from "react";
import { useLocation } from "react-router-dom";
import { NAV_SECTIONS } from "@/components/layout/nav-config";

export default function PlaceholderPage() {
  const { pathname } = useLocation();
  const item = NAV_SECTIONS.flatMap((s) => s.items).find(
    (i) => i.path === pathname
  );
  return (
    <div>
      <h1 className="text-xl font-semibold text-[#0F172A]">
        {item ? item.title : "Page"}
      </h1>
      <div className="mt-6 bg-white border border-[#E2E8F0] rounded-lg p-4">
        <p className="text-sm text-[#475569]">
          This module has not been built yet.
        </p>
      </div>
    </div>
  );
}
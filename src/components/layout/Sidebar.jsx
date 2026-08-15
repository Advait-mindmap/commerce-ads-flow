import React from "react";
import { NavLink } from "react-router-dom";
import { NAV_SECTIONS } from "@/components/layout/nav-config";

export default function Sidebar() {
  return (
    <aside className="w-[240px] shrink-0 bg-white border-r border-[#E2E8F0] flex flex-col">
      <div className="h-14 flex items-center px-4 border-b border-[#F1F5F9]">
        <span className="text-[15px] font-semibold text-[#0F172A] tracking-tight">
          CommerceAds <span className="text-[#1E40AF]">OS</span>
        </span>
      </div>
      <nav className="flex-1 overflow-y-auto px-2 pb-6">
        {NAV_SECTIONS.map((section) => (
          <div key={section.label}>
            <div className="mt-4 mb-1 px-2 text-[10px] font-medium uppercase tracking-[0.06em] text-[#94A3B8]">
              {section.label}
            </div>
            {section.items.map((item) => (
              <NavLink
                key={item.path}
                to={item.path}
                end={item.path === "/"}
                className={({ isActive }) =>
                  `flex items-center h-9 px-3 text-[13px] rounded-none border-l-2 transition-colors duration-150 ${
                    isActive
                      ? "bg-[#F1F5F9] text-[#1E40AF] border-[#1E40AF] font-medium"
                      : "text-[#475569] border-transparent hover:bg-[#F8FAFC]"
                  }`
                }
              >
                {item.title}
              </NavLink>
            ))}
          </div>
        ))}
      </nav>
    </aside>
  );
}
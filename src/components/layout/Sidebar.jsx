import React from "react";
import { NavLink } from "react-router-dom";
import { LogOut } from "lucide-react";
import { NAV_SECTIONS } from "@/components/layout/nav-config";
import { useAuth } from "@/lib/AuthContext";

function initials(name = "") {
  return name
    .split(" ")
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export default function Sidebar() {
  const { user, roleLabel, canRoute, logout } = useAuth();

  // Sections are filtered by the same grants the server enforces, so a role
  // never sees a link it would be refused at.
  const sections = NAV_SECTIONS
    .map((section) => ({ ...section, items: section.items.filter((item) => canRoute(item.path)) }))
    .filter((section) => section.items.length > 0);

  return (
    <aside className="w-[240px] shrink-0 bg-white border-r border-[#E2E8F0] flex flex-col">
      <div className="h-14 flex items-center px-4 border-b border-[#F1F5F9]">
        <span className="text-[15px] font-semibold text-[#0F172A] tracking-tight">
          InSales <span className="text-[#1E40AF]">OS</span>
        </span>
      </div>

      <nav className="flex-1 overflow-y-auto px-2 pb-6">
        {sections.map((section) => (
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

      <div className="border-t border-[#F1F5F9] p-3">
        <div className="flex items-center gap-2.5">
          <span
            className="rounded-full bg-[#1E40AF] text-white text-[11px] font-semibold flex items-center justify-center shrink-0"
            style={{ width: 32, height: 32 }}
          >
            {initials(user?.full_name || user?.email || "?")}
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-[13px] font-medium text-[#0F172A] truncate">
              {user?.full_name || user?.email}
            </div>
            <div className="text-[11px] text-[#64748B] truncate">{roleLabel || user?.role}</div>
          </div>
          <button
            onClick={() => logout()}
            title="Sign out"
            aria-label="Sign out"
            className="text-[#94A3B8] hover:text-[#DC2626] shrink-0 p-1"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </aside>
  );
}

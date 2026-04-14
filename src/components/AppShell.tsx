"use client";

import { ReactNode, useState } from "react";

type NavKey = "dashboard" | "tables" | "menu" | "analytics";

type AppShellProps = {
  active: NavKey;
  title: string;
  role?: "admin" | "staff";
  userLabel?: string;
  rightPanel?: ReactNode;
  children: ReactNode;
  onNavigate?: (key: NavKey) => void;
  onLogout?: () => void;
};

const navItems: { key: NavKey; label: string }[] = [
  { key: "dashboard", label: "Dashboard" },
  { key: "tables", label: "Tische" },
  { key: "menu", label: "Menü" },
  { key: "analytics", label: "Analyse" },
];

export default function AppShell({
  active,
  title,
  role,
  userLabel,
  rightPanel,
  children,
  onNavigate,
  onLogout,
}: AppShellProps) {
  const [mobilePanelOpen, setMobilePanelOpen] = useState(false);

  const visibleNavItems = role === "staff"
    ? navItems.filter((item) => item.key === "tables")
    : navItems;

  return (
    <div className="min-h-screen bg-[#0b0b0c] text-white">
      <div className="mx-auto max-w-[1700px] lg:px-4 lg:py-4">
        <div className="lg:grid lg:grid-cols-[240px_minmax(0,1fr)_360px] lg:gap-4">
          {/* Desktop Sidebar */}
          <aside className="hidden lg:flex lg:flex-col rounded-3xl border border-white/10 bg-white/5 p-4 min-h-[calc(100vh-2rem)]">
            <div className="mb-8 px-2">
              <div className="text-xl font-bold">Taki Taki</div>
              <div className="text-sm text-white/50 mt-1">Restaurant Admin</div>
            </div>

            <nav className="space-y-2">
              {visibleNavItems.map((item) => {
                const isActive = item.key === active;
                return (
                  <button
                    key={item.key}
                    onClick={() => onNavigate?.(item.key)}
                    className={[
                      "w-full rounded-2xl px-4 py-3 text-left transition",
                      isActive
                        ? "bg-white text-black"
                        : "bg-transparent text-white/80 hover:bg-white/10",
                    ].join(" ")}
                  >
                    {item.label}
                  </button>
                );
              })}
            </nav>

            <div className="mt-auto space-y-3">
              {userLabel ? (
                <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white/80">
                  {userLabel}
                </div>
              ) : null}

              <button
                onClick={onLogout}
                className="w-full rounded-2xl border border-red-400/30 px-4 py-3 text-red-200 hover:bg-red-500/10"
              >
                Logout
              </button>
            </div>
          </aside>

          {/* Main */}
          <main className="min-w-0">
            {/* Mobile Header */}
            <div className="sticky top-0 z-30 border-b border-white/10 bg-[#0b0b0c]/95 backdrop-blur lg:hidden">
              <div className="flex items-center justify-between px-4 py-4">
                <div>
                  <div className="text-lg font-semibold">{title}</div>
                  {userLabel ? (
                    <div className="text-xs text-white/50 mt-0.5">{userLabel}</div>
                  ) : null}
                </div>

                {rightPanel ? (
                  <button
                    onClick={() => setMobilePanelOpen(true)}
                    className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm"
                  >
                    Bestellung
                  </button>
                ) : null}
              </div>
            </div>

            <div className="px-4 py-4 pb-24 lg:p-0">
              <div className="hidden lg:flex items-center justify-between mb-4 px-1">
                <div>
                  <h1 className="text-3xl font-bold">{title}</h1>
                </div>

                {userLabel ? (
                  <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white/80">
                    {userLabel}
                  </div>
                ) : null}
              </div>

              <div className="rounded-3xl border border-white/10 bg-white/5 p-3 md:p-4 lg:p-5">
                {children}
              </div>
            </div>
          </main>

          {/* Desktop Right Panel */}
          <aside className="hidden lg:block">
            {rightPanel ? (
              <div className="sticky top-4 rounded-3xl border border-white/10 bg-white/5 p-4 min-h-[calc(100vh-2rem)]">
                {rightPanel}
              </div>
            ) : null}
          </aside>
        </div>
      </div>

      {/* Mobile Bottom Nav */}
      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-white/10 bg-[#111214]/95 backdrop-blur lg:hidden">
        <div className={`grid gap-2 px-3 py-3 ${visibleNavItems.length === 1 ? "grid-cols-1" : visibleNavItems.length === 2 ? "grid-cols-2" : visibleNavItems.length === 3 ? "grid-cols-3" : "grid-cols-4"}`}>
          {visibleNavItems.map((item) => {
            const isActive = item.key === active;
            return (
              <button
                key={item.key}
                onClick={() => onNavigate?.(item.key)}
                className={[
                  "rounded-xl px-2 py-2 text-xs",
                  isActive ? "bg-white text-black" : "text-white/70 bg-white/5",
                ].join(" ")}
              >
                {item.label}
              </button>
            );
          })}
        </div>
      </nav>

      {/* Mobile Right Panel Drawer */}
      {rightPanel ? (
        <div
          className={[
            "fixed inset-0 z-50 transition lg:hidden",
            mobilePanelOpen ? "pointer-events-auto" : "pointer-events-none",
          ].join(" ")}
        >
          <div
            className={[
              "absolute inset-0 bg-black/50 transition-opacity",
              mobilePanelOpen ? "opacity-100" : "opacity-0",
            ].join(" ")}
            onClick={() => setMobilePanelOpen(false)}
          />
          <div
            className={[
              "absolute inset-x-0 bottom-0 max-h-[85vh] rounded-t-3xl border-t border-white/10 bg-[#151618] p-4 transition-transform",
              mobilePanelOpen ? "translate-y-0" : "translate-y-full",
            ].join(" ")}
          >
            <div className="mb-4 flex items-center justify-between">
              <div className="text-lg font-semibold">Bestellung</div>
              <button
                onClick={() => setMobilePanelOpen(false)}
                className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm"
              >
                Schließen
              </button>
            </div>
            <div className="overflow-auto max-h-[70vh]">{rightPanel}</div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
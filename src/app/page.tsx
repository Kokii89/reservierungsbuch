"use client";

import { useEffect, useMemo, useState } from "react";
import AppShell from "@/components/AppShell";
import TableOverviewClient from "@/components/TableOverviewClient";
import { createClient } from "@/lib/supabase/client";

export default function Home() {
  const supabase = useMemo(() => createClient(), []);
  const [loading, setLoading] = useState(true);
  const [currentUsername, setCurrentUsername] = useState("");
  const [currentRole, setCurrentRole] = useState<"admin" | "staff" | "">("");

  useEffect(() => {
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        window.location.href = "/login";
        return;
      }

      const { data, error } = await supabase
        .from("staff_profiles")
        .select("username, role, active")
        .eq("id", user.id)
        .single();

      if (error) {
        console.error("Failed to load staff profile:", error);
        await supabase.auth.signOut();
        window.location.href = "/login";
        return;
      }

      if (data?.active === false) {
        await supabase.auth.signOut();
        window.location.href = "/login";
        return;
      }

      setCurrentUsername(data?.username ?? user.email ?? "");
      setCurrentRole((data?.role as "admin" | "staff") ?? "");
      setLoading(false);
    })();
  }, [supabase]);

  async function handleLogout() {
    await supabase.auth.signOut();
    window.location.href = "/login";
  }

  if (loading) {
    return <main className="min-h-screen bg-[#0b0b0c] text-white p-4">Lädt...</main>;
  }

  return (
    <AppShell
      active="tables"
      title="Tischübersicht"
      role={currentRole || undefined}
      userLabel={`${currentUsername || "Benutzer"}${currentRole ? ` · ${currentRole}` : ""}`}
      onNavigate={(key) => {
        if (key === "tables") window.location.href = "/";
        if (key === "menu") window.location.href = "/menu";
        if (key === "analytics") window.location.href = "/analytics";
        if (key === "dashboard") window.location.href = "/dashboard";
      }}
      onLogout={() => {
        void handleLogout();
      }}
    >
      <TableOverviewClient />
    </AppShell>
  );
}
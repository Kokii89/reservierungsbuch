"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import AppShell from "@/components/AppShell";

type MenuItemRow = {
  id: string;
  name: string;
  plu: string;
  price_cents: number;
  active: boolean;
};

type MenuCategory =
  | "ALL"
  | "GETRAENKE"
  | "VORSPEISEN"
  | "SUSHI"
  | "HAUPTGERICHTE"
  | "DESSERT"
  | "SONSTIGES";

const CATEGORY_LABELS: Record<MenuCategory, string> = {
  ALL: "Alle",
  GETRAENKE: "Getränke",
  VORSPEISEN: "Vorspeisen",
  SUSHI: "Sushi",
  HAUPTGERICHTE: "Hauptgerichte",
  DESSERT: "Dessert",
  SONSTIGES: "Sonstiges",
};

function getMenuCategory(item: Pick<MenuItemRow, "name" | "plu">): MenuCategory {
  const plu = item.plu.trim().toUpperCase();
  const name = item.name.trim().toLowerCase();

  if (plu.startsWith("N")) return "DESSERT";
  if (plu.startsWith("S") || plu.startsWith("M")) return "SUSHI";

  const numericPart = Number.parseInt(plu, 10);
  if (!Number.isNaN(numericPart)) {
    if (
      (numericPart >= 1100 && numericPart < 2700) ||
      (numericPart >= 1400 && numericPart < 2700)
    ) {
      return "GETRAENKE";
    }

    if (numericPart >= 1 && numericPart <= 29) {
      return "VORSPEISEN";
    }

    if (numericPart >= 30 && numericPart <= 999) {
      return "HAUPTGERICHTE";
    }
  }

  if (
    name.includes("suppe") ||
    name.includes("frühlingsrollen") ||
    name.includes("sommerrollen") ||
    name.includes("dumpling") ||
    name.includes("salat") ||
    name.includes("edamame")
  ) {
    return "VORSPEISEN";
  }

  if (
    name.includes("maki") ||
    name.includes("nigiri") ||
    name.includes("sashimi") ||
    name.includes("inside out") ||
    name.includes("crunchy") ||
    name.includes("poke bowl") ||
    name.includes("sandwich") ||
    name.includes("menü")
  ) {
    return "SUSHI";
  }

  if (
    name.includes("wasser") ||
    name.includes("cola") ||
    name.includes("fanta") ||
    name.includes("sprite") ||
    name.includes("tee") ||
    name.includes("kaffee") ||
    name.includes("espresso") ||
    name.includes("milchkaffee") ||
    name.includes("cappuccino") ||
    name.includes("latte") ||
    name.includes("schokolade") ||
    name.includes("bier") ||
    name.includes("wein") ||
    name.includes("spritz") ||
    name.includes("saft") ||
    name.includes("schorle") ||
    name.includes("soju") ||
    name.includes("sake") ||
    name.includes("whiskey") ||
    name.includes("vodka") ||
    name.includes("obstler") ||
    name.includes("williams") ||
    name.includes("mekong") ||
    name.includes("nepmoi")
  ) {
    return "GETRAENKE";
  }

  if (
    name.includes("eis") ||
    name.includes("mochi") ||
    name.includes("banane") ||
    name.includes("ananas")
  ) {
    return "DESSERT";
  }

  if (
    name.includes("ente") ||
    name.includes("hühner") ||
    name.includes("hähnchen") ||
    name.includes("rind") ||
    name.includes("garnelen") ||
    name.includes("lachs") ||
    name.includes("zander") ||
    name.includes("forelle") ||
    name.includes("reis") ||
    name.includes("nudeln") ||
    name.includes("tofu") ||
    name.includes("curry") ||
    name.includes("teriyaki")
  ) {
    return "HAUPTGERICHTE";
  }

  return "SONSTIGES";
}

export default function MenuPage() {
  const supabase = useMemo(() => createClient(), []);

  const [loading, setLoading] = useState(true);
  const [authorized, setAuthorized] = useState(false);
  const [items, setItems] = useState<MenuItemRow[]>([]);
  const [currentUsername, setCurrentUsername] = useState("");
  const [currentRole, setCurrentRole] = useState("");

  const [newName, setNewName] = useState("");
  const [newPlu, setNewPlu] = useState("");
  const [newPrice, setNewPrice] = useState("");
  const [saving, setSaving] = useState(false);

  const [search, setSearch] = useState("");
  const [showOnlyActive, setShowOnlyActive] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<MenuCategory>("ALL");

  async function loadMenu() {
    const { data, error } = await supabase
      .from("menu_items")
      .select("id, name, plu, price_cents, active")
      .order("plu", { ascending: true });

    if (error) {
      console.error("Fehler beim Laden von menu_items:", error);
      alert("Menü konnte nicht geladen werden.");
      return;
    }

    setItems((data ?? []) as MenuItemRow[]);
  }

  useEffect(() => {
    (async () => {
      setLoading(true);

      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) {
        window.location.href = "/login";
        return;
      }

      const { data: profile, error: profileError } = await supabase
        .from("staff_profiles")
        .select("username, role, active")
        .eq("id", user.id)
        .single();

      if (profileError) {
        console.error("Fehler beim Laden des Profils:", profileError);
        alert("Benutzerprofil konnte nicht geladen werden.");
        window.location.href = "/";
        return;
      }

      if (!profile?.active) {
        await supabase.auth.signOut();
        window.location.href = "/login";
        return;
      }

      if (profile.role !== "admin") {
        alert("Kein Zugriff. Nur Admin.");
        window.location.href = "/";
        return;
      }

      setCurrentUsername(profile.username ?? user.email ?? "");
      setCurrentRole(profile.role ?? "");
      setAuthorized(true);
      await loadMenu();
      setLoading(false);
    })();
  }, [supabase]);

  async function handleCreate() {
    if (!newName.trim() || !newPlu.trim() || !newPrice.trim()) {
      alert("Bitte Name, PLU und Preis eingeben.");
      return;
    }

    const parsedPrice = Number(newPrice.replace(",", "."));
    if (Number.isNaN(parsedPrice) || parsedPrice <= 0) {
      alert("Bitte einen gültigen Preis eingeben.");
      return;
    }

    setSaving(true);

    const { error } = await supabase.from("menu_items").insert({
      name: newName.trim(),
      plu: newPlu.trim(),
      price_cents: Math.round(parsedPrice * 100),
      active: true,
    });

    setSaving(false);

    if (error) {
      console.error("Fehler beim Anlegen:", error);
      alert(`Artikel konnte nicht angelegt werden: ${error.message}`);
      return;
    }

    setNewName("");
    setNewPlu("");
    setNewPrice("");
    await loadMenu();
  }

  async function handleSaveItem(item: MenuItemRow) {
    const { error } = await supabase
      .from("menu_items")
      .update({
        name: item.name,
        plu: item.plu,
        price_cents: item.price_cents,
        active: item.active,
      })
      .eq("id", item.id);

    if (error) {
      console.error("Fehler beim Speichern:", error);
      alert(`Artikel konnte nicht gespeichert werden: ${error.message}`);
      return;
    }

    await loadMenu();
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    window.location.href = "/login";
  }

  function updateItem(id: string, patch: Partial<MenuItemRow>) {
    setItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, ...patch } : item))
    );
  }

  const filteredItems = items.filter((item) => {
    const q = search.trim().toLowerCase();
    const matchesSearch =
      !q ||
      item.name.toLowerCase().includes(q) ||
      item.plu.toLowerCase().includes(q);

    const matchesActive = !showOnlyActive || item.active;
    const category = getMenuCategory(item);
    const matchesCategory =
      selectedCategory === "ALL" || category === selectedCategory;

    return matchesSearch && matchesActive && matchesCategory;
  });

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0b0b0c] text-white p-6">
        Menüverwaltung lädt...
      </div>
    );
  }

  if (!authorized) return null;

  return (
    <AppShell
      active="menu"
      title="Menüverwaltung"
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
      <div className="space-y-4">
        <section className="rounded-3xl border border-white/10 bg-black/20 p-4 md:p-5 space-y-4">
          <div>
            <h2 className="text-xl font-semibold">Neuen Artikel anlegen</h2>
            <p className="mt-1 text-sm text-white/50">
              Name, PLU und Preis direkt erfassen.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
            <input
              className="rounded-2xl border border-white/15 bg-white/5 px-4 py-3 outline-none placeholder:text-white/35"
              placeholder="Name"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
            />
            <input
              className="rounded-2xl border border-white/15 bg-white/5 px-4 py-3 outline-none placeholder:text-white/35"
              placeholder="PLU"
              value={newPlu}
              onChange={(e) => setNewPlu(e.target.value)}
            />
            <input
              className="rounded-2xl border border-white/15 bg-white/5 px-4 py-3 outline-none placeholder:text-white/35"
              placeholder="Preis in €"
              value={newPrice}
              onChange={(e) => setNewPrice(e.target.value)}
            />
            <button
              className="rounded-2xl bg-white text-black px-4 py-3 font-medium hover:bg-white/90 disabled:opacity-50"
              onClick={() => void handleCreate()}
              disabled={saving}
            >
              {saving ? "Speichert..." : "Artikel anlegen"}
            </button>
          </div>
        </section>

        <section className="rounded-3xl border border-white/10 bg-black/20 p-4 md:p-5 space-y-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="text-xl font-semibold">Artikelübersicht</h2>
              <p className="mt-1 text-sm text-white/50">
                {filteredItems.length} von {items.length} Artikeln sichtbar
              </p>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <input
                className="rounded-2xl border border-white/15 bg-white/5 px-4 py-3 outline-none placeholder:text-white/35 sm:min-w-[260px]"
                placeholder="Suchen nach Name oder PLU"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />

              <label className="flex items-center gap-2 rounded-2xl border border-white/15 bg-white/5 px-4 py-3 text-sm text-white/80">
                <input
                  type="checkbox"
                  checked={showOnlyActive}
                  onChange={(e) => setShowOnlyActive(e.target.checked)}
                />
                Nur aktive Artikel
              </label>
            </div>
          </div>

          <div className="flex gap-2 overflow-x-auto pb-1">
            {(Object.keys(CATEGORY_LABELS) as MenuCategory[]).map((category) => {
              const isActive = selectedCategory === category;
              return (
                <button
                  key={category}
                  className={[
                    "whitespace-nowrap rounded-2xl px-4 py-2 text-sm transition",
                    isActive
                      ? "bg-white text-black"
                      : "border border-white/15 bg-white/5 text-white/80 hover:bg-white/10",
                  ].join(" ")}
                  onClick={() => setSelectedCategory(category)}
                >
                  {CATEGORY_LABELS[category]}
                </button>
              );
            })}
          </div>

          <div className="space-y-3">
            {filteredItems.map((item) => (
              <div
                key={item.id}
                className="rounded-2xl border border-white/10 bg-white/[0.03] p-4"
              >
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div className="text-xs uppercase tracking-wide text-white/45">
                    {CATEGORY_LABELS[getMenuCategory(item)]}
                  </div>
                  <div className="text-xs text-white/35">ID: {item.plu}</div>
                </div>

                <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,2fr)_140px_140px_120px_140px] lg:items-center">
                  <input
                    className="rounded-2xl border border-white/15 bg-white/5 px-4 py-3 outline-none"
                    value={item.name}
                    onChange={(e) => updateItem(item.id, { name: e.target.value })}
                  />

                  <input
                    className="rounded-2xl border border-white/15 bg-white/5 px-4 py-3 outline-none"
                    value={item.plu}
                    onChange={(e) => updateItem(item.id, { plu: e.target.value })}
                  />

                  <input
                    className="rounded-2xl border border-white/15 bg-white/5 px-4 py-3 outline-none"
                    value={(item.price_cents / 100).toFixed(2)}
                    onChange={(e) => {
                      const parsed = Number(e.target.value.replace(",", "."));
                      if (!Number.isNaN(parsed)) {
                        updateItem(item.id, {
                          price_cents: Math.round(parsed * 100),
                        });
                      }
                    }}
                  />

                  <label className="flex items-center justify-between rounded-2xl border border-white/15 bg-white/5 px-4 py-3 text-sm text-white/80 lg:justify-center lg:gap-2">
                    <span className="lg:hidden">Aktiv</span>
                    <input
                      type="checkbox"
                      checked={item.active}
                      onChange={(e) => updateItem(item.id, { active: e.target.checked })}
                    />
                    <span className="hidden lg:inline">Aktiv</span>
                  </label>

                  <button
                    className="rounded-2xl bg-emerald-600 px-4 py-3 font-medium hover:bg-emerald-700"
                    onClick={() => void handleSaveItem(item)}
                  >
                    Speichern
                  </button>
                </div>
              </div>
            ))}

            {filteredItems.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.02] p-6 text-center text-white/50">
                Keine Artikel gefunden.
              </div>
            ) : null}
          </div>
        </section>
      </div>
    </AppShell>
  );
}
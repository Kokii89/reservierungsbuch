"use client";
import React, { useMemo, useState, useEffect, useRef } from "react";
import { createClient as createSupabaseClient } from "@/lib/supabase/client";
import { toISO, cls } from "@/utils/tableHelpers";
import {
  Table,
  TableStatus,
  Reservation,
  MenuItem,
} from "@/types/restaurant";
import ReservationBook from "@/components/ReservationBook";
import TableCard from "@/components/TableCard";
import OrderModal from "@/components/OrderModal";
import { getOrCreateOpenOrder, loadOpenOrderData } from "@/lib/ordersService";

/* =========================
  Konstanten
   ========================= */

const STATUS_META = {
  FREE: { label: "Frei", badge: "FREE" },
  RESERVED: { label: "Reserviert", badge: "RES" },
  SEATED: { label: "Belegt", badge: "IN" },
  DIRTY: { label: "Reinigung", badge: "DIRTY" },
} as const;

// DB -> UI
const fromRow = (r: any) => ({
  id: r.id as string,
  capacity: r.capacity as number,
  status: r.status as TableStatus,
  name: r.name ?? undefined,
  partySize: r.party_size ?? undefined,
  since: r.since ?? null,
  reservedFor: r.reserved_for ?? null,
  note: r.note ?? undefined,
});

// UI -> DB
const toRow = (t: Table) => ({
  id: t.id,
  capacity: t.capacity,
  status: t.status,
  name: t.name ?? null,
  party_size: t.partySize ?? null,
  since: t.since ? Number(t.since) : null,
  reserved_for: t.reservedFor ?? null,
  note: t.note ?? null,
});


const RES_BOOK_KEY = "reservation-book-v1"; // localStorage-Key fürs Buch

function compareTableIds(a: string, b: string) {
  const matchA = a.match(/^(.*?)(\d+)$/);
  const matchB = b.match(/^(.*?)(\d+)$/);

  if (matchA && matchB) {
    const prefixA = matchA[1];
    const prefixB = matchB[1];
    if (prefixA !== prefixB) return prefixA.localeCompare(prefixB);

    const numA = Number(matchA[2]);
    const numB = Number(matchB[2]);
    return numA - numB;
  }

  return a.localeCompare(b);
}


const statusColor = (s: TableStatus) => {
  switch (s) {
    case "FREE":
      return "bg-slate-800 border-slate-600 text-white";
    case "RESERVED":
      return "bg-blue-600 border-blue-400 text-white";
    case "SEATED":
      return "bg-green-600 border-green-400 text-white";
    case "DIRTY":
      return "bg-red-600 border-red-400 text-white";
    default:
      return "bg-slate-800 border-slate-600 text-white";
  }
};

const badgeColor = (s: TableStatus) => {
  switch (s) {
    case "FREE":
      return "bg-slate-700 text-white";
    case "RESERVED":
      return "bg-blue-500 text-white";
    case "SEATED":
      return "bg-green-500 text-white";
    case "DIRTY":
      return "bg-red-500 text-white";
    default:
      return "bg-slate-700 text-white";
  }
};

/* =========================
   Demo-Daten (automatisch)
   ========================= */

const DEFAULT_TABLE_COUNT = 25; // <- ANPASSEN
const DEFAULT_CAPACITY = 4;     // <- ANPASSEN
const capacityOverrides: Record<string, number> = {
  // "T1": 2, "T4": 6,
};


const defaultTables: Table[] = Array.from({ length: DEFAULT_TABLE_COUNT }, (_, i) => {
  const id = `T${i + 1}`;
  const capacity = capacityOverrides[id] ?? DEFAULT_CAPACITY;
  return { id, capacity, status: "FREE", since: null, reservedFor: null };
});

/* =========================
   Komponente
   ========================= */

const STORAGE_KEY = "table-overview-v3"; // neuer Key -> alte Caches stören nicht

export default function TableOverview({ tables: externalTables }: { tables?: Table[] }) {
  // --- State ---
  const [query, setQuery] = useState("");
  const [activeView, setActiveView] = useState<"TABLES" | "RESERVATIONS">("TABLES");
  const [currentUsername, setCurrentUsername] = useState("");
  const [currentRole, setCurrentRole] = useState("");
  const [tick, setTick] = useState(0); // refresht "Seit: ..."
  const [localTables, setLocalTables] = useState<Table[]>(() => {
    if (typeof window === "undefined") return defaultTables;
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (!saved) return defaultTables;
      const arr = JSON.parse(saved);
      if (!Array.isArray(arr) || arr.length < DEFAULT_TABLE_COUNT) return defaultTables;
      return arr;
    } catch {
      return defaultTables;
    }
  });

  function timeToTodayTimestamp(hhmm: string) {
  const [h, m] = hhmm.split(":").map(n => parseInt(n, 10));
  const d = new Date(); d.setHours(h||0, m||0, 0, 0);
  return d.getTime();
}

async function addReservationToBook() {
  const name = rbName.trim();
  if (!name || !rbTime) return;

  // Wir speichern in DB; time als ISO-Zeitpunkt (heute HH:MM)
  const ts = timeToTodayTimestamp(rbTime); // du hast die Helper-Funktion
  await supabase.from("reservations").insert({
    name,
    party_size: rbParty || 2,
    time: new Date(ts).toISOString(), // timestamptz in DB
  });

  setRbName(""); setRbParty(2); setRbTime("18:00");
}

async function removeReservation(id: string) {
  await supabase.from("reservations").delete().eq("id", id);
}

async function assignReservationToTable(resId: string, tableId: string) {
  const res = reservations.find((r) => r.id === resId);
  if (!res) return;

  // Falls res.time ein ISO-String ist:
  const reservedTs = typeof res.time === "string" ? new Date(res.time).getTime() : timeToTodayTimestamp(res.time);

  // (Optional) Kapazitätscheck hier möglich

  // Tisch auf RESERVED setzen
  await supabase.from("tables").update({
  status: "RESERVED",
  name: res.name,
  party_size: res.partySize ?? (res as any).party_size ?? res.partySize,
  reserved_for: toISO(reservedTs),
  since: toISO(Date.now()),
  note: null,
}).eq("id", tableId);

  // Eintrag aus Buch entfernen
  await supabase.from("reservations").delete().eq("id", resId);
}

// Liste offener (noch nicht zugewiesener) Reservierungen
const [reservations, setReservations] = useState<Reservation[]>(() => {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(RES_BOOK_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
});

// Eingabefelder fürs Buch (oben)
const [rbName, setRbName]   = useState("");
const [rbParty, setRbParty] = useState<number>(2);
const [rbTime, setRbTime]   = useState<string>("18:00");
const [loadingTables, setLoadingTables] = useState(true);
const [loadingReservations, setLoadingReservations] = useState(true);
const [backendWaking, setBackendWaking] = useState(false);
const [menu, setMenu] = useState<MenuItem[]>([]);
const [openOrdersTotal, setOpenOrdersTotal] = useState<Record<string, number>>({});
const [orderModalFor, setOrderModalFor] = useState<Table | null>(null);
const [moveTargetTableId, setMoveTargetTableId] = useState("");
const [basket, setBasket] = useState<Record<string, number>>({});
const [loadedBasket, setLoadedBasket] = useState<Record<string, number>>({});
const [itemNotes, setItemNotes] = useState<Record<string, string>>({});
const [itemCache, setItemCache] = useState<Record<string, MenuItem>>({});
const [plu, setPlu] = useState("");
const [pluQty, setPluQty] = useState<number>(1);
const pluInputRef = useRef<HTMLInputElement | null>(null);
useEffect(() => {
  if (!orderModalFor) return;
  const timer = window.setTimeout(() => {
    pluInputRef.current?.focus();
    pluInputRef.current?.select();
  }, 0);
  return () => window.clearTimeout(timer);
}, [orderModalFor]);
const orderTableCacheRef = useRef<Record<string, string>>({});
const supabase = createSupabaseClient();
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
      return;
    }

    if (data?.active === false) {
      await supabase.auth.signOut();
      window.location.href = "/login";
      return;
    }

    setCurrentUsername(data?.username ?? user.email ?? "");
    setCurrentRole(data?.role ?? "");
  })();
}, []);

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function runWithRetry<T>(
  label: string,
  task: () => any,
  attempts = 3,
  delayMs = 1500
) {
  let lastError: any = null;

  for (let attempt = 1; attempt <= attempts; attempt++) {
    const result = await task();
    if (!result.error) {
      if (attempt > 1) setBackendWaking(false);
      return result;
    }

    lastError = result.error;
    console.warn(`${label} failed (attempt ${attempt}/${attempts})`, result.error);

    if (attempt < attempts) {
      setBackendWaking(true);
      await sleep(delayMs);
    }
  }

  setBackendWaking(false);
  throw lastError;
}
async function updateQtyAndPersist(itemId: string, q: number) {
  if (!orderModalFor) return;

  const nextBasket = { ...basket };
  if (q <= 0) delete nextBasket[itemId];
  else nextBasket[itemId] = q;

  setBasket(nextBasket);

  try {
    const orderId = await getOrCreateOpenOrder(orderModalFor.id);
orderTableCacheRef.current[orderId] = orderModalFor.id;
    await syncBasketToOrder(orderId, nextBasket);
    await loadOpenOrderIntoModal(orderModalFor.id);
    await refreshTotals([orderModalFor.id]);
  } catch (e) {
    console.error(e);
    alert("Konnte Bestellposition nicht aktualisieren.");
  }
}

async function refreshTotalForTable(tableId: string) {
  if (!tableId) return;

  const { data: ords } = await supabase
    .from("orders")
    .select("id")
    .eq("table_id", tableId)
    .eq("status", "OPEN")
    .limit(1);

  const orderId = ords?.[0]?.id ?? null;
  if (!orderId) {
    setOpenOrdersTotal((prev) => ({ ...prev, [tableId]: 0 }));
    return;
  }

  orderTableCacheRef.current[orderId] = tableId;

  const { data: items } = await supabase
    .from("order_items")
    .select("qty, price_cents")
    .eq("order_id", orderId);

  const total = (items ?? []).reduce(
    (sum: number, it: any) => sum + it.qty * it.price_cents,
    0
  );

  setOpenOrdersTotal((prev) => ({
    ...prev,
    [tableId]: total,
  }));
}

async function refreshTotals(tableIds: string[]) {
  const uniqueIds = Array.from(new Set(tableIds)).filter(Boolean);
  if (!uniqueIds.length) return;
  await Promise.all(uniqueIds.map((tableId) => refreshTotalForTable(tableId)));
}

async function resolveTableIdForOrder(orderId: string) {
  const cached = orderTableCacheRef.current[orderId];
  if (cached) return cached;

  const { data: orderRow } = await supabase
    .from("orders")
    .select("table_id")
    .eq("id", orderId)
    .single();

  const tableId = orderRow?.table_id as string | undefined;
  if (tableId) {
    orderTableCacheRef.current[orderId] = tableId;
  }
  return tableId;
}

useEffect(() => {
  const ids = (localTables ?? []).map((t) => t.id);
  if (!ids.length) return;

  const missingIds = ids.filter((id) => !(id in openOrdersTotal));
  if (missingIds.length) {
    void refreshTotals(missingIds);
  }
}, [localTables, openOrdersTotal]);

  // --- Effects ---
// 1) Ticker + Auto-Storno (RESERVED > 30 min ab reservedFor -> FREE + note)
// Supabase wake-up ping
useEffect(() => {
  void supabase.from("tables").select("id").limit(1);
}, []);

useEffect(() => {
  const id = setInterval(async () => {
    setTick((t) => t + 1);

    const due = localTables.filter((tbl) => {
      if (tbl.status !== "RESERVED" || !tbl.reservedFor) return false;
      const tms = new Date(tbl.reservedFor as any).getTime();
      return tms > 0 && (Date.now() - tms) / 60000 >= 30;
    });
    // in DB freigeben
    for (const tbl of due) {
      await supabase.from("tables").update({
        status: "FREE",
        since: null,
        reserved_for: null,
        note: "Auto-Storno: Verspätung >30m",
      }).eq("id", tbl.id);
    }
  }, 30_000);

  return () => clearInterval(id);
}, [localTables]);

useEffect(() => {
  (async () => {
    try {
      const { data } = await runWithRetry(
        "Supabase load menu",
        () =>
          supabase
            .from("menu_items")
            .select("*")
            .eq("active", true)
            .order("name", { ascending: true })
      );
      if (data) setMenu(data as MenuItem[]);
    } catch (error) {
      console.error("Supabase load menu error:", error);
    }
  })();
}, []);

// Initial: Tische laden
useEffect(() => {
  (async () => {
    setLoadingTables(true);
    try {
      const { data } = await runWithRetry(
        "Supabase load tables",
        () => supabase.from("tables").select("*").order("id", { ascending: true })
      );

      if (data) {
        setLocalTables((data as any[]).map(fromRow));
      }
    } catch (error: any) {
      console.error("Supabase load tables error:", {
        message: error?.message,
        details: error?.details,
        hint: error?.hint,
        code: error?.code,
        full: error,
      });
    } finally {
      setLoadingTables(false);
      setBackendWaking(false);
    }
  })();
}, []);

// Realtime: auf Änderungen der Tische reagieren
useEffect(() => {
  const ch = supabase
    .channel("tables-realtime")
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "tables" },
      (payload: any) => {
        const row = (payload.new ?? payload.old) as any;
        if (!row?.id) return;

        setLocalTables((prev) => {
          const next = [...prev];
          const i = next.findIndex((t) => t.id === row.id);

          if (payload.eventType === "DELETE") {
            if (i >= 0) next.splice(i, 1);
          } else {
            const obj = fromRow(row);
            if (i >= 0) next[i] = obj;
            else next.push(obj);
          }
          next.sort((a, b) => compareTableIds(a.id, b.id));
          return next;
        });
      }
    )
    .subscribe();

  return () => {
    supabase.removeChannel(ch);
  };
}, []);

// Initial: Reservierungen laden
useEffect(() => {
  (async () => {
    setLoadingReservations(true);
    try {
      const { data } = await runWithRetry(
        "Supabase load reservations",
        () => supabase.from("reservations").select("*").order("time", { ascending: true })
      );

      if (data) {
        setReservations(
          (data as any[]).map((r: any) => ({
            id: r.id,
            name: r.name,
            partySize: r.party_size,
            time: r.time,
          }))
        );
      }
    } catch (error: any) {
      console.error("Supabase load reservations error:", {
        message: error?.message,
        details: error?.details,
        hint: error?.hint,
        code: error?.code,
        full: error,
      });
    } finally {
      setLoadingReservations(false);
      setBackendWaking(false);
    }
  })();
}, []);

// Realtime: Reservierungen
useEffect(() => {
  const ch = supabase
    .channel("reservations-realtime")
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "reservations" },
      (payload: any) => {
        const row = (payload.new ?? payload.old) as any;
        if (!row?.id) return;

        setReservations((prev) => {
          const next = [...prev];
          const i = next.findIndex((r) => r.id === row.id);
          const obj = {
            id: row.id,
            name: row.name,
            partySize: row.party_size,
            time: row.time,
          };
          if (payload.eventType === "DELETE") {
            if (i >= 0) next.splice(i, 1);
          } else {
            if (i >= 0) next[i] = obj;
            else next.push(obj);
          }
          return next.sort((a, b) => String(a.time).localeCompare(String(b.time)));
        });
      }
    )
    .subscribe();

  return () => {
    supabase.removeChannel(ch);
  };
}, []);

// Realtime: offene Orders / Summen auf allen Geräten aktualisieren
useEffect(() => {
  const ch = supabase
    .channel("orders-realtime")
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "orders" },
      async (payload: any) => {
        const row = (payload.new ?? payload.old) as any;
        const tableId = row?.table_id as string | undefined;
        const orderId = row?.id as string | undefined;

        if (tableId && orderId) {
          orderTableCacheRef.current[orderId] = tableId;
        }

        if (tableId) {
          await refreshTotalForTable(tableId);
        }

        if (orderModalFor?.id && tableId === orderModalFor.id) {
          await loadOpenOrderIntoModal(orderModalFor.id);
        }
      }
    )
    .subscribe();

  return () => {
    supabase.removeChannel(ch);
  };
}, [orderModalFor]);

useEffect(() => {
  const ch = supabase
    .channel("order-items-realtime")
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "order_items" },
      async (payload: any) => {
        const row = (payload.new ?? payload.old) as any;
        const orderId = row?.order_id as string | undefined;

        if (!orderId) return;

        const tableId = await resolveTableIdForOrder(orderId);
        if (tableId) {
          await refreshTotalForTable(tableId);
        }

        if (orderModalFor?.id && tableId === orderModalFor.id) {
          await loadOpenOrderIntoModal(orderModalFor.id);
        }
      }
    )
    .subscribe();

  return () => {
    supabase.removeChannel(ch);
  };
}, [orderModalFor]);

  // --- Abgeleitete Werte ---
  const tables = externalTables?.length ? externalTables : localTables;

  const filtered = useMemo(() => {
    return tables
      .filter((t) =>
        query ? `${t.id} ${t.name ?? ""}`.toLowerCase().includes(query.toLowerCase()) : true
      )
      .sort((a, b) => compareTableIds(a.id, b.id));
  }, [tables, query, tick]);

  const totals = useMemo(() => {
    const res: Record<string, number> = { ALL: tables.length };
    (Object.keys(STATUS_META) as TableStatus[]).forEach(
      (s) => (res[s] = tables.filter((t) => t.status === s).length)
    );
    return res;
  }, [tables]);

  // --- Aktionen (Statuswechsel) ---
async function handleAction(
  t: Table,
  action: "SEAT_NOW" | "RESERVE" | "CANCEL" | "CHECKIN" | "CHECKOUT" | "CLEAN"
) {
  // 1) Nächsten Zustand berechnen (wie bisher)
  let next = t.status;
  let nextSince: number | string | null = t.since;
  let name = t.name;
  let partySize = t.partySize;
  let note: string | undefined;
  // reservedFor bezieht sich auf die geplante Uhrzeit einer Reservierung (ms epoch)
  let reservedFor: number | string | null =
    // wenn dein Table-Typ schon reservedFor hat:
    (t as any).reservedFor ?? null;

  switch (action) {
    case "SEAT_NOW": // FREE -> SEATED (Walk-in)
      if (t.status === "FREE") {
        next = "SEATED";
        nextSince = Date.now();
        name = undefined;
        partySize = undefined;
        note = undefined;
        reservedFor = null; // geplante Zeit ist für Walk-in irrelevant
      }
      break;

    case "RESERVE": // FREE -> RESERVED (Fallback ohne Formular)
      if (t.status === "FREE") {
        next = "RESERVED";
        nextSince = Date.now();
        name = name ?? "Reservierung";
        partySize = partySize ?? 2;
        note = undefined;
        // reservedFor kannst du hier optional setzen, wenn du eine Uhrzeit hast
      }
      break;

    case "CANCEL": // RESERVED -> FREE
      if (t.status === "RESERVED") {
        next = "FREE";
        nextSince = null;
        name = undefined;
        partySize = undefined;
        note = "Storniert";
        reservedFor = null;
      }
      break;

    case "CHECKIN": // RESERVED -> SEATED
      if (t.status === "RESERVED") {
        next = "SEATED";
        nextSince = Date.now();
        note = undefined;
        reservedFor = null; // ab Platzierung entfällt die geplante Zeit
      }
      break;

    case "CHECKOUT": // SEATED -> DIRTY
      if (t.status === "SEATED") {
        next = "DIRTY";
        nextSince = Date.now();
      }
      break;

    case "CLEAN": // DIRTY -> FREE
      if (t.status === "DIRTY") {
        next = "FREE";
        nextSince = null;    // Timer-Reset nach Reinigung
        note = undefined;
      }
      break;
  }

  // 2) Optimistisches Update (UI fühlt sich sofort schnell an)
  const optimistic = (x: Table): Table =>
    x.id === t.id
      ? {
          ...x,
          status: next,
          since: nextSince,
          name,
          partySize,
          note,
          // falls dein Table-Typ reservedFor hat:
          ...(typeof reservedFor !== "undefined" ? { reservedFor } : {}),
        }
      : x;

  setLocalTables((prev) => prev.map(optimistic));

  // 3) Server-Update (Supabase) – damit alle Geräte es sehen
  try {
    const payload = {
  status: next,
  since: toISO(nextSince),
  name: name ?? null,
  party_size: partySize ?? null,
  note: note ?? null,
  reserved_for:
    next === "SEATED" || next === "FREE"
      ? null
      : toISO(reservedFor ?? (t as any).reservedFor ?? null),
};

    const { error } = await supabase.from("tables").update(payload).eq("id", t.id);
    if (error) {
      console.error("Supabase update error:", error);
      // Rollback falls DB-Update scheitert
      setLocalTables((prev) =>
        prev.map((x) => (x.id === t.id ? t : x)) // ursprünglichen Datensatz zurück
      );
      alert("Konnte Status nicht speichern. Bitte erneut versuchen.");
    }
  } catch (e) {
    console.error(e);
    setLocalTables((prev) => prev.map((x) => (x.id === t.id ? t : x)));
    alert("Netzwerkproblem – Änderung wurde zurückgesetzt.");
  }
}



  async function syncBasketToOrder(orderId: string, desiredBasket: Record<string, number>) {
    const { data: existingRows, error } = await supabase
      .from("order_items")
      .select("id, item_id, qty, price_cents, printed_qty, note")
      .eq("order_id", orderId);

    if (error) throw error;

    const rows = (existingRows ?? []) as Array<{
      id: string;
      item_id: string;
      qty: number;
      price_cents: number;
      printed_qty: number;
      note: string | null;
    }>;

    const grouped: Record<string, Array<{ id: string; qty: number; price_cents: number; printed_qty: number }>> = {};
    rows.forEach((row) => {
      if (!grouped[row.item_id]) grouped[row.item_id] = [];
      grouped[row.item_id].push({ id: row.id, qty: row.qty, price_cents: row.price_cents, printed_qty: row.printed_qty ?? 0 });
    });

    const allItemIds = Array.from(
      new Set([...Object.keys(grouped), ...Object.keys(desiredBasket)])
    );

    for (const itemId of allItemIds) {
      const desiredQty = desiredBasket[itemId] ?? 0;
      const currentRows = grouped[itemId] ?? [];
      const currentQty = currentRows.reduce((sum, row) => sum + row.qty, 0);

      if (desiredQty > currentQty) {
        const delta = desiredQty - currentQty;
        const item = itemCache[itemId] || menu.find((m) => m.id === itemId);
        if (!item) throw new Error(`Artikel ${itemId} nicht gefunden`);

        const { error: insertErr } = await supabase.from("order_items").insert({
          order_id: orderId,
          item_id: item.id,
          qty: delta,
          price_cents: item.price_cents,
          note: itemNotes[item.id]?.trim() || null,
        });
        if (insertErr) throw insertErr;
      }

      if (desiredQty < currentQty) {
        let removeNeeded = currentQty - desiredQty;

        for (const row of currentRows) {
          if (removeNeeded <= 0) break;

          if (row.qty <= removeNeeded) {
            const { error: deleteErr } = await supabase
              .from("order_items")
              .delete()
              .eq("id", row.id);
            if (deleteErr) throw deleteErr;
            removeNeeded -= row.qty;
          } else {
            const nextQty = row.qty - removeNeeded;
            const { error: updateErr } = await supabase
              .from("order_items")
              .update({
                qty: nextQty,
                printed_qty: Math.min(row.printed_qty ?? 0, nextQty),
              })
              .eq("id", row.id);
            if (updateErr) throw updateErr;
            removeNeeded = 0;
          }
        }
      }
    }
  }

  async function updateNoteAndPersist(itemId: string, note: string) {
    if (!orderModalFor) return;

    setItemNotes((prev) => ({
      ...prev,
      [itemId]: note,
    }));

    try {
      const orderId = await getOrCreateOpenOrder(orderModalFor.id);
      orderTableCacheRef.current[orderId] = orderModalFor.id;

      const { error } = await supabase
        .from("order_items")
        .update({ note: note.trim() || null })
        .eq("order_id", orderId)
        .eq("item_id", itemId);

      if (error) throw error;
    } catch (error) {
      console.error("Could not save item note:", error);
      alert("Notiz konnte nicht gespeichert werden.");
    }
  }

  async function addPluToBasket() {
    if (!orderModalFor) return;

    const code = plu.trim();
    const qty = Math.max(1, Number(pluQty) || 1);

    if (!code) return;

    const { data, error } = await supabase
      .from("menu_items")
      .select("*")
      .eq("plu", code)
      .eq("active", true)
      .single();

    if (error || !data) {
      alert("PLU nicht gefunden oder inaktiv.");
      return;
    }

    const item = data as MenuItem;

    const nextBasket = {
      ...basket,
      [item.id]: (basket[item.id] ?? 0) + qty,
    };

    setItemCache((prev) => ({
      ...prev,
      [item.id]: item,
    }));
    setBasket(nextBasket);

    try {
      const orderId = await getOrCreateOpenOrder(orderModalFor.id);
      orderTableCacheRef.current[orderId] = orderModalFor.id;
      await syncBasketToOrder(orderId, nextBasket);
      await loadOpenOrderIntoModal(orderModalFor.id);
      setPlu("");
      setPluQty(1);
      await refreshTotals([orderModalFor.id]);
    } catch (e) {
      console.error(e);
      alert("Konnte Artikel nicht speichern.");
    }
  }

  async function loadOpenOrderIntoModal(tableId: string) {
    try {
      const { basket, menuRows } = await loadOpenOrderData(tableId);

      setBasket(basket);
      setLoadedBasket(basket);

      const cache: Record<string, MenuItem> = {};
      menuRows.forEach((row) => {
        cache[row.id] = row;
      });
      setItemCache(cache);

      const orderId = await getOrCreateOpenOrder(tableId);
      orderTableCacheRef.current[orderId] = tableId;

      const { data: noteRows, error: noteError } = await supabase
        .from("order_items")
        .select("item_id, note")
        .eq("order_id", orderId);

      if (noteError) throw noteError;

      const notes: Record<string, string> = {};
      (noteRows ?? []).forEach((row: any) => {
        if (row.note) notes[row.item_id] = row.note;
      });
      setItemNotes(notes);
    } catch (err) {
      console.error(err);
      setBasket({});
      setLoadedBasket({});
      setItemCache({});
      setItemNotes({});
    }
  }

    

  function closeOrderModal() {
    setOrderModalFor(null);
    setMoveTargetTableId("");
    setBasket({});
    setLoadedBasket({});
    setItemCache({});
    setItemNotes({});
    setPlu("");
    setPluQty(1);
  }

  async function moveOpenOrderToTable(targetTableId: string) {
    if (!orderModalFor) return;

    const sourceTableId = orderModalFor.id;
    if (!targetTableId || targetTableId === sourceTableId) return;

    const targetTable = localTables.find((table) => table.id === targetTableId);
    if (!targetTable) {
      alert("Zieltisch nicht gefunden.");
      return;
    }

    if (targetTable.status !== "FREE") {
      alert("Umbuchen ist nur auf einen freien Tisch möglich.");
      return;
    }

    const confirmed = window.confirm(
      `Bestellung von ${sourceTableId} auf ${targetTableId} umbuchen?`
    );
    if (!confirmed) return;

    try {
      const { data: sourceOrders, error: sourceError } = await supabase
        .from("orders")
        .select("id")
        .eq("table_id", sourceTableId)
        .eq("status", "OPEN")
        .limit(1);

      if (sourceError) throw sourceError;

      const orderId = sourceOrders?.[0]?.id as string | undefined;
      if (!orderId) {
        alert("Keine offene Bestellung zum Umbuchen gefunden.");
        return;
      }

      const { data: targetOrders, error: targetOrderError } = await supabase
        .from("orders")
        .select("id")
        .eq("table_id", targetTableId)
        .eq("status", "OPEN")
        .limit(1);

      if (targetOrderError) throw targetOrderError;

      if ((targetOrders ?? []).length > 0) {
        alert("Auf dem Zieltisch gibt es bereits eine offene Bestellung. Zusammenführen bauen wir später.");
        return;
      }

      const now = Date.now();

      const { error: orderUpdateError } = await supabase
        .from("orders")
        .update({ table_id: targetTableId })
        .eq("id", orderId)
        .eq("status", "OPEN");

      if (orderUpdateError) throw orderUpdateError;

      const { error: targetUpdateError } = await supabase
        .from("tables")
        .update({
          status: "SEATED",
          since: toISO(now),
          name: orderModalFor.name ?? null,
          party_size: orderModalFor.partySize ?? null,
          reserved_for: null,
          note: orderModalFor.note ?? null,
        })
        .eq("id", targetTableId);

      if (targetUpdateError) throw targetUpdateError;

      const { error: sourceUpdateError } = await supabase
        .from("tables")
        .update({
          status: "DIRTY",
          since: toISO(now),
          name: null,
          party_size: null,
          reserved_for: null,
          note: `Umgesetzt auf ${targetTableId}`,
        })
        .eq("id", sourceTableId);

      if (sourceUpdateError) throw sourceUpdateError;

      orderTableCacheRef.current[orderId] = targetTableId;

      setLocalTables((prev) =>
        prev.map((table) => {
          if (table.id === targetTableId) {
            return {
              ...table,
              status: "SEATED",
              since: now,
              name: orderModalFor.name,
              partySize: orderModalFor.partySize,
              reservedFor: null,
              note: orderModalFor.note ?? null,
            };
          }

          if (table.id === sourceTableId) {
            return {
              ...table,
              status: "DIRTY",
              since: now,
              name: undefined,
              partySize: undefined,
              reservedFor: null,
              note: `Umgesetzt auf ${targetTableId}`,
            };
          }

          return table;
        })
      );

      await refreshTotals([sourceTableId, targetTableId]);

      const movedTable = {
        ...targetTable,
        status: "SEATED" as TableStatus,
        since: now,
        name: orderModalFor.name,
        partySize: orderModalFor.partySize,
        reservedFor: null,
        note: orderModalFor.note ?? null,
      };

      setOrderModalFor(movedTable);
      setMoveTargetTableId("");
      await loadOpenOrderIntoModal(targetTableId);
    } catch (error) {
      console.error("Move order failed:", error);
      alert("Bestellung konnte nicht umgebucht werden.");
    }
  }

  async function handleCheckout() {
    if (!orderModalFor) return;

    const confirmed = window.confirm("Tisch wirklich abrechnen und abschließen?");
    if (!confirmed) return;

    const orderId = await getOrCreateOpenOrder(orderModalFor.id);
    orderTableCacheRef.current[orderId] = orderModalFor.id;
    await syncBasketToOrder(orderId, basket);

    await supabase
      .from("orders")
      .update({ status: "PAID", closed_at: new Date().toISOString() })
      .eq("id", orderId);

    const { data: remainingOpen } = await supabase
      .from("orders")
      .select("id")
      .eq("table_id", orderModalFor.id)
      .eq("status", "OPEN");

    if (remainingOpen && remainingOpen.length > 0) {
      for (const openOrder of remainingOpen) {
        await supabase
          .from("orders")
          .update({ status: "CANCELLED", closed_at: new Date().toISOString() })
          .eq("id", openOrder.id);
      }
    }

    await handleAction(orderModalFor, "CHECKOUT");
    closeOrderModal();
    await refreshTotals([orderModalFor.id]);
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    window.location.href = "/login";
  }

  async function printKitchenItems(
    tableLabel: string,
    items: Array<{
      name: string;
      qty: number;
      category?: string | null;
      plu?: string | null;
      kitchen_label?: string | null;
      note?: string | null;
    }>
  ) {
    try {
      await fetch("/api/print", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          table: tableLabel,
          userName: currentUsername,
          items,
        }),
      });
    } catch (error) {
      console.error("Kitchen print failed:", error);
    }
  }

  async function printCurrentKitchenBon() {
    if (!orderModalFor) return;

    try {
      const orderId = await getOrCreateOpenOrder(orderModalFor.id);
      orderTableCacheRef.current[orderId] = orderModalFor.id;

      await syncBasketToOrder(orderId, basket);

      const { data: orderRows, error } = await supabase
        .from("order_items")
        .select("id, item_id, qty, printed_qty, note")
        .eq("order_id", orderId);

      if (error) throw error;

      const rows = (orderRows ?? []) as Array<{
        id: string;
        item_id: string;
        qty: number;
        printed_qty: number | null;
        note: string | null;
      }>;

      const rowsToPrint = rows
        .map((row) => ({
          ...row,
          deltaQty: row.qty - (row.printed_qty ?? 0),
        }))
        .filter((row) => row.deltaQty > 0);

      if (rowsToPrint.length === 0) {
        alert("Keine neue Nachbestellung zum Drucken.");
        return;
      }

      const itemIds = Array.from(new Set(rowsToPrint.map((row) => row.item_id)));

      const menuById = new Map<string, MenuItem & { kitchen_label?: string | null }>();

      menu.forEach((item) => {
        if (itemIds.includes(item.id)) {
          menuById.set(item.id, item);
        }
      });

      Object.values(itemCache).forEach((item) => {
        if (itemIds.includes(item.id)) {
          menuById.set(item.id, item);
        }
      });

      const missingItemIds = itemIds.filter((itemId) => !menuById.has(itemId));

      if (missingItemIds.length > 0) {
        const { data: menuRows, error: menuError } = await supabase
          .from("menu_items")
          .select("id, name, category, plu, kitchen_label")
          .in("id", missingItemIds);

        if (menuError) throw menuError;

        (menuRows ?? []).forEach((item: any) => {
          menuById.set(item.id as string, item as MenuItem);
        });
      }

      const mergedByItemId = new Map<
        string,
        {
          name: string;
          qty: number;
          category?: string | null;
          plu?: string | null;
          kitchen_label?: string | null;
          note?: string | null;
        }
      >();

      rowsToPrint.forEach((row) => {
        const item = menuById.get(row.item_id);
        if (!item) return;

        const existing = mergedByItemId.get(row.item_id);
        if (existing) {
          existing.qty += row.deltaQty;
          if (row.note && !existing.note) existing.note = row.note;
          return;
        }

        mergedByItemId.set(row.item_id, {
          name: item.name,
          qty: row.deltaQty,
          category: item.category,
          plu: item.plu,
          kitchen_label: item.kitchen_label,
          note: row.note,
        });
      });

      const printableItems = Array.from(mergedByItemId.values());

      if (printableItems.length === 0) {
        alert("Keine druckbaren Artikel gefunden.");
        return;
      }

      await printKitchenItems(orderModalFor.id, printableItems);

      await Promise.all(
        rowsToPrint.map((row) =>
          supabase
            .from("order_items")
            .update({ printed_qty: row.qty })
            .eq("id", row.id)
        )
      );

      await loadOpenOrderIntoModal(orderModalFor.id);
      await refreshTotals([orderModalFor.id]);
    } catch (error) {
      console.error("Kitchen print failed:", error);
      alert("Bon konnte nicht gedruckt werden.");
    }
  }

  /* =========================
     Render
     ========================= */

  return (
    <div className="p-4 md:p-6 lg:p-8 space-y-4">
      {(loadingTables || loadingReservations || backendWaking) && (
        <div className="rounded-xl border border-yellow-500/40 bg-yellow-500/10 px-3 py-2 text-sm text-yellow-200">
          {backendWaking
            ? "Supabase wird gerade aufgeweckt. Bitte kurz warten ..."
            : "Daten werden geladen ..."}
        </div>
      )}
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-2">
          <button
            className={cls(
              "px-3 py-2 rounded-xl border text-sm",
              activeView === "TABLES"
                ? "bg-white text-black border-white"
                : "bg-transparent text-white border-white/20"
            )}
            onClick={() => setActiveView("TABLES")}
          >
            Tische
          </button>
          <button
            className={cls(
              "px-3 py-2 rounded-xl border text-sm",
              activeView === "RESERVATIONS"
                ? "bg-white text-black border-white"
                : "bg-transparent text-white border-white/20"
            )}
            onClick={() => setActiveView("RESERVATIONS")}
          >
            Reservierungen
          </button>
        </div>

        <div className="flex items-center gap-2 text-sm">
          <div className="px-3 py-2 rounded-xl border border-white/20 bg-white/5">
            {currentUsername || "Benutzer"}
            {currentRole ? ` · ${currentRole}` : ""}
          </div>
          <button
            className="px-3 py-2 rounded-xl border border-red-400/40 text-red-200 hover:bg-red-500/10"
            onClick={() => void handleLogout()}
          >
            Logout
          </button>
        </div>
      </div>
      {activeView === "RESERVATIONS" && (
        <ReservationBook
          reservations={reservations}
          tables={tables}
          rbName={rbName}
          rbParty={rbParty}
          rbTime={rbTime}
          setRbName={setRbName}
          setRbParty={setRbParty}
          setRbTime={setRbTime}
          addReservationToBook={addReservationToBook}
          assignReservationToTable={assignReservationToTable}
          removeReservation={removeReservation}
        />
      )}
      {activeView === "TABLES" && (
        <>
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <h1 className="text-2xl font-semibold">Tisch-Übersicht</h1>
        <div className="flex items-center gap-2">
          <input
            className="border rounded-xl px-3 py-2 w-48"
            placeholder="Suchen (Tisch/Name)"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />

        </div>
      </div>

      {/* Legende */}
      <div className="flex flex-wrap gap-2 text-sm">
        {(Object.keys(STATUS_META) as TableStatus[]).map((s) => (
          <span key={s} className={cls("px-2 py-1 rounded-full border", badgeColor(s))}>
            {STATUS_META[s].label}
          </span>
        ))}
      </div>

      {/* Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
        {filtered.map((t) => (
          <TableCard
            key={t.id}
            table={t}
            statusMeta={STATUS_META}
            statusColor={statusColor}
            openOrdersTotal={openOrdersTotal}
            onSeatNow={(table) => handleAction(table, "SEAT_NOW")}
            onCheckIn={(table) => handleAction(table, "CHECKIN")}
            onCancel={(table) => handleAction(table, "CANCEL")}
            onOpenOrder={async (table) => {
              setOrderModalFor(table);
              setPlu("");
              setPluQty(1);
              await loadOpenOrderIntoModal(table.id);
            }}
            onClean={(table) => handleAction(table, "CLEAN")}
          />
        ))}
      </div>

      {/* Order Modal */}
      {orderModalFor && (
        <OrderModal
          orderModalFor={orderModalFor}
          basket={basket}
          itemNotes={itemNotes}
          itemCache={itemCache}
          menu={menu}
          tables={tables}
          moveTargetTableId={moveTargetTableId}
          setMoveTargetTableId={setMoveTargetTableId}
          onMoveOrder={moveOpenOrderToTable}
          plu={plu}
          pluQty={pluQty}
          pluInputRef={pluInputRef}
          setPlu={setPlu}
          setPluQty={setPluQty}
          addPluToBasket={addPluToBasket}
          updateQtyAndPersist={updateQtyAndPersist}
          updateNoteAndPersist={updateNoteAndPersist}
          onClose={closeOrderModal}
          onCheckout={handleCheckout}
          onPrintKitchenBon={printCurrentKitchenBon}
        />
      )}

      {/* Footer */}
          <div className="pt-2 text-sm opacity-80">
            Gesamt: {totals.ALL} · Frei: {totals.FREE} · Reserviert: {totals.RESERVED} ·{" "}
            Belegt: {totals.SEATED} · Reinigung: {totals.DIRTY}
          </div>
        </>
      )}
    </div>
  );
} 
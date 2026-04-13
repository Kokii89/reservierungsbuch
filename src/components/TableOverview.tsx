"use client";
import React, { useMemo, useState, useEffect, useRef } from "react";
import { supabase } from "@/lib/supabase";
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
const [basket, setBasket] = useState<Record<string, number>>({});
const [loadedBasket, setLoadedBasket] = useState<Record<string, number>>({});
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
    (sum, it: any) => sum + it.qty * it.price_cents,
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
      (payload) => {
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
      (payload) => {
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
      async (payload) => {
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
      async (payload) => {
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
      .select("id, item_id, qty, price_cents")
      .eq("order_id", orderId);

    if (error) throw error;

    const rows = (existingRows ?? []) as Array<{
      id: string;
      item_id: string;
      qty: number;
      price_cents: number;
    }>;

    const grouped: Record<string, Array<{ id: string; qty: number; price_cents: number }>> = {};
    rows.forEach((row) => {
      if (!grouped[row.item_id]) grouped[row.item_id] = [];
      grouped[row.item_id].push({ id: row.id, qty: row.qty, price_cents: row.price_cents });
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
            const { error: updateErr } = await supabase
              .from("order_items")
              .update({ qty: row.qty - removeNeeded })
              .eq("id", row.id);
            if (updateErr) throw updateErr;
            removeNeeded = 0;
          }
        }
      }
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
    } catch (err) {
      console.error(err);
      setBasket({});
      setLoadedBasket({});
      setItemCache({});
    }
  }

    

  function closeOrderModal() {
    setOrderModalFor(null);
    setBasket({});
    setLoadedBasket({});
    setItemCache({});
    setPlu("");
    setPluQty(1);
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
          itemCache={itemCache}
          menu={menu}
          plu={plu}
          pluQty={pluQty}
          pluInputRef={pluInputRef}
          setPlu={setPlu}
          setPluQty={setPluQty}
          addPluToBasket={addPluToBasket}
          updateQtyAndPersist={updateQtyAndPersist}
          onClose={closeOrderModal}
          onCheckout={handleCheckout}
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
"use client";
import React, { useMemo, useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";

/* =========================
   Helpers & Konstanten
   ========================= */

   // Helper: egal ob number (ms) oder string -> immer ISO oder null
const toISO = (v: number | string | null | undefined) =>
  v ? new Date(v as any).toISOString() : null;

const STATUS_META = {
  FREE: { label: "Frei", badge: "FREE" },
  RESERVED: { label: "Reserviert", badge: "RES" },
  SEATED: { label: "Belegt", badge: "IN" },
  DIRTY: { label: "Reinigung", badge: "DIRTY" },
} as const;

type TableStatus = keyof typeof STATUS_META;

// Typ für Einträge im Reservierungsbuch
type Reservation = {
  id: string;        // z.B. Date.now() als String
  name: string;
  partySize: number;
  time: string;      // "HH:MM" (heute)
  tableId?: string;  // gesetzt, wenn zugewiesen
};

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

const statusOrder: TableStatus[] = ["SEATED", "RESERVED", "DIRTY", "FREE"];

function since(ts?: number | string | null) {
  if (!ts) return "–";
  const d = Date.now() - new Date(ts).getTime();
  const mins = Math.floor(d / 60000);
  if (mins < 1) return "<1m";
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${h}h ${m}m`;
}

function formatTime(ts?: number | string | null) {
  if (ts === null || typeof ts === "undefined") return "";
  const d = new Date(ts as any);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

function minutesSince(ts?: number | string | null) {
  if (!ts) return 0;
  const d = Date.now() - new Date(ts).getTime();
  return Math.floor(d / 60000);
}

function cls(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
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

type Table = {
  id: string;
  capacity: number;
  status: TableStatus;
  name?: string;
  partySize?: number;
  since: number | string | null;
  note?: string;
  reservedFor?: number | string | null;
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
  const [filter, setFilter] = useState<TableStatus | "ALL">("ALL");
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

  // --- Effects ---
  // 1) Ticker + Auto-Storno (RESERVED > 30 min ab reservedFor -> FREE + note)
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

// Initial: Tische laden
useEffect(() => {
  (async () => {
    const { data, error } = await supabase
      .from("tables")
      .select("*")
      .order("id", { ascending: true });

    if (error) {
      console.error("Supabase load tables error:", error);
      return;
    }
    if (data) {
      setLocalTables(data.map(fromRow));
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
          next.sort((a, b) => a.id.localeCompare(b.id));
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
    const { data, error } = await supabase
      .from("reservations")
      .select("*")
      .order("time", { ascending: true });

    if (error) {
      console.error("Supabase load reservations error:", error);
      return;
    }
    if (data) {
      setReservations(
        data.map((r: any) => ({
          id: r.id,
          name: r.name,
          partySize: r.party_size,
          time: r.time, // ISO-Zeitstempel oder timestamptz -> du zeigst ihn formatiert
        }))
      );
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

  // --- Abgeleitete Werte ---
  const tables = externalTables?.length ? externalTables : localTables;

  const filtered = useMemo(() => {
    return tables
      .filter((t) => (filter === "ALL" ? true : t.status === filter))
      .filter((t) =>
        query ? `${t.id} ${t.name ?? ""}`.toLowerCase().includes(query.toLowerCase()) : true
      )
      .sort(
        (a, b) =>
          statusOrder.indexOf(a.status) - statusOrder.indexOf(b.status) ||
          a.id.localeCompare(b.id)
      );
  }, [tables, filter, query, tick]);

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
        name = null;
        partySize = null;
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

  /* =========================
     Render
     ========================= */

  return (

    <div className="p-4 md:p-6 lg:p-8 space-y-4">
      {/* Header */}
      <section className="space-y-3">
  <h2 className="text-xl font-semibold">Reservierungsbuch</h2>

  {/* Erfassungsformular */}
  <div className="flex flex-wrap items-end gap-2">
    <label className="text-sm">Name
      <input className="mt-1 border rounded px-2 py-1 block"
             value={rbName} onChange={(e)=>setRbName(e.target.value)} />
    </label>
    <label className="text-sm">Personen
      <input type="number" min={1} className="mt-1 border rounded px-2 py-1 block w-20"
             value={rbParty} onChange={(e)=>setRbParty(Number(e.target.value))} />
    </label>
    <label className="text-sm">Uhrzeit
      <input type="time" className="mt-1 border rounded px-2 py-1 block"
             value={rbTime} onChange={(e)=>setRbTime(e.target.value)} />
    </label>
    <button onClick={addReservationToBook}
            className="px-3 py-2 text-sm rounded bg-blue-600 text-white hover:bg-blue-700">
      Hinzufügen
    </button>
  </div>

  {/* Liste offener Reservierungen */}
  <div className="overflow-x-auto">
    <table className="min-w-full text-sm border-separate border-spacing-y-2">
      <thead className="text-xs opacity-70">
        <tr><th className="text-left">Zeit</th><th>Name</th><th>Pers.</th><th>Zuweisen</th><th/></tr>
      </thead>
      <tbody>
        {[...reservations].sort((a,b)=>a.time.localeCompare(b.time)).map(r => {
          const candidates = tables.filter(t => t.status==="FREE");
          return (
            <tr key={r.id} className="align-middle">
              <td className="py-1 pr-4 opacity-80">{r.time}</td>
              <td className="py-1 pr-4">{r.name}</td>
              <td className="py-1 pr-4">{r.partySize}</td>
              <td className="py-1 pr-4">
                <div className="flex items-center gap-2">
                  <select id={`sel-${r.id}`} className="border rounded px-2 py-1">
                    {candidates.length===0 && <option>Keine frei</option>}
                    {candidates.map(t => (
                      <option key={t.id} value={t.id}>{t.id} (Kap {t.capacity})</option>
                    ))}
                  </select>
                  <button
                    className="px-2 py-1 text-xs rounded bg-green-600 text-white hover:bg-green-700"
                    disabled={candidates.length===0}
                    onClick={() => {
                      const sel = document.getElementById(`sel-${r.id}`) as HTMLSelectElement | null;
                      const tableId = sel?.value;
                      if (tableId) assignReservationToTable(r.id, tableId);
                    }}
                  >Zuweisen</button>
                </div>
              </td>
              <td className="py-1">
                <button className="px-2 py-1 text-xs rounded border hover:bg-white/10"
                        onClick={()=>removeReservation(r.id)}>Löschen</button>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  </div>
</section>
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <h1 className="text-2xl font-semibold">Tisch-Übersicht</h1>
        <div className="flex items-center gap-2">
          <input
            className="border rounded-xl px-3 py-2 w-48"
            placeholder="Suchen (Tisch/Name)"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <select
            className="border rounded-xl px-3 py-2"
            value={filter}
            onChange={(e) => setFilter((e.target.value as TableStatus | "ALL") ?? "ALL")}
          >
            <option value="ALL">Alle</option>
            {(Object.keys(STATUS_META) as TableStatus[]).map((s) => (
              <option key={s} value={s}>
                {STATUS_META[s].label}
              </option>
            ))}
          </select>

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
        {filtered.map((t) => {
          // Timer-Highlights
        const mins = minutesSince(t.since);
       const resMs = t.reservedFor ? new Date(t.reservedFor as any).getTime() : 0;
const minsToRes = resMs ? Math.floor((Date.now() - resMs) / 60000) : 0;
        const warnReserved   = t.status === "RESERVED" && t.reservedFor && minsToRes >= 20 && minsToRes < 30;
        const overdueReserved = t.status === "RESERVED" && t.reservedFor && minsToRes >= 30;
        const longSeated = t.status === "SEATED" && mins >= 90;
        const ringCls = overdueReserved
            ? "ring-2 ring-red-400"
            : warnReserved
            ? "ring-2 ring-yellow-300"
            : longSeated
            ? "ring-2 ring-yellow-400"
            : "";
          return (
            <div
              key={t.id}
              className={cls(
                "rounded-2xl border p-3 shadow-sm hover:shadow-md transition",
                statusColor(t.status),
                ringCls
              )}
            >
              <div className="flex items-center justify-between">
      <div className="font-semibold">{t.id}</div>
      <div className="flex flex-col items-end">
      <div className="text-xs opacity-70">{STATUS_META[t.status]?.badge}</div>
        {t.status === "SEATED" && (
      <div className="text-sm font-bold mt-1">
        ⏱ {since(t.since)}
      </div>
    )}
      </div>
      </div>

{t.name && (
  <div className="mt-2 text-sm opacity-80">{t.name}</div>
)}
{t.partySize && (
  <div className="mt-1 text-xs opacity-60">{t.partySize} Pers.</div>
)}

              {t.note && <div className="mt-1 text-xs italic opacity-70">{t.note}</div>}

{t.status === "RESERVED" && t.reservedFor ? (
  <div className="mt-2 text-xs opacity-80">
    Reserviert für: {formatTime(t.reservedFor)}
  </div>
) : (
  <div className="mt-2 text-xs opacity-60">Seit: {since(t.since)}</div>
)}
{warnReserved && (
  <div className="mt-1 text-xs text-yellow-300 font-semibold">
    Gast verspätet
  </div>
)}

{overdueReserved && (
  <div className="mt-1 text-xs text-red-300 font-semibold">
    No-Show (30m+)
  </div>
)}

{longSeated && (
  <div className="mt-1 text-xs text-yellow-300 font-semibold">
    Tisch &gt; 90m belegt
  </div>
)}
              {/* Aktionsleiste */}
              <div className="mt-2 flex flex-wrap gap-1">
                {t.status === "FREE" && (
                  <>
                    <button
                      onClick={() => handleAction(t, "SEAT_NOW")}
                      className="px-2 py-1 text-xs rounded bg-green-600 text-white hover:bg-green-700">
                      Gäste platzieren
                    </button>
                  </>
                )}
                {t.status === "RESERVED" && (
                  <>
                    <button
                      onClick={() => handleAction(t, "CHECKIN")}
                      className="px-2 py-1 text-xs rounded bg-green-600 text-white hover:bg-green-700"
                    >
                      Check-in
                    </button>
                    <button
                      onClick={() => handleAction(t, "CANCEL")}
                      className="px-2 py-1 text-xs rounded bg-gray-600 text-white hover:bg-gray-700"
                    >
                      Stornieren
                    </button>
                  </>
                )}

                {t.status === "SEATED" && (
                  <button
                    onClick={() => handleAction(t, "CHECKOUT")}
                    className="px-2 py-1 text-xs rounded bg-red-600 text-white hover:bg-red-700"
                  >
                    Checkout
                  </button>
                )}

                {t.status === "DIRTY" && (
                  <button
                    onClick={() => handleAction(t, "CLEAN")}
                    className="px-2 py-1 text-xs rounded bg-blue-600 text-white hover:bg-blue-700"
                  >
                    Reinigen
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Footer */}
      <div className="pt-2 text-sm opacity-80">
        Gesamt: {totals.ALL} · Frei: {totals.FREE} · Reserviert: {totals.RESERVED} ·{" "}
        Belegt: {totals.SEATED} · Reinigung: {totals.DIRTY}
      </div>
    </div>
  );
}
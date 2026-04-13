import React from "react";
import { Table } from "@/types/restaurant";
import { since, formatPrice, formatTime, minutesSince, cls } from "@/utils/tableHelpers";

type Props = {
  table: Table;
  statusMeta: Record<string, { label: string; badge: string }>;
  statusColor: (status: Table["status"]) => string;
  onSeatNow: (table: Table) => void;
  onCheckIn: (table: Table) => void;
  onCancel: (table: Table) => void;
  onOpenOrder: (table: Table) => void;
  onClean: (table: Table) => void;
  openOrdersTotal: Record<string, number>;
};

export default function TableCard({
  table,
  statusMeta,
  statusColor,
  onSeatNow,
  onCheckIn,
  onCancel,
  onOpenOrder,
  onClean,
  openOrdersTotal,
}: Props) {
  const mins = minutesSince(table.since);
  const resMs = table.reservedFor ? new Date(table.reservedFor as any).getTime() : 0;
  const minsToRes = resMs ? Math.floor((Date.now() - resMs) / 60000) : 0;

  const warnReserved =
    table.status === "RESERVED" && table.reservedFor && minsToRes >= 20 && minsToRes < 30;

  const overdueReserved =
    table.status === "RESERVED" && table.reservedFor && minsToRes >= 30;

  const longSeated = table.status === "SEATED" && mins >= 90;

  const ringCls = overdueReserved
    ? "ring-2 ring-red-400"
    : warnReserved
    ? "ring-2 ring-yellow-300"
    : longSeated
    ? "ring-2 ring-yellow-400"
    : "";

  return (
    <div
      className={cls(
        "rounded-2xl border p-3 shadow-sm hover:shadow-md transition",
        statusColor(table.status),
        ringCls
      )}
    >
      <div className="flex items-center justify-between">
        <div className="font-semibold">{table.id}</div>
        <div className="flex flex-col items-end">
          <div className="text-xs opacity-70">{statusMeta[table.status]?.badge}</div>
          {table.status === "SEATED" && (
            <div className="text-sm font-bold mt-1">⏱ {since(table.since)}</div>
          )}
        </div>
      </div>

      {table.name && <div className="mt-2 text-sm opacity-80">{table.name}</div>}
      {table.partySize && (
        <div className="mt-1 text-xs opacity-60">{table.partySize} Pers.</div>
      )}

      {table.status === "SEATED" && (
        <div className="mt-1 text-sm font-semibold">
          Summe: {formatPrice(openOrdersTotal[table.id] ?? 0)}
        </div>
      )}

      {table.note && <div className="mt-1 text-xs italic opacity-70">{table.note}</div>}

      {table.status === "RESERVED" && table.reservedFor ? (
        <div className="mt-2 text-xs opacity-80">
          Reserviert für: {formatTime(table.reservedFor)}
        </div>
      ) : (
        <div className="mt-2 text-xs opacity-60">Seit: {since(table.since)}</div>
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

      <div className="mt-2 flex flex-wrap gap-1">
        {table.status === "FREE" && (
          <button
            onClick={() => onSeatNow(table)}
            className="px-2 py-1 text-xs rounded bg-green-600 text-white hover:bg-green-700"
          >
            Gäste platzieren
          </button>
        )}

        {table.status === "RESERVED" && (
          <>
            <button
              onClick={() => onCheckIn(table)}
              className="px-2 py-1 text-xs rounded bg-green-600 text-white hover:bg-green-700"
            >
              Check-in
            </button>
            <button
              onClick={() => onCancel(table)}
              className="px-2 py-1 text-xs rounded bg-gray-600 text-white hover:bg-gray-700"
            >
              Stornieren
            </button>
          </>
        )}

        {table.status === "SEATED" && (
          <button
            onClick={() => onOpenOrder(table)}
            className="px-2 py-1 text-xs rounded bg-blue-600 text-white hover:bg-blue-700"
          >
            Bestellung
          </button>
        )}

        {table.status === "DIRTY" && (
          <button
            onClick={() => onClean(table)}
            className="px-2 py-1 text-xs rounded bg-blue-600 text-white hover:bg-blue-700"
          >
            Reinigen
          </button>
        )}
      </div>
    </div>
  );
}
import React from "react";
import { Reservation, Table } from "@/types/restaurant";

type Props = {
  reservations: Reservation[];
  tables: Table[];
  rbName: string;
  rbParty: number;
  rbTime: string;
  setRbName: (value: string) => void;
  setRbParty: (value: number) => void;
  setRbTime: (value: string) => void;
  addReservationToBook: () => void;
  assignReservationToTable: (resId: string, tableId: string) => void;
  removeReservation: (id: string) => void;
};

export default function ReservationBook({
  reservations,
  tables,
  rbName,
  rbParty,
  rbTime,
  setRbName,
  setRbParty,
  setRbTime,
  addReservationToBook,
  assignReservationToTable,
  removeReservation,
}: Props) {
  return (
    <section className="space-y-3">
      <h2 className="text-xl font-semibold">Reservierungsbuch</h2>

      <div className="flex flex-wrap items-end gap-2">
        <label className="text-sm">
          Name
          <input
            className="mt-1 border rounded px-2 py-1 block"
            value={rbName}
            onChange={(e) => setRbName(e.target.value)}
          />
        </label>

        <label className="text-sm">
          Personen
          <input
            type="number"
            min={1}
            className="mt-1 border rounded px-2 py-1 block w-20"
            value={rbParty}
            onChange={(e) => setRbParty(Number(e.target.value))}
          />
        </label>

        <label className="text-sm">
          Uhrzeit
          <input
            type="time"
            className="mt-1 border rounded px-2 py-1 block"
            value={rbTime}
            onChange={(e) => setRbTime(e.target.value)}
          />
        </label>

        <button
          onClick={addReservationToBook}
          className="px-3 py-2 text-sm rounded bg-blue-600 text-white hover:bg-blue-700"
        >
          Hinzufügen
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full text-sm border-separate border-spacing-y-2">
          <thead className="text-xs opacity-70">
            <tr>
              <th className="text-left">Zeit</th>
              <th className="text-left">Name</th>
              <th className="text-left">Pers.</th>
              <th className="text-left">Zuweisen</th>
              <th />
            </tr>
          </thead>

          <tbody>
            {[...reservations]
              .sort((a, b) => a.time.localeCompare(b.time))
              .map((r) => {
                const candidates = tables.filter((t) => t.status === "FREE");

                return (
                  <tr key={r.id} className="align-middle">
                    <td className="py-1 pr-4 opacity-80">{r.time}</td>
                    <td className="py-1 pr-4">{r.name}</td>
                    <td className="py-1 pr-4">{r.partySize}</td>
                    <td className="py-1 pr-4">
                      <div className="flex items-center gap-2">
                        <select
                          id={`sel-${r.id}`}
                          className="border rounded px-2 py-1"
                        >
                          {candidates.length === 0 && <option>Keine frei</option>}
                          {candidates.map((t) => (
                            <option key={t.id} value={t.id}>
                              {t.id} (Kap {t.capacity})
                            </option>
                          ))}
                        </select>

                        <button
                          className="px-2 py-1 text-xs rounded bg-green-600 text-white hover:bg-green-700"
                          disabled={candidates.length === 0}
                          onClick={() => {
                            const sel = document.getElementById(
                              `sel-${r.id}`
                            ) as HTMLSelectElement | null;
                            const tableId = sel?.value;
                            if (tableId) assignReservationToTable(r.id, tableId);
                          }}
                        >
                          Zuweisen
                        </button>
                      </div>
                    </td>

                    <td className="py-1">
                      <button
                        className="px-2 py-1 text-xs rounded border hover:bg-white/10"
                        onClick={() => removeReservation(r.id)}
                      >
                        Löschen
                      </button>
                    </td>
                  </tr>
                );
              })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
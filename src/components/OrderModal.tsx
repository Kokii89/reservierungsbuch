import React, { useMemo, useState } from "react";
import { MenuItem, Table } from "@/types/restaurant";
import { formatPrice } from "@/utils/tableHelpers";

type Props = {
  orderModalFor: Table | null;
  basket: Record<string, number>;
  itemNotes: Record<string, string>;
  itemCache: Record<string, MenuItem>;
  menu: MenuItem[];
  tables: Table[];
  moveTargetTableId: string;
  setMoveTargetTableId: (value: string) => void;
  onMoveOrder: (targetTableId: string) => Promise<void>;
  plu: string;
  pluQty: number;
  pluInputRef: React.RefObject<HTMLInputElement | null>;
  setPlu: (value: string) => void;
  setPluQty: (value: number) => void;
  addPluToBasket: () => void;
  updateQtyAndPersist: (itemId: string, q: number) => Promise<void>;
  updateNoteAndPersist: (itemId: string, note: string) => Promise<void>;
  onClose: () => void;
  onCheckout: () => Promise<void>;
  onPrintKitchenBon: () => void | Promise<void>;
};

export default function OrderModal({
  orderModalFor,
  basket,
  itemNotes,
  itemCache,
  menu,
  tables,
  moveTargetTableId,
  setMoveTargetTableId,
  onMoveOrder,
  plu,
  pluQty,
  pluInputRef,
  setPlu,
  setPluQty,
  addPluToBasket,
  updateQtyAndPersist,
  updateNoteAndPersist,
  onClose,
  onCheckout,
  onPrintKitchenBon,
}: Props) {
  if (!orderModalFor) return null;

  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState<string>("all");

  const categories = useMemo(() => {
    const unique = Array.from(
      new Set(menu.map((item) => item.category).filter(Boolean))
    ) as string[];

    return ["all", ...unique];
  }, [menu]);

  const filteredMenu = useMemo(() => {
    const query = search.trim().toLowerCase();

    return menu.filter((item) => {
      const matchesCategory =
        activeCategory === "all" || item.category === activeCategory;

      const matchesSearch =
        !query ||
        item.name.toLowerCase().includes(query) ||
        String(item.plu ?? "")
          .toLowerCase()
          .includes(query);

      return matchesCategory && matchesSearch && item.active;
    });
  }, [menu, search, activeCategory]);

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white text-black rounded-xl p-4 w-[420px] max-h-[80vh] overflow-auto shadow-xl">
        <h2 className="text-lg font-semibold mb-2">
          Bestellung – {orderModalFor.id}
        </h2>

        <div className="mb-4 rounded-lg border p-3 space-y-3">
          <div className="space-y-3">
            <label className="text-sm block">
              Suche nach Name oder PLU
              <div className="mt-1 flex gap-2">
                <input
                  className="min-w-0 flex-1 border rounded px-2 py-2"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="z. B. Udon, Cola, 1105"
                />

                {search.length > 0 && (
                  <button
                    type="button"
                    className="shrink-0 rounded border px-3 py-2 text-sm hover:bg-gray-50"
                    onClick={() => setSearch("")}
                  >
                    Löschen
                  </button>
                )}
              </div>

              {search.trim().length > 0 && (
                <div className="mt-2 max-h-48 overflow-auto rounded-lg border bg-white shadow-sm">
                  {filteredMenu.length === 0 ? (
                    <div className="p-3 text-sm opacity-70">
                      Keine Artikel gefunden.
                    </div>
                  ) : (
                    <div className="divide-y">
                      {filteredMenu.slice(0, 12).map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          className="w-full text-left p-3 hover:bg-gray-50"
                          onClick={() => {
                            setPlu(String(item.plu ?? ""));
                            setSearch("");
                            if (pluInputRef.current) {
                              pluInputRef.current.focus();
                            }
                          }}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="font-medium break-words">{item.name}</div>
                              <div className="text-xs opacity-70 mt-1">
                                PLU {item.plu} • {item.category ?? "ohne Kategorie"}
                              </div>
                            </div>
                            <div className="shrink-0 text-sm font-medium">
                              {formatPrice(item.price_cents)}
                            </div>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </label>

            <div className="grid grid-cols-[1fr_auto] gap-2 sm:grid-cols-[200px_auto] sm:items-end">
              <label className="text-sm">
                PLU
                <input
                  ref={pluInputRef}
                  className="mt-1 border rounded px-2 py-2 block w-full"
                  value={plu}
                  onChange={(e) => setPlu(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addPluToBasket();
                    }
                  }}
                  placeholder="z. B. 101"
                />
              </label>
              <button
                className="rounded bg-blue-600 px-3 py-2 text-sm text-white hover:bg-blue-700"
                onClick={addPluToBasket}
              >
                Hinzufügen
              </button>
            </div>
          </div>
        </div>

        <div className="space-y-2">
          {Object.entries(basket).length === 0 && (
            <div className="text-sm opacity-70">Noch keine Positionen hinzugefügt.</div>
          )}

          {Object.entries(basket).map(([id, q]) => {
            const it = itemCache[id] || menu.find((m) => m.id === id);
            if (!it) return null;

            return (
              <div
                key={id}
                className="flex items-start justify-between gap-3 rounded-lg border p-2"
              >
                <div className="min-w-0 flex-1 space-y-2">
                  <div>
                    <div className="font-medium">
                      {it.name}
                      {it.plu ? ` (PLU ${it.plu})` : ""}
                    </div>
                    <div className="text-xs opacity-70 mt-1">
                      {(q as number)} × {formatPrice(it.price_cents)} ={" "}
                      {formatPrice((q as number) * it.price_cents)}
                    </div>
                  </div>

                  <label className="block text-xs">
                    Sonderwunsch / Notiz
                    <input
                      className="mt-1 w-full rounded border px-2 py-1 text-sm"
                      value={itemNotes[id] ?? ""}
                      onChange={(e) => void updateNoteAndPersist(id, e.target.value)}
                      placeholder="z. B. ohne Zwiebeln, extra scharf"
                    />
                  </label>
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  <button
                    className="px-2 py-1 border rounded"
                    onClick={() => void updateQtyAndPersist(id, Math.max(0, (q as number) - 1))}
                  >
                    –
                  </button>

                  <input
                    className="w-12 text-center border rounded py-1"
                    value={q as number}
                    onChange={(e) =>
                      void updateQtyAndPersist(
                        id,
                        Math.max(0, parseInt(e.target.value || "0", 10))
                      )
                    }
                  />

                  <button
                    className="px-2 py-1 border rounded"
                    onClick={() => void updateQtyAndPersist(id, (q as number) + 1)}
                  >
                    +
                  </button>

                  <button
                    className="px-2 py-1 border rounded text-red-600 border-red-300 hover:bg-red-50"
                    onClick={() => void updateQtyAndPersist(id, 0)}
                    title="Position löschen"
                  >
                    ×
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        <div className="mt-3 rounded-lg border p-3 space-y-2">
          <div className="text-sm font-medium">Tisch wechseln</div>
          <div className="flex gap-2">
            <select
              className="min-w-0 flex-1 rounded border px-2 py-2 text-sm"
              value={moveTargetTableId}
              onChange={(e) => setMoveTargetTableId(e.target.value)}
            >
              <option value="">Zieltisch auswählen</option>
              {tables
                .filter((table) => table.id !== orderModalFor.id && table.status === "FREE")
                .sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }))
                .map((table) => (
                  <option key={table.id} value={table.id}>
                    {table.id}
                  </option>
                ))}
            </select>

            <button
              type="button"
              className="rounded bg-orange-600 px-3 py-2 text-sm text-white hover:bg-orange-700 disabled:opacity-50"
              disabled={!moveTargetTableId}
              onClick={() => void onMoveOrder(moveTargetTableId)}
            >
              Umbuchen
            </button>
          </div>
          <div className="text-xs opacity-70">
            Nur freie Tische werden angezeigt. Bestehende Bestellungen werden nicht zusammengeführt.
          </div>
        </div>
        <div className="mt-3 text-right font-semibold">
          Summe:{" "}
          {formatPrice(
            Object.entries(basket).reduce((s, [id, qty]) => {
              const it = itemCache[id] || menu.find((m) => m.id === id);
              return s + (it ? it.price_cents * (qty as number) : 0);
            }, 0)
          )}
        </div>

        <div className="mt-3 flex justify-end gap-2">
          <button className="px-3 py-1 text-sm rounded border" onClick={onClose}>
            Schließen
          </button>

          <button
            className="px-3 py-1 text-sm rounded bg-blue-600 text-white hover:bg-blue-700"
            onClick={() => void onPrintKitchenBon()}
          >
            Bon drucken
          </button>

          <button
            className="px-3 py-1 text-sm rounded bg-green-600 text-white hover:bg-green-700"
            onClick={() => void onCheckout()}
          >
            Bezahlen &amp; Checkout
          </button>
        </div>
      </div>
    </div>
  );
}
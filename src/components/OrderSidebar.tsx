// src/components/OrderSidebar.tsx
"use client";

type OrderSidebarProps = {
  title?: string;
  subtitle?: string;
  totalLabel?: string;
  totalValue?: string;
  children?: React.ReactNode;
};

export default function OrderSidebar({
  title = "Aktuelle Bestellung",
  subtitle = "Tisch auswählen oder Bestellung öffnen",
  totalLabel = "Gesamt",
  totalValue = "0,00 €",
  children,
}: OrderSidebarProps) {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold">{title}</h2>
        <p className="text-sm text-white/50 mt-1">{subtitle}</p>
      </div>

      <div className="rounded-2xl border border-white/10 bg-black/20 p-4 min-h-[220px]">
        {children ?? (
          <div className="text-sm text-white/50">
            Noch keine aktive Bestellung geöffnet.
          </div>
        )}
      </div>

      <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
        <div className="flex items-center justify-between text-sm text-white/60">
          <span>{totalLabel}</span>
          <span className="text-lg font-semibold text-white">{totalValue}</span>
        </div>

        <button className="mt-4 w-full rounded-2xl bg-white text-black px-4 py-3 font-medium disabled:opacity-50">
          Checkout
        </button>
      </div>
    </div>
  );
}
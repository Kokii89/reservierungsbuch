export type TableStatus = "FREE" | "RESERVED" | "SEATED" | "DIRTY";

export type Table = {
  id: string;
  capacity: number;
  status: TableStatus;
  name?: string;
  partySize?: number;
  since: number | string | null;
  reservedFor?: number | string | null;
  note?: string | null;
};

export type Reservation = {
  id: string;
  name: string;
  partySize: number;
  time: string;
  tableId?: string | null;
};

export type MenuItem = {
  id: string;
  name: string;
  price_cents: number;
  active: boolean;
  plu?: string | null;
};

export type Order = {
  id: string;
  table_id: string;
  status: "OPEN" | "PAID" | "CANCELLED";
  opened_at?: string;
  closed_at?: string | null;
};

export type OrderItem = {
  id: string;
  order_id: string;
  item_id: string;
  qty: number;
  price_cents: number;
};
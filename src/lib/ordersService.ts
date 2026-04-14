import { createClient } from "@/lib/supabase/client";
import { MenuItem } from "@/types/restaurant";

const supabase = createClient();

export async function getOrCreateOpenOrder(tableId: string): Promise<string> {
  const { data: exist, error: existErr } = await supabase
    .from("orders")
    .select("id, opened_at")
    .eq("table_id", tableId)
    .eq("status", "OPEN")
    .order("opened_at", { ascending: true });

  if (existErr) throw existErr;

  if (exist && exist.length > 0) {
    const keepId = exist[0].id as string;

    if (exist.length > 1) {
      const duplicateIds = exist.slice(1).map((o: any) => o.id);
      for (const duplicateId of duplicateIds) {
        await supabase
          .from("orders")
          .update({ status: "CANCELLED", closed_at: new Date().toISOString() })
          .eq("id", duplicateId);
      }
    }

    return keepId;
  }

  const { data, error } = await supabase
    .from("orders")
    .insert({ table_id: tableId, status: "OPEN" })
    .select("id")
    .single();

  if (error) throw error;
  return data!.id as string;
}

export async function loadOpenOrderData(tableId: string) {
  const { data: ords, error: ordErr } = await supabase
    .from("orders")
    .select("id")
    .eq("table_id", tableId)
    .eq("status", "OPEN")
    .limit(1);

  if (ordErr) throw ordErr;

  const orderId = ords?.[0]?.id;
  if (!orderId) {
    return {
      basket: {} as Record<string, number>,
      items: [] as Array<{ item_id: string; qty: number }>,
      menuRows: [] as MenuItem[],
    };
  }

  const { data: items, error: itemsErr } = await supabase
    .from("order_items")
    .select("item_id, qty")
    .eq("order_id", orderId);

  if (itemsErr) throw itemsErr;

  const basket: Record<string, number> = {};
  (items ?? []).forEach((it: any) => {
    basket[it.item_id] = (basket[it.item_id] ?? 0) + it.qty;
  });

  const ids = (items ?? []).map((it: any) => it.item_id);

  if (!ids.length) {
    return {
      basket,
      items: items ?? [],
      menuRows: [] as MenuItem[],
    };
  }

  const { data: menuRows, error: menuErr } = await supabase
    .from("menu_items")
    .select("*")
    .in("id", ids);

  if (menuErr) throw menuErr;

  return {
    basket,
    items: items ?? [],
    menuRows: (menuRows ?? []) as MenuItem[],
  };
}
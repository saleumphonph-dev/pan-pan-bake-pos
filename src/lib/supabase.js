import { createClient } from "@supabase/supabase-js";

// Supabase client — only initialised when env vars are present
const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = url && key ? createClient(url, key) : null;

/** Upsert a completed order to Supabase (fire-and-forget, never throws) */
export async function syncOrder(order) {
  if (!supabase) return;
  try {
    await supabase.from("sales").upsert({
      id:          order.id,
      date:        order.date,
      items:       order.items,
      total:       order.total,
      discount:    order.discount  ?? 0,
      payment:     order.payment,
      received:    order.received  ?? null,
      note:        order.note      ?? null,
      cashier:     order.cashier   ?? null,
      shift_id:    order.shiftId   ?? null,
      voided:      order.voided    ?? false,
      void_reason: order.voidReason?? null,
      parked_name: order.parkedName?? null,
    });
  } catch (e) {
    console.warn("[Supabase] syncOrder failed:", e.message);
  }
}

/** Upsert a shift record to Supabase (fire-and-forget, never throws) */
export async function syncShift(shift) {
  if (!supabase) return;
  try {
    await supabase.from("shifts").upsert({
      id:            shift.id,
      opened_at:     shift.openedAt,
      closed_at:     shift.closedAt    ?? null,
      cashier:       shift.cashier     ?? null,
      opening_cash:  shift.openingCash ?? 0,
      closing_cash:  shift.closingCash ?? null,
      expected_cash: shift.expectedCash?? null,
      variance:      shift.variance    ?? null,
      notes:         shift.notes       ?? null,
    });
  } catch (e) {
    console.warn("[Supabase] syncShift failed:", e.message);
  }
}

/** Check if Supabase is configured and reachable */
export async function checkConnection() {
  if (!supabase) return "no-db";
  try {
    const { error } = await supabase.from("sales").select("id").limit(1);
    return error ? "offline" : "online";
  } catch {
    return "offline";
  }
}

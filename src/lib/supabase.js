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

// Supabase/PostgREST caps a single response (default 1000 rows). Page through the
// whole table so we ALWAYS get every row — otherwise, once the shop passes ~1000
// sales, the newest ones get cut off and never appear on other devices.
async function fetchAllRows(table, orderCol) {
  if (!supabase) return null;
  const PAGE = 1000;
  let all = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from(table)
      .select("*")
      .order(orderCol, { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) return null;                 // any error → null (don't reconcile on a bad fetch)
    all = all.concat(data || []);
    if (!data || data.length < PAGE) break;  // last page reached
    if (from > 500000) break;                // hard safety stop
  }
  return all;
}

/** Fetch all sales from cloud — returns array shaped like local order objects, or null on error */
export async function fetchSales() {
  const rows = await fetchAllRows("sales", "date");
  if (rows == null) return null;
  return rows.map(r => ({
    id:         r.id,
    date:       r.date,
    items:      r.items,
    total:      r.total,
    discount:   r.discount ?? 0,
    payment:    r.payment,
    received:   r.received,
    note:       r.note,
    cashier:    r.cashier,
    shiftId:    r.shift_id,
    voided:     r.voided ?? false,
    voidReason: r.void_reason,
    parkedName: r.parked_name,
  }));
}

/** Fetch all shifts from cloud — returns array shaped like local shift objects, or null on error */
export async function fetchShifts() {
  const rows = await fetchAllRows("shifts", "opened_at");
  if (rows == null) return null;
  return rows.map(r => ({
    id:            r.id,
    openedAt:      r.opened_at,
    closedAt:      r.closed_at,
    cashier:       r.cashier,
    openingCash:   r.opening_cash ?? 0,
    closingCash:   r.closing_cash,
    expectedCash:  r.expected_cash,
    variance:      r.variance,
    notes:         r.notes,
  }));
}

/** Fetch all settings rows (menu, categories, add-ons, shop info) keyed by name.
 *  Returns { key: { value, updatedAt } } or null on error. */
export async function fetchSettings() {
  if (!supabase) return null;
  try {
    const { data, error } = await supabase.from("settings").select("*");
    if (error) return null;
    const out = {};
    data.forEach(r => { out[r.key] = { value: r.value, updatedAt: r.updated_at }; });
    return out;
  } catch { return null; }
}

/** Upsert one setting (menu/categories/addons/shopInfo) with a timestamp so the
 *  newest edit wins across devices. Fire-and-forget, never throws. */
export async function syncSetting(key, value, updatedAt) {
  if (!supabase) return;
  try {
    await supabase.from("settings").upsert({
      key,
      value,
      updated_at: updatedAt || new Date().toISOString(),
    });
  } catch (e) {
    console.warn("[Supabase] syncSetting failed:", e.message);
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

/** Wipe all rows from sales + shifts tables (used by Owner "Reset Test Data") */
export async function wipeAllCloudData() {
  if (!supabase) return { ok: true, note: "no-db" };
  try {
    const s = await supabase.from("sales").delete().neq("id", "__never__");
    const h = await supabase.from("shifts").delete().neq("id", "__never__");
    if (s.error || h.error) {
      return { ok: false, error: (s.error || h.error).message };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

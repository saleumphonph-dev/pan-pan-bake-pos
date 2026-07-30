import { createClient } from "@supabase/supabase-js";

// Supabase client — only initialised when env vars are present
const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = url && key ? createClient(url, key) : null;

/** Upsert a completed order to Supabase. Returns true on success, false on failure.
 *  Sets updated_at so incremental sync (fetchSalesSince) can pick up the change. */
export async function syncOrder(order) {
  if (!supabase) return false;
  try {
    const { error } = await supabase.from("sales").upsert({
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
      deleted:     order.deleted    ?? false,
      updated_at:  new Date().toISOString(),
    });
    return !error;
  } catch (e) {
    console.warn("[Supabase] syncOrder failed:", e.message);
    return false;
  }
}

/** Upsert a shift record to Supabase. Returns true on success, false on failure. */
export async function syncShift(shift) {
  if (!supabase) return false;
  try {
    const { error } = await supabase.from("shifts").upsert({
      id:            shift.id,
      opened_at:     shift.openedAt,
      closed_at:     shift.closedAt    ?? null,
      cashier:       shift.cashier     ?? null,
      opening_cash:  shift.openingCash ?? 0,
      closing_cash:  shift.closingCash ?? null,
      expected_cash: shift.expectedCash?? null,
      variance:      shift.variance    ?? null,
      notes:         shift.notes       ?? null,
      updated_at:    new Date().toISOString(),
    });
    return !error;
  } catch (e) {
    console.warn("[Supabase] syncShift failed:", e.message);
    return false;
  }
}

// Incremental fetch: only rows whose updated_at is newer than `since`. This is the
// key egress fix — steady-state polls transfer almost nothing instead of the whole
// table every time. A fresh device passes since=epoch, so it still gets everything
// once. Paginated (PostgREST caps a response at 1000 rows). Returns
// { rows, cursor } (cursor = newest updated_at seen, to use as `since` next time),
// or null on error (so the app never reconciles against a failed/empty fetch).
async function fetchChangedRows(table, since) {
  if (!supabase) return null;
  const PAGE = 1000;
  const runOn = async (col) => {
    let all = [], cursor = since;
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await supabase
        .from(table)
        .select("*")
        .gt(col, since)
        .order(col, { ascending: true })
        .range(from, from + PAGE - 1);
      if (error) return { error };
      (data || []).forEach(r => { const v = r[col]; if (v && v > cursor) cursor = v; });
      all = all.concat(data || []);
      if (!data || data.length < PAGE) break;
      if (from > 500000) break;
    }
    return { rows: all, cursor };
  };
  // Prefer updated_at (catches voids/edits). If that column doesn't exist yet
  // (migration pending), fall back to the creation-date column so NEW rows still
  // sync incrementally and cheaply; voids/edits catch up once updated_at exists.
  let res = await runOn("updated_at");
  if (res.error) res = await runOn(table === "shifts" ? "opened_at" : "date");
  if (res.error) return null;
  return { rows: res.rows, cursor: res.cursor };
}

/** Incremental sales fetch. `since` is an ISO timestamp. Returns { rows, cursor } or null. */
export async function fetchSalesSince(since) {
  const res = await fetchChangedRows("sales", since);
  if (res == null) return null;
  return {
    cursor: res.cursor,
    rows: res.rows.map(r => ({
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
      deleted:    r.deleted ?? false,
    })),
  };
}

/** Incremental shifts fetch. `since` is an ISO timestamp. Returns { rows, cursor } or null. */
export async function fetchShiftsSince(since) {
  const res = await fetchChangedRows("shifts", since);
  if (res == null) return null;
  return {
    cursor: res.cursor,
    rows: res.rows.map(r => ({
      id:            r.id,
      openedAt:      r.opened_at,
      closedAt:      r.closed_at,
      cashier:       r.cashier,
      openingCash:   r.opening_cash ?? 0,
      closingCash:   r.closing_cash,
      expectedCash:  r.expected_cash,
      variance:      r.variance,
      notes:         r.notes,
    })),
  };
}

/** Fetch just the timestamps of every settings row — key + updated_at only, no
 *  values. This is a few dozen bytes, versus megabytes for the full menu (photos
 *  live inside the menu blob). The poll runs this every 30s on every device and
 *  only downloads a value when its timestamp actually moved; re-fetching the whole
 *  menu each poll was a major egress drain and made syncs slow/flaky.
 *  Returns { key: updatedAt } or null on error. */
export async function fetchSettingsMeta() {
  if (!supabase) return null;
  try {
    const { data, error } = await supabase.from("settings").select("key,updated_at");
    if (error) return null;
    const out = {};
    data.forEach(r => { out[r.key] = r.updated_at; });
    return out;
  } catch { return null; }
}

/** Fetch the full value for specific settings keys only.
 *  Returns { key: { value, updatedAt } } or null on error. */
export async function fetchSettingValues(keys) {
  if (!supabase || !keys.length) return {};
  try {
    const { data, error } = await supabase.from("settings").select("*").in("key", keys);
    if (error) return null;
    const out = {};
    data.forEach(r => { out[r.key] = { value: r.value, updatedAt: r.updated_at }; });
    return out;
  } catch { return null; }
}

/** Upsert one setting (menu/categories/addons/shopInfo) with a timestamp so the
 *  newest edit wins across devices. Returns true on success so the caller can
 *  retry a failed push — a lost upload used to leave every other device stuck on
 *  the old menu with no way to notice or recover. Never throws. */
export async function syncSetting(key, value, updatedAt) {
  if (!supabase) return false;
  try {
    const { error } = await supabase.from("settings").upsert({
      key,
      value,
      updated_at: updatedAt || new Date().toISOString(),
    });
    if (error) console.warn("[Supabase] syncSetting failed:", error.message);
    return !error;
  } catch (e) {
    console.warn("[Supabase] syncSetting failed:", e.message);
    return false;
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

// Web Push (closed-app notifications) client helpers.
// Registers the push-only service worker, subscribes the device, stores the
// subscription in Supabase (push_subscriptions), and calls the notify-sale Edge
// Function when a sale is made so every OTHER device gets a push — even if the app
// is fully closed (on iPhone the app must be Added to Home Screen).
import { supabase } from "./supabase.js";

const VAPID_PUBLIC = "BH17PbzY1qcYytYwNd2E4EYlAMmXuKgMyrvLH76P7vCTOmDU3zwbjtjFtSjMSbXRrQQ743zpLTt5M0npfKXLhKU";
const SHARED_SECRET = "ppb_push_9f3a2c7d";
const BASE = (import.meta.env.BASE_URL || "/");

function urlB64ToUint8Array(b64) {
  const pad = "=".repeat((4 - (b64.length % 4)) % 4);
  const s = (b64 + pad).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(s);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

export function pushSupported() {
  return typeof navigator !== "undefined" && "serviceWorker" in navigator &&
    typeof window !== "undefined" && "PushManager" in window && "Notification" in window;
}

async function subscribeAndSave(deviceId, label) {
  const reg = await navigator.serviceWorker.register(BASE + "sw.js", { scope: BASE });
  await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlB64ToUint8Array(VAPID_PUBLIC) });
  if (supabase) await supabase.from("push_subscriptions").upsert({
    device_id: deviceId, subscription: sub.toJSON(), label: label || null, updated_at: new Date().toISOString(),
  });
  return sub;
}

// Turn on push for THIS device (asks permission, registers, subscribes, saves).
export async function enablePush(deviceId, label) {
  try {
    if (!pushSupported()) return { ok: false, error: "not-supported" };
    const perm = await Notification.requestPermission();
    if (perm !== "granted") return { ok: false, error: "denied" };
    await subscribeAndSave(deviceId, label);
    return { ok: true };
  } catch (e) { return { ok: false, error: String((e && e.message) || e) }; }
}

export async function disablePush(deviceId) {
  try {
    const reg = await navigator.serviceWorker.getRegistration(BASE);
    const sub = reg && (await reg.pushManager.getSubscription());
    if (sub) await sub.unsubscribe();
    if (supabase) await supabase.from("push_subscriptions").delete().eq("device_id", deviceId);
    return { ok: true };
  } catch (e) { return { ok: false, error: String(e) }; }
}

// Re-register/refresh the subscription on app load (if push was already enabled).
export async function ensurePush(deviceId, label) {
  try {
    if (!pushSupported() || Notification.permission !== "granted") return;
    await subscribeAndSave(deviceId, label);
  } catch (e) {}
}

// Fire a push to all OTHER devices when a sale is completed (fire-and-forget).
export async function sendSalePush({ title, body, fromDeviceId }) {
  try {
    const url = import.meta.env.VITE_SUPABASE_URL;
    if (!url) return;
    await fetch(url + "/functions/v1/notify-sale", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ secret: SHARED_SECRET, title, body, fromDeviceId }),
      keepalive: true,
    });
  } catch (e) {}
}

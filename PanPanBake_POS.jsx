import { useState, useRef, useEffect } from "react";
import { useWindowSize } from "./src/hooks/useWindowSize.js";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell } from "recharts";
import { syncOrder, syncShift, checkConnection, wipeAllCloudData, fetchSales, fetchShifts, fetchSettings, syncSetting } from "./src/lib/supabase.js";

// ============================================================
// CONSTANTS
// ============================================================
// Bump this on every deploy so each device can confirm (Admin → ⚙️ ລະບົບ) which
// build it is actually running. If the printed receipt is still wrong but this
// version is current on the tablet, the problem is the print code, not caching.
const BUILD_VERSION = "2026.06.30-6";
const DEFAULT_SHOP_INFO = {
  name: "Pan Pan Bake", nameLao: "ຮ້ານ ແປນ ແປນ ເບກ",
  address: "ບ້ານທົ່ງສະໜາມ, ເມືອງຈັນທະບູລີ", addressEn: "Thongsanag Village, Chanthabouly District",
  city: "ນະຄອນຫຼວງວຽງຈັນ, ລາວ", phone: "020 XXXX XXXX",
  footer: "ຂອບໃຈທີ່ໃຊ້ບໍລິການ! • Thank you!",
  logo: "", // base64 data URL — printed at the top of the receipt (image/dialog mode)
  qrBank: "BCEL One", qrAccount: "PAN PAN BAKE", qrNumber: "010-12-XX-XXXXXXX-001",
};

const INITIAL_CATEGORIES = [
  { id: "bakery", label: "🥐 ເຂົ້າໜົມ", labelEn: "Bakery" },
  { id: "coffee", label: "☕ ກາເຟ", labelEn: "Coffee" },
  { id: "matcha", label: "🍵 ມັດຊາ", labelEn: "Matcha" },
  { id: "smoothie", label: "🥤 ສະມູດທີ", labelEn: "Smoothie" },
  { id: "drinks", label: "🧃 ເຄື່ອງດື່ມ", labelEn: "Drinks" },
];

// Categories that support add-ons (milk swap, extra shots, etc.)
const ADDON_CATEGORIES = ["coffee", "matcha", "smoothie", "drinks"];

// Categories that support sweetness level selection (all drinks, no charge)
const DRINK_CATEGORIES = ["coffee", "matcha", "smoothie", "drinks"];

// Sweetness levels — free, no additional charge
const SWEETNESS_LEVELS = [
  { id: "none",   lao: "ບໍ່ຫວານ",     en: "No Sugar",     emoji: "🚫" },
  { id: "less",   lao: "ຫວານໜ້ອຍ",   en: "Less Sweet",   emoji: "🍃" },
  { id: "normal", lao: "ຫວານປົກກະຕິ", en: "Normal",       emoji: "🥤" },
  { id: "extra",  lao: "ຫວານພິເສດ",  en: "Extra Sweet",  emoji: "🍯" },
];

const DEFAULT_ADDONS = [
  { id: "oat", name: "Oat Milk", nameLao: "ນົມໂອ໋ດ", price: 5000, group: "milk" },
  { id: "almond", name: "Almond Milk", nameLao: "ນົມອັນມັນ", price: 5000, group: "milk" },
  { id: "soy", name: "Soy Milk", nameLao: "ນົມຖົ່ວເຫຼືອງ", price: 5000, group: "milk" },
  { id: "lactose_free", name: "Lactose-Free Milk", nameLao: "ນົມບໍ່ມີນ້ຳຕານ", price: 5000, group: "milk" },
  { id: "extra_shot", name: "Extra Espresso Shot", nameLao: "ເພີ່ມ Shot", price: 5000, group: "extra" },
  { id: "vanilla", name: "Vanilla Syrup", nameLao: "ນ້ຳຕານວານີລາ", price: 3000, group: "syrup" },
  { id: "caramel", name: "Caramel Syrup", nameLao: "ນ້ຳຕານຄາຣາເມລ", price: 3000, group: "syrup" },
  { id: "hazelnut", name: "Hazelnut Syrup", nameLao: "ນ້ຳຕານ Hazelnut", price: 3000, group: "syrup" },
  { id: "whip", name: "Whipped Cream", nameLao: "ວິບຄຣີມ", price: 3000, group: "topping" },
];

const ADDON_GROUPS = {
  milk: "🥛 ປ່ຽນນົມ / Milk",
  extra: "☕ ເພີ່ມ / Extra",
  syrup: "🍯 ນ້ຳຕານ / Syrup",
  topping: "🍦 Topping",
};

const EXPENSE_CATS = {
  fixed: [
    { id: "rent", label: "🏠 ຄ່າເຊົ່າ" }, { id: "salary", label: "👥 ເງິນເດືອນ" },
    { id: "internet", label: "📡 ອິນເຕີເນັດ" }, { id: "insurance", label: "🛡️ ປະກັນໄພ" },
    { id: "loan", label: "🏦 ດອກເບ້ຍ/ເງິນກູ້" }, { id: "other_fixed", label: "📌 ຄົງທີ່ອື່ນໆ" },
  ],
  variable: [
    { id: "ingredients", label: "🌾 ວັດຖຸດິບ (COGS)" }, { id: "packaging", label: "📦 ບັນຈຸພັນ (COGS)" },
    { id: "electricity", label: "⚡ ຄ່າໄຟຟ້າ" }, { id: "water", label: "💧 ຄ່ານ້ຳ" },
    { id: "gas", label: "🔥 ຄ່າແກ໊ສ" }, { id: "marketing", label: "📢 ການຕະຫຼາດ" },
    { id: "delivery", label: "🛵 ຂົນສົ່ງ" }, { id: "supplies", label: "🧽 ຂອງໃຊ້" },
    { id: "maintenance", label: "🔧 ບຳລຸງຮັກສາ" }, { id: "other_var", label: "📌 ແປຜັນອື່ນໆ" },
  ],
};
const COGS_IDS = ["ingredients", "packaging"];

const INITIAL_MENU = [
  { id: 1, cat: "bakery", name: "Croissant", nameLao: "ຄວາຊ໊ອງ", price: 15000, emoji: "🥐", popular: true },
  { id: 2, cat: "bakery", name: "Pain au Chocolat", nameLao: "ເຂົ້າໜົມຊ໊ອກໂກແລດ", price: 18000, emoji: "🍫" },
  { id: 3, cat: "bakery", name: "Cinnamon Roll", nameLao: "ໂຣນສິນນາມອນ", price: 20000, emoji: "🌀", popular: true },
  { id: 4, cat: "bakery", name: "Banana Bread", nameLao: "ເຂົ້າໜົມໝາກກ້ວຍ", price: 18000, emoji: "🍌" },
  { id: 5, cat: "bakery", name: "Blueberry Muffin", nameLao: "ມັຟຟິນໝາກໄມ້", price: 15000, emoji: "🫐" },
  { id: 6, cat: "bakery", name: "Chocolate Cake", nameLao: "ເຄັກຊ໊ອກໂກແລດ", price: 25000, emoji: "🎂", popular: true },
  { id: 7, cat: "bakery", name: "Cheesecake", nameLao: "ຊີດເຄັກ", price: 28000, emoji: "🍰" },
  { id: 8, cat: "bakery", name: "Strawberry Tart", nameLao: "ທາດໝາກສະຕໍ", price: 22000, emoji: "🍓" },
  { id: 9, cat: "bakery", name: "Almond Croissant", nameLao: "ຄວາຊ໊ອງໝາກຖົ່ວ", price: 20000, emoji: "🌾" },
  { id: 10, cat: "bakery", name: "Sourdough Loaf", nameLao: "Sourdough", price: 45000, emoji: "🍞" },
  { id: 11, cat: "bakery", name: "Baguette", nameLao: "ເຂົ້າໜົມຝຣັ່ງ", price: 15000, emoji: "🥖" },
  { id: 12, cat: "bakery", name: "Danish Pastry", nameLao: "Danish", price: 18000, emoji: "🥮" },
  { id: 13, cat: "bakery", name: "Carrot Cake", nameLao: "ເຄັກໝາກແຄລອດ", price: 25000, emoji: "🥕" },
  { id: 14, cat: "bakery", name: "Brownie", nameLao: "ບຣາວນີ", price: 15000, emoji: "🟫", popular: true },
  { id: 15, cat: "bakery", name: "Cookie", nameLao: "ຄຸກກີ", price: 10000, emoji: "🍪" },
  { id: 16, cat: "bakery", name: "Macaron (2pcs)", nameLao: "ມາກາຣ໊ອງ", price: 20000, emoji: "🎨" },
  { id: 17, cat: "bakery", name: "Eclair", nameLao: "ເອັກແລ", price: 18000, emoji: "🍮" },
  { id: 18, cat: "bakery", name: "Red Velvet", nameLao: "ເຄັກແດງ", price: 28000, emoji: "❤️" },
  { id: 19, cat: "bakery", name: "Pineapple Danish", nameLao: "Danish ໝາກນັດ", price: 18000, emoji: "🍍" },
  { id: 20, cat: "bakery", name: "Lemon Tart", nameLao: "ທາດໝາກນາວ", price: 22000, emoji: "🍋" },
  { id: 21, cat: "bakery", name: "Apple Turnover", nameLao: "ໝາກແອັບ Turnover", price: 20000, emoji: "🍎" },
  { id: 22, cat: "bakery", name: "Morning Bun", nameLao: "ເຂົ້າໜົມເຊົ້າ", price: 15000, emoji: "☀️" },
  { id: 23, cat: "bakery", name: "Sesame Roll", nameLao: "ໂຣນໜ້າງາ", price: 12000, emoji: "⚪" },
  { id: 24, cat: "bakery", name: "Honey Toast", nameLao: "ໂທສນ້ຳເຜິ້ງ", price: 20000, emoji: "🍯" },
  { id: 25, cat: "bakery", name: "Cream Horn", nameLao: "ໂຄນຄີມ", price: 15000, emoji: "🍦" },
  { id: 30, cat: "coffee", name: "Espresso", nameLao: "ກາເຟເຂັ້ມ", price: 20000, emoji: "☕", popular: true },
  { id: 31, cat: "coffee", name: "Americano (Hot)", nameLao: "ອາເມຣິກາໂນ ຮ້ອນ", price: 22000, emoji: "☕" },
  { id: 32, cat: "coffee", name: "Americano (Iced)", nameLao: "ອາເມຣິກາໂນ ເຢັນ", price: 25000, emoji: "🧊", popular: true },
  { id: 33, cat: "coffee", name: "Latte (Hot)", nameLao: "ລາເຕ້ ຮ້ອນ", price: 28000, emoji: "☕" },
  { id: 34, cat: "coffee", name: "Latte (Iced)", nameLao: "ລາເຕ້ ເຢັນ", price: 30000, emoji: "🧊", popular: true },
  { id: 35, cat: "coffee", name: "Cappuccino", nameLao: "ຄາປູຊີໂນ", price: 28000, emoji: "☕" },
  { id: 36, cat: "coffee", name: "Flat White", nameLao: "Flat White", price: 28000, emoji: "☕" },
  { id: 37, cat: "coffee", name: "Mocha (Hot)", nameLao: "ໂມກ້າ ຮ້ອນ", price: 30000, emoji: "☕" },
  { id: 38, cat: "coffee", name: "Mocha (Iced)", nameLao: "ໂມກ້າ ເຢັນ", price: 32000, emoji: "🧊" },
  { id: 39, cat: "coffee", name: "Caramel Latte (Iced)", nameLao: "ລາເຕ້ຄາຣາເມລ", price: 35000, emoji: "🧊", popular: true },
  { id: 40, cat: "coffee", name: "Brown Sugar Oat Latte", nameLao: "ລາເຕ້ໂອ໋ດ", price: 35000, emoji: "🥛" },
  { id: 50, cat: "matcha", name: "Matcha Latte (Hot)", nameLao: "ມັດຊາ ຮ້ອນ", price: 32000, emoji: "🍵", popular: true },
  { id: 51, cat: "matcha", name: "Matcha Latte (Iced)", nameLao: "ມັດຊາ ເຢັນ", price: 35000, emoji: "🍵", popular: true },
  { id: 52, cat: "matcha", name: "Matcha Americano", nameLao: "ມັດຊາ ອາເມຣິກາໂນ", price: 30000, emoji: "🍵" },
  { id: 53, cat: "matcha", name: "Dirty Matcha", nameLao: "Dirty Matcha", price: 38000, emoji: "🍵" },
  { id: 54, cat: "matcha", name: "Matcha Smoothie", nameLao: "ມັດຊາ ສະມູດທີ", price: 40000, emoji: "🍵" },
  { id: 60, cat: "smoothie", name: "Mango Smoothie", nameLao: "ສະມູດທີໝາກມ່ວງ", price: 35000, emoji: "🥭", popular: true },
  { id: 61, cat: "smoothie", name: "Strawberry Smoothie", nameLao: "ສະມູດທີໝາກສະຕໍ", price: 35000, emoji: "🍓" },
  { id: 62, cat: "smoothie", name: "Banana Smoothie", nameLao: "ສະມູດທີໝາກກ້ວຍ", price: 32000, emoji: "🍌" },
  { id: 63, cat: "smoothie", name: "Mixed Fruit", nameLao: "ສະມູດທີຫຼາຍໝາກ", price: 38000, emoji: "🍇" },
  { id: 64, cat: "smoothie", name: "Watermelon Smoothie", nameLao: "ສະມູດທີໝາກໂມ", price: 35000, emoji: "🍉" },
  { id: 65, cat: "smoothie", name: "Pineapple Smoothie", nameLao: "ສະມູດທີໝາກນັດ", price: 35000, emoji: "🍍" },
  { id: 70, cat: "drinks", name: "Water 600ml", nameLao: "ນ້ຳດື່ມ", price: 5000, emoji: "💧" },
  { id: 71, cat: "drinks", name: "Orange Juice (Can)", nameLao: "ນ້ຳໝາກກ້ຽງ", price: 12000, emoji: "🍊" },
  { id: 72, cat: "drinks", name: "Apple Juice (Can)", nameLao: "ນ້ຳໝາກແອັບ", price: 12000, emoji: "🍎" },
  { id: 73, cat: "drinks", name: "Sparkling Water", nameLao: "ນ້ຳອັດລົມ", price: 10000, emoji: "✨" },
  { id: 74, cat: "drinks", name: "Lemon Soda", nameLao: "ໂຊດາໝາກນາວ", price: 20000, emoji: "🍋" },
];

const formatKip = (n) => new Intl.NumberFormat("lo-LA").format(Math.round(n)) + " ₭";
const genId = () => Math.random().toString(36).substr(2, 9);
const fmtDate = (d) => { const x = new Date(d); return `${String(x.getDate()).padStart(2,"0")}/${String(x.getMonth()+1).padStart(2,"0")}/${x.getFullYear()}`; };
const fmtTime = (d) => { const x = new Date(d); return `${String(x.getHours()).padStart(2,"0")}:${String(x.getMinutes()).padStart(2,"0")}`; };
const fmtDT = (d) => `${fmtDate(d)} ${fmtTime(d)}`;

// Calculate price including add-ons
const itemPrice = (item) => item.price + (item.addons || []).reduce((s, a) => s + a.price, 0);
// Unique key for cart line (item id + addon ids + sweetness)
const cartKey = (item) => `${item.id}:${(item.addons || []).map(a => a.id).sort().join(",")}:${item.sweetness || ""}`;
// Lao label for a sweetness level id (empty string if none/normal-unset)
const sweetLabel = (id) => { const s = SWEETNESS_LEVELS.find(x => x.id === id); return s ? `${s.emoji} ${s.lao}` : ""; };

const stor = {
  get: (k, def) => { try { const v = localStorage.getItem("ppb_" + k); return v ? JSON.parse(v) : def; } catch { return def; } },
  set: (k, v) => { try { localStorage.setItem("ppb_" + k, JSON.stringify(v)); } catch {} },
};

// ============================================================
// PRINT RECEIPT
// ============================================================
// Printer configuration (saved in Admin → Printer). Defaults to 58mm thermal
// via the Android print dialog, which the RawBT print service handles for
// Bluetooth Xprinters while still rendering Lao text correctly (rasterized).
const PRINTER_DEFAULT = { paperWidth: "80", mode: "dialog" };

// Build a monospace plain-text receipt for RawBT "direct" mode (instant, no
// dialog). Uses Latin labels because thermal printer fonts usually lack Lao
// glyphs; item names are still printed as entered.
function receiptText(order, shopInfo) {
  const cfg = stor.get("printerConfig", PRINTER_DEFAULT);
  const cols = cfg.paperWidth === "80" ? 42 : 32;
  const sep = "-".repeat(cols);
  const center = (s = "") => { s = String(s); if (s.length >= cols) return s.slice(0, cols); return " ".repeat(Math.floor((cols - s.length) / 2)) + s; };
  const lr = (l = "", r = "") => { l = String(l); r = String(r); const sp = cols - l.length - r.length; return sp > 0 ? l + " ".repeat(sp) + r : (l + " " + r); };
  const net = order.total - (order.discount || 0);
  const isFOC = order.payment === "foc";
  const payLabel = order.payment === "cash" ? "Cash" : order.payment === "qr" ? "QR" : order.payment === "transfer" ? "Transfer" : "FOC";
  const dbl = "=".repeat(cols);
  // Direct-mode amounts use a plain ASCII "LAK" — the thermal printer's built-in
  // font has no ₭ (U+20AD) glyph, so formatKip's symbol would print as garbage.
  const kip = (n) => new Intl.NumberFormat("lo-LA").format(Math.round(n)) + " LAK";
  let t = "";
  // NOTE: shop name is intentionally NOT printed in RawBT direct mode (per shop
  // request — the printer can't render the Lao name anyway). Header is bill only.
  t += "Bill #" + order.id.toUpperCase() + "\n";
  t += fmtDT(order.date) + "\n";
  if (order.cashier) t += "By: " + order.cashier + "\n";
  t += "Pay: " + payLabel + "\n";
  if (order.voidReason) t += center("*** VOID ***") + "\n";
  if (isFOC) t += center("*** FOC / FREE ***") + "\n";
  t += sep + "\n";
  // Header maps to the real layout: left = item/details, right = amount.
  t += lr("Item", "Amount") + "\n";
  t += sep + "\n";
  order.items.forEach(it => {
    const up = itemPrice(it);
    t += `${it.name}`.slice(0, cols) + "\n";
    if (it.sweetness) { const s = SWEETNESS_LEVELS.find(x => x.id === it.sweetness); if (s) t += "  " + s.en + "\n"; }
    (it.addons || []).forEach(a => { t += "  + " + a.name + " (" + kip(a.price) + ")\n"; });
    t += lr(`  ${kip(up)} x ${it.qty}`, kip(up * it.qty)) + "\n";
  });
  t += sep + "\n";
  t += lr("Subtotal", kip(order.total)) + "\n";
  if (order.discount > 0) t += lr("Discount", "-" + kip(order.discount)) + "\n";
  // TOTAL boxed in double lines so the customer can tell it apart from subtotal
  t += dbl + "\n";
  t += lr("TOTAL", isFOC ? "FOC" : kip(net)) + "\n";
  t += dbl + "\n";
  if (order.payment === "cash" && order.received) {
    t += lr("Cash", kip(order.received)) + "\n";
    t += lr("Change", kip(order.received - net)) + "\n";
  }
  // Remark prints as entered. NOTE: Lao text here will only render correctly in
  // image/dialog print mode — the printer's text font has no Lao glyphs.
  if (order.note) { t += sep + "\n" + "Remark:\n" + order.note + "\n"; }
  t += sep + "\n";
  // ASCII thank-you (the Lao footer can't render in direct text mode).
  t += center("Thank you!") + "\n";
  t += "\n\n\n";
  return t;
}

function printReceipt(order, shopInfo) {
  const cfg = stor.get("printerConfig", PRINTER_DEFAULT);

  // ── RawBT direct mode: send straight to the paired Bluetooth printer with no
  // print dialog (fastest). Requires the free RawBT app installed on Android. ──
  if (cfg.mode === "rawbt") {
    const a = document.createElement("a");
    a.href = "rawbt:" + encodeURIComponent(receiptText(order, shopInfo));
    document.body.appendChild(a);
    a.click();
    setTimeout(() => a.remove(), 800);
    return;
  }

  // ── Dialog / system print mode (default): renders the styled receipt and
  // opens the Android print dialog. With RawBT set as the printer this prints
  // to the Bluetooth Xprinter AND keeps Lao text (printed as a rasterized image). ──
  const is80 = cfg.paperWidth === "80";
  const W = is80 ? "80mm" : "58mm";
  // Larger fonts + pure black + full width = crisp, dark thermal output that
  // fills the paper. No emoji/gray (thermal printers render those as garbage/faded).
  const F = is80
    ? { base:23, shop:42, lao:19, meta:23, item:23, row:26, grand:40, foc:34, foot:18, pad:2, logo:190 }
    : { base:18, shop:31, lao:16, meta:18, item:18, row:21, grand:31, foc:27, foot:15, pad:2, logo:150 };

  const net = order.total - (order.discount || 0);
  const itemsHtml = order.items.map(it => {
    const addonText = (it.addons || []).map(a => `+ ${a.nameLao} (${formatKip(a.price)})`).join("<br>");
    const sweetText = it.sweetness ? sweetLabel(it.sweetness).replace(/^[^\s]+\s/, "") : ""; // drop leading emoji
    const unit = itemPrice(it);
    return `<tr>
      <td style="padding:4px 0">${it.name}<br><small>${it.nameLao}</small>${sweetText ? `<br><small>${sweetText}</small>` : ""}${addonText ? `<br><small>${addonText}</small>` : ""}</td>
      <td style="text-align:center;padding:4px 0;white-space:nowrap">${formatKip(unit)}<br><small>× ${it.qty}</small></td>
      <td style="text-align:right;padding:4px 0;font-weight:bold;white-space:nowrap">${formatKip(unit * it.qty)}</td>
    </tr>`;
  }).join("");
  // Column header so the unit price, quantity and amount are clearly labelled.
  const itemsHeader = `<tr class="ihead">
      <td style="padding:2px 0">ລາຍການ<br><small>Item</small></td>
      <td style="text-align:center;padding:2px 0">ລາຄາ/ໜ່ວຍ<br><small>Unit × Qty</small></td>
      <td style="text-align:right;padding:2px 0">ລວມ<br><small>Amount</small></td>
    </tr>`;

  const payLabel = order.payment === "cash" ? "ເງິນສົດ" : order.payment === "qr" ? "QR Code" : order.payment === "transfer" ? "ໂອນ" : "FOC";
  const isFOC = order.payment === "foc";
  const esc = (s) => String(s).replace(/[&<>]/g, c => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;" }[c]));
  // Remark / customer details — printed as a prominent boxed block (so the rider
  // can read the customer name, phone and address at a glance). Preserves line breaks.
  const remarkHtml = order.note
    ? `<div class="remark"><div class="remark-h">ໝາຍເຫດ / ລູກຄ້າ · Customer</div><div class="remark-b">${esc(order.note)}</div></div>`
    : "";
  // Optional shop logo, printed centered at the top (image/dialog mode only).
  const logoHtml = shopInfo.logo
    ? `<div class="logo"><img src="${shopInfo.logo}" alt=""></div>`
    : "";

  // All receipt styles are scoped under #ppb-print-root. The @media print block
  // hides the whole app (body > *) and shows ONLY the receipt, so the Android
  // print framework prints the receipt — not a screenshot of the app UI (which
  // is what happens when you print from a hidden iframe on Android tablets).
  // print-color-adjust:exact forces the black TOTAL bar to actually print.
  const css = `
  @page{margin:0;size:${W} auto;}
  #ppb-print-root{display:block;width:100%;font-family:'Courier New',monospace;font-weight:bold;font-size:${F.base}px;padding:${F.pad}px;color:#000;background:#fff;-webkit-print-color-adjust:exact;print-color-adjust:exact;}
  #ppb-print-root *{margin:0;padding:0;box-sizing:border-box;color:#000;-webkit-print-color-adjust:exact;print-color-adjust:exact;}
  #ppb-print-root small{font-size:${F.lao}px;font-weight:normal;}
  #ppb-print-root .logo{text-align:center;padding:4px 0 2px;}
  #ppb-print-root .logo img{max-width:${F.logo}px;max-height:${F.logo}px;width:auto;height:auto;filter:grayscale(1) contrast(2);}
  #ppb-print-root .header{text-align:center;padding:6px 0 8px;border-bottom:2px solid #000;}
  #ppb-print-root .shop-name{font-size:${F.shop}px;font-weight:900;letter-spacing:1px;}
  #ppb-print-root .lao{font-size:${F.lao}px;font-weight:normal;}
  #ppb-print-root .meta{padding:8px 0;border-bottom:1px dashed #000;font-size:${F.meta}px;width:100%;}
  #ppb-print-root .meta td:first-child{width:38%;font-weight:normal;}
  #ppb-print-root .meta td:last-child{font-weight:bold;text-align:right;}
  #ppb-print-root .items{width:100%;border-collapse:collapse;padding:8px 0;}
  #ppb-print-root .items td{font-size:${F.item}px;vertical-align:top;}
  #ppb-print-root .items tr.ihead td{font-weight:bold;border-bottom:1px solid #000;padding-bottom:3px;}
  #ppb-print-root .divider{border-top:1px dashed #000;margin:6px 0;}
  #ppb-print-root .remark{padding:8px 10px;margin:6px 0;border:2px solid #000;}
  #ppb-print-root .remark-h{font-weight:bold;font-size:${F.meta}px;margin-bottom:4px;}
  #ppb-print-root .remark-b{font-weight:bold;font-size:${F.row}px;white-space:pre-wrap;word-break:break-word;line-height:1.45;}
  #ppb-print-root .row{display:flex;justify-content:space-between;margin:3px 0;font-size:${F.row}px;}
  #ppb-print-root .subtotal{border-top:1px dashed #000;padding-top:6px;margin-top:6px;}
  #ppb-print-root .grand{font-size:${F.grand}px;font-weight:900;border-top:3px solid #000;border-bottom:3px solid #000;padding:7px 0;margin-top:8px;}
  #ppb-print-root .grand span{color:#000 !important;}
  #ppb-print-root .footer{text-align:center;font-size:${F.foot}px;font-weight:normal;padding:8px 0;border-top:1px dashed #000;margin-top:6px;}
  #ppb-print-root .foc{text-align:center;font-size:${F.foc}px;font-weight:900;border:2px solid #000;padding:6px;margin:6px 0;}`;

  const bodyHtml = `${logoHtml}
<div class="header">
  <div class="shop-name">${esc(shopInfo.name.toUpperCase())}</div>
  <div class="lao">${esc(shopInfo.nameLao)}</div>
  <div class="lao">${esc(shopInfo.addressEn)}</div>
  <div class="lao">${esc(shopInfo.address)}</div>
  <div class="lao">${esc(shopInfo.phone)}</div>
</div>
${isFOC ? '<div class="foc">★ FOC / ຟຣີ ★</div>' : ""}
<table class="meta">
  <tr><td>ໃບບິນ #</td><td>${order.id.toUpperCase()}</td></tr>
  <tr><td>ວັນທີ</td><td>${fmtDT(order.date)}</td></tr>
  <tr><td>ພະນັກງານ</td><td>${esc(order.cashier || "—")}</td></tr>
  <tr><td>ຈ່າຍ</td><td>${payLabel}</td></tr>
  ${order.voidReason ? `<tr><td>★ ຍົກເລີກ</td><td>${esc(order.voidReason)}</td></tr>` : ""}
</table>
${remarkHtml}
<table class="items">${itemsHeader}${itemsHtml}</table>
<div class="row subtotal"><span>ລວມຍ່ອຍ / Subtotal (${order.items.reduce((s,i)=>s+i.qty,0)})</span><span>${formatKip(order.total)}</span></div>
${order.discount > 0 ? `<div class="row"><span>ສ່ວນຫຼຸດ / Discount</span><span>-${formatKip(order.discount)}</span></div>` : ""}
<div class="row grand"><span>ທັງໝົດ / TOTAL</span><span>${isFOC ? "FOC ★" : formatKip(net)}</span></div>
${order.payment === "cash" && order.received ? `
<div class="row"><span>ຮັບເງິນ / Cash</span><span>${formatKip(order.received)}</span></div>
<div class="row"><span>ເງິນທອນ / Change</span><span>${formatKip(order.received - net)}</span></div>` : ""}
<div class="footer">${esc(shopInfo.footer)}<br><small>v${BUILD_VERSION}</small></div>`;

  // IMPORTANT: This tablet's Android/RawBT print path renders the page using
  // SCREEN styles (it ignores @media print). So instead of a print-only stylesheet
  // we PHYSICALLY swap the on-screen DOM: hide the React app (#root) and show only
  // the receipt, call print(), then restore. Whatever media the printer uses, the
  // only thing on the page is the receipt.
  document.getElementById("ppb-print-style")?.remove();
  document.getElementById("ppb-print-root")?.remove();

  const styleEl = document.createElement("style");
  styleEl.id = "ppb-print-style";
  styleEl.textContent = css;
  document.head.appendChild(styleEl);

  const rootEl = document.createElement("div");
  rootEl.id = "ppb-print-root";
  rootEl.innerHTML = bodyHtml;
  document.body.appendChild(rootEl);

  const appRoot = document.getElementById("root");
  const prevAppDisplay = appRoot ? appRoot.style.display : "";
  const prevScrollY = window.scrollY;

  let restored = false;
  const restore = () => {
    if (restored) return;
    restored = true;
    if (appRoot) appRoot.style.display = prevAppDisplay; // bring the app back
    document.getElementById("ppb-print-style")?.remove();
    document.getElementById("ppb-print-root")?.remove();
    window.removeEventListener("afterprint", onAfter);
    window.removeEventListener("focus", onAfter);
    document.removeEventListener("visibilitychange", onVis);
    window.scrollTo(0, prevScrollY);
  };
  // Restore only AFTER the print capture is done. afterprint fires when the
  // dialog closes; focus/visibility fire when the user returns from the print
  // sheet. A long fallback guarantees the app never stays hidden.
  const onAfter = () => setTimeout(restore, 300);
  const onVis = () => { if (document.visibilityState === "visible") setTimeout(restore, 300); };
  window.addEventListener("afterprint", onAfter);
  window.addEventListener("focus", onAfter);
  document.addEventListener("visibilitychange", onVis);

  let fired = false;
  const fire = () => {
    if (fired) return;
    fired = true;
    if (appRoot) appRoot.style.display = "none"; // actually hide the app on screen
    window.scrollTo(0, 0);
    try { window.print(); }
    catch (e) { alert("ພິມບໍ່ໄດ້ / Print failed: " + e.message); restore(); return; }
    setTimeout(restore, 60000); // safety net so the app is never stuck hidden
  };

  // If there's a logo (data URL), wait for it to decode so it isn't blank; else
  // a short tick for layout. Then swap in the receipt and print.
  const logoImg = rootEl.querySelector(".logo img");
  if (logoImg && !logoImg.complete) {
    logoImg.onload = logoImg.onerror = () => setTimeout(fire, 80);
    setTimeout(fire, 1500); // fallback if the image events never fire
  } else {
    setTimeout(fire, 150);
  }
}

// ============================================================
// ADDON SELECTOR MODAL
// ============================================================
function AddonModal({ item, addons, onConfirm, onCancel }) {
  const [selected, setSelected] = useState([]);
  const [sweetness, setSweetness] = useState("normal");

  // Show paid add-ons only for coffee/matcha; sweetness shows for all drinks
  const showAddons = ADDON_CATEGORIES.includes(item.cat) && addons.length > 0;

  const groups = {};
  if (showAddons) addons.forEach(a => { if (!groups[a.group]) groups[a.group] = []; groups[a.group].push(a); });

  const toggle = (addon) => {
    const exists = selected.find(s => s.id === addon.id);
    if (exists) {
      setSelected(selected.filter(s => s.id !== addon.id));
    } else {
      // Milk group is single-select
      if (addon.group === "milk") {
        setSelected([...selected.filter(s => s.group !== "milk"), addon]);
      } else {
        setSelected([...selected, addon]);
      }
    }
  };

  const addonTotal = selected.reduce((s, a) => s + a.price, 0);
  const finalPrice = item.price + addonTotal;

  return (
    <div style={{ position:"fixed",inset:0,background:"rgba(0,0,0,0.7)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:1000 }}>
      <div style={{ background:"#fff",borderRadius:16,maxWidth:420,width:"90%",maxHeight:"90vh",display:"flex",flexDirection:"column" }}>
        <div style={{ padding:"18px 20px",borderBottom:"1px solid #f3f4f6" }}>
          <div style={{ display:"flex",alignItems:"center",gap:10 }}>
            <span style={{ fontSize:32 }}>{item.emoji}</span>
            <div style={{ flex:1 }}>
              <div style={{ fontSize:16,fontWeight:700 }}>{item.name}</div>
              <div style={{ fontSize:12,color:"#6b7280" }}>{item.nameLao} · {formatKip(item.price)}</div>
            </div>
          </div>
        </div>

        <div style={{ flex:1,overflowY:"auto",padding:"14px 20px" }}>
          {/* Sweetness Level — free, all drinks */}
          <div style={{ marginBottom:16 }}>
            <div style={{ fontSize:13,fontWeight:700,color:"#1a1a2e",marginBottom:8 }}>
              🍬 ລະດັບຄວາມຫວານ / Sweetness
              <span style={{ fontSize:10,color:"#16a34a",fontWeight:400,marginLeft:6 }}>(ບໍ່ຄິດເງິນເພີ່ມ / free)</span>
            </div>
            <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:8 }}>
              {SWEETNESS_LEVELS.map(sw => {
                const isOn = sweetness === sw.id;
                return (
                  <button key={sw.id} onClick={() => setSweetness(sw.id)} style={{
                    padding:"10px 12px",borderRadius:10,cursor:"pointer",textAlign:"left",
                    border: isOn ? "2px solid #7c3aed" : "1px solid #e5e7eb",
                    background: isOn ? "#7c3aed" : "#fff",
                    color: isOn ? "#fff" : "#374151",
                  }}>
                    <div style={{ fontSize:13,fontWeight:600 }}>{isOn && "✓ "}{sw.emoji} {sw.lao}</div>
                    <div style={{ fontSize:11,color: isOn ? "#e9d5ff" : "#6b7280" }}>{sw.en}</div>
                  </button>
                );
              })}
            </div>
          </div>

          {Object.entries(groups).map(([groupId, groupAddons]) => (
            <div key={groupId} style={{ marginBottom:16 }}>
              <div style={{ fontSize:13,fontWeight:700,color:"#1a1a2e",marginBottom:8 }}>
                {ADDON_GROUPS[groupId] || groupId}
                {groupId === "milk" && <span style={{ fontSize:10,color:"#6b7280",fontWeight:400,marginLeft:6 }}>(ເລືອກ 1)</span>}
              </div>
              <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:8 }}>
                {groupAddons.map(a => {
                  const isOn = selected.find(s => s.id === a.id);
                  return (
                    <button key={a.id} onClick={() => toggle(a)} style={{
                      padding:"10px 12px",borderRadius:10,cursor:"pointer",textAlign:"left",
                      border: isOn ? "2px solid #1a1a2e" : "1px solid #e5e7eb",
                      background: isOn ? "#1a1a2e" : "#fff",
                      color: isOn ? "#f4d03f" : "#374151",
                    }}>
                      <div style={{ fontSize:13,fontWeight:600 }}>{isOn && "✓ "}{a.name}</div>
                      <div style={{ fontSize:11,color: isOn ? "#fde68a" : "#6b7280" }}>{a.nameLao}</div>
                      <div style={{ fontSize:12,fontWeight:700,marginTop:3,color: isOn ? "#fde68a" : "#7c3aed" }}>+{formatKip(a.price)}</div>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        <div style={{ padding:"14px 20px",borderTop:"1px solid #f3f4f6",background:"#f9f6f0" }}>
          <div style={{ display:"flex",justifyContent:"space-between",marginBottom:10,fontWeight:700,fontSize:16 }}>
            <span>ລາຄາລວມ</span>
            <span style={{ color:"#7c3aed" }}>{formatKip(finalPrice)}</span>
          </div>
          <div style={{ display:"flex",gap:8 }}>
            <button onClick={onCancel} style={{ flex:1,padding:12,background:"#f3f4f6",border:"none",borderRadius:10,fontWeight:600,cursor:"pointer" }}>ຍົກເລີກ</button>
            <button onClick={() => onConfirm(selected, sweetness)} style={{ flex:2,padding:12,background:"#16a34a",color:"#fff",border:"none",borderRadius:10,fontWeight:700,cursor:"pointer" }}>+ ເພີ່ມໃສ່ກະຕ່າ</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// RECEIPT MODAL
// ============================================================
function ReceiptModal({ order, shopInfo, onClose, onSaveRemark }) {
  const net = order.total - (order.discount || 0);
  const isFOC = order.payment === "foc";
  const payLabel = order.payment === "cash" ? "💵 ເງິນສົດ" : order.payment === "qr" ? "📲 QR" : order.payment === "transfer" ? "🏦 ໂອນ" : "🎁 FOC";
  const [remark, setRemark] = useState(order.note || "");
  const doPrint = () => {
    const o = { ...order, note: remark.trim() };
    if (onSaveRemark && remark.trim() !== (order.note || "")) onSaveRemark(o); // persist + sync the edit
    printReceipt(o, shopInfo);
  };

  return (
    <div style={{ position:"fixed",inset:0,background:"rgba(0,0,0,0.65)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:999 }}>
      <div style={{ background:"#fff",borderRadius:12,maxWidth:360,width:"90%",fontFamily:"monospace",maxHeight:"92vh",overflowY:"auto" }}>
        <div style={{ background:"#1a1a2e",color:"#f4d03f",padding:"18px 24px 14px",borderRadius:"12px 12px 0 0",textAlign:"center" }}>
          {shopInfo.logo && <img src={shopInfo.logo} alt="logo" style={{ maxWidth:90,maxHeight:64,objectFit:"contain",marginBottom:8 }} />}
          <div style={{ fontSize:20,fontWeight:700,letterSpacing:2 }}>{shopInfo.name.toUpperCase()}</div>
          <div style={{ fontSize:11,color:"#fde68a",marginTop:2 }}>{shopInfo.nameLao}</div>
        </div>
        <div style={{ padding:"12px 18px",background:"#f9f6f0",borderBottom:"1px dashed #ccc",fontSize:11,color:"#555",textAlign:"center" }}>
          <div>{shopInfo.addressEn}</div><div>{shopInfo.address}</div>
          <div style={{ color:"#888",marginTop:3 }}>{shopInfo.phone}</div>
        </div>
        {isFOC && <div style={{ background:"#dcfce7",color:"#16a34a",textAlign:"center",fontWeight:900,fontSize:18,padding:8 }}>★ FOC / ຟຣີ ★</div>}
        {order.voidReason && <div style={{ background:"#fee2e2",color:"#dc2626",textAlign:"center",fontWeight:700,fontSize:13,padding:8 }}>★ ຍົກເລີກ: {order.voidReason}</div>}
        <div style={{ padding:"10px 18px",borderBottom:"1px dashed #ddd",fontSize:12,background:"#fff" }}>
          {[["ໃບບິນ #",order.id.toUpperCase()],["ວັນທີ",fmtDT(order.date)],["ພະນັກງານ",order.cashier||"—"],["ຈ່າຍ",payLabel]].map(([l,v])=>(
            <div key={l} style={{ display:"flex",justifyContent:"space-between",marginBottom:3 }}><span style={{ color:"#888" }}>{l}</span><span style={{ fontWeight:600 }}>{v}</span></div>
          ))}
        </div>
        <div style={{ padding:"10px 18px",background:"#fff",maxHeight:240,overflowY:"auto" }}>
          {order.items.map((it,i)=>{
            const lp = itemPrice(it);
            return (
              <div key={i} style={{ marginBottom:8 }}>
                <div style={{ display:"flex",justifyContent:"space-between",fontSize:13 }}>
                  <div style={{ fontWeight:500 }}>{it.emoji} {it.name}</div>
                  <div style={{ fontWeight:600 }}>{formatKip(lp*it.qty)}</div>
                </div>
                <div style={{ fontSize:11,color:"#888",display:"flex",justifyContent:"space-between" }}>
                  <span>{it.nameLao}</span><span>{it.qty} × {formatKip(lp)}</span>
                </div>
                {it.sweetness && <div style={{ fontSize:11,color:"#16a34a",paddingLeft:14 }}>{sweetLabel(it.sweetness)}</div>}
                {(it.addons || []).map(a => (
                  <div key={a.id} style={{ fontSize:11,color:"#7c3aed",paddingLeft:14 }}>+ {a.nameLao} ({formatKip(a.price)})</div>
                ))}
              </div>
            );
          })}
        </div>
        <div style={{ padding:"10px 18px",borderTop:"1px dashed #ddd",background:"#f9f6f0" }}>
          <div style={{ display:"flex",justifyContent:"space-between",fontSize:13,color:"#666" }}>
            <span>ລວມ ({order.items.reduce((s,i)=>s+i.qty,0)})</span><span>{formatKip(order.total)}</span>
          </div>
          {order.discount > 0 && <div style={{ display:"flex",justifyContent:"space-between",fontSize:13,color:"#dc2626",marginTop:3 }}><span>ສ່ວນຫຼຸດ</span><span>-{formatKip(order.discount)}</span></div>}
          <div style={{ display:"flex",justifyContent:"space-between",fontSize:18,fontWeight:700,marginTop:8,borderTop:"2px solid #1a1a2e",paddingTop:8 }}>
            <span>ທັງໝົດ</span>
            <span style={{ color:isFOC?"#16a34a":"#1a1a2e" }}>{isFOC?"FOC ★":formatKip(net)}</span>
          </div>
          {order.payment==="cash" && order.received && (
            <>
              <div style={{ display:"flex",justifyContent:"space-between",fontSize:13,marginTop:4,color:"#16a34a" }}><span>ຮັບ</span><span>{formatKip(order.received)}</span></div>
              <div style={{ display:"flex",justifyContent:"space-between",fontSize:13,color:"#7c3aed" }}><span>ທອນ</span><span>{formatKip(order.received-net)}</span></div>
            </>
          )}
        </div>
        <div style={{ padding:"8px 18px 14px",textAlign:"center",fontSize:11,color:"#888",background:"#f9f6f0",borderTop:"1px dashed #ddd" }}>{shopInfo.footer}</div>
        <div style={{ padding:"10px 16px 4px",background:"#f9f6f0",fontFamily:"'Noto Sans Lao',sans-serif" }}>
          <div style={{ fontSize:12,fontWeight:700,color:"#374151",marginBottom:5 }}>📝 ໝາຍເຫດ / Remark <span style={{ fontWeight:400,color:"#9ca3af" }}>(ຊື່ລູກຄ້າ, ເບີໂທ, ທີ່ຢູ່)</span></div>
          <textarea value={remark} onChange={e=>setRemark(e.target.value)} rows={3} placeholder={"ຊື່ລູກຄ້າ / Name\nເບີໂທ / Phone\nທີ່ຢູ່ / Address"} style={{ width:"100%",padding:"8px 10px",borderRadius:8,border:"1px solid #d1d5db",fontSize:13,boxSizing:"border-box",resize:"vertical",fontFamily:"'Noto Sans Lao',sans-serif" }} />
        </div>
        <div style={{ display:"flex",gap:8,padding:"6px 16px 16px",background:"#f9f6f0",borderRadius:"0 0 12px 12px" }}>
          <button onClick={doPrint} style={{ flex:1,padding:10,background:"#1a1a2e",color:"#f4d03f",border:"none",borderRadius:8,fontWeight:600,cursor:"pointer",fontSize:14 }}>🖨️ ພິມ</button>
          <button onClick={onClose} style={{ flex:1,padding:10,background:"#e5e7eb",color:"#374151",border:"none",borderRadius:8,fontWeight:600,cursor:"pointer",fontSize:14 }}>✕ ປິດ</button>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// QR MODAL
// ============================================================
function QRModal({ amount, qrImage, shopInfo, onConfirm, onCancel }) {
  return (
    <div style={{ position:"fixed",inset:0,background:"rgba(0,0,0,0.7)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:1000 }}>
      <div style={{ background:"#fff",borderRadius:16,padding:24,maxWidth:360,width:"90%",textAlign:"center" }}>
        <div style={{ fontSize:18,fontWeight:700,marginBottom:4 }}>📲 ສະແກນເພື່ອຈ່າຍ</div>
        <div style={{ fontSize:12,color:"#6b7280",marginBottom:14 }}>Scan via {shopInfo.qrBank}</div>
        <div style={{ background:"#f9f6f0",padding:12,borderRadius:12,marginBottom:14 }}>
          {qrImage ? <img src={qrImage} alt="QR" style={{ width:"100%",maxWidth:240,height:"auto",margin:"0 auto",display:"block",borderRadius:8 }} />
            : <div style={{ width:200,height:200,margin:"0 auto",background:"#e5e7eb",borderRadius:8,display:"flex",alignItems:"center",justifyContent:"center",fontSize:13,color:"#9ca3af" }}>Upload QR in Settings</div>}
        </div>
        <div style={{ fontSize:13,fontWeight:600 }}>{shopInfo.qrAccount}</div>
        <div style={{ fontSize:12,color:"#6b7280",fontFamily:"monospace" }}>{shopInfo.qrNumber}</div>
        <div style={{ fontSize:24,fontWeight:700,color:"#7c3aed",margin:"10px 0" }}>{formatKip(amount)}</div>
        <div style={{ display:"flex",gap:8 }}>
          <button onClick={onCancel} style={{ flex:1,padding:12,background:"#f3f4f6",border:"none",borderRadius:10,fontWeight:600,cursor:"pointer" }}>ຍົກເລີກ</button>
          <button onClick={onConfirm} style={{ flex:2,padding:12,background:"#16a34a",color:"#fff",border:"none",borderRadius:10,fontWeight:700,cursor:"pointer" }}>✅ ຢືນຢັນຈ່າຍ</button>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// VOID MODAL
// ============================================================
function VoidModal({ order, shopInfo, onVoid, onClose }) {
  const [reason, setReason] = useState("");
  return (
    <div style={{ position:"fixed",inset:0,background:"rgba(0,0,0,0.7)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:1000 }}>
      <div style={{ background:"#fff",borderRadius:16,padding:24,maxWidth:400,width:"90%" }}>
        <div style={{ fontSize:16,fontWeight:700,marginBottom:4 }}>⚠️ ແກ້ໄຂໃບບິນ #{order.id.toUpperCase()}</div>
        <div style={{ fontSize:12,color:"#6b7280",marginBottom:16 }}>{fmtDT(order.date)} · {formatKip(order.total-(order.discount||0))}</div>
        <div style={{ background:"#fff7ed",border:"1px solid #fed7aa",borderRadius:8,padding:12,marginBottom:16,fontSize:13 }}>
          <div style={{ fontWeight:600,marginBottom:6,color:"#c2410c" }}>ທ່ານຕ້ອງການ:</div>
          <div>1. <b>Void</b> — ຍົກເລີກໃບບິນ<br/>2. <b>ພິມຄືນ</b> — ໃບເດີມ<br/>3. <b>Void Receipt</b> — ໃບຢືນຢັນຍົກເລີກ</div>
        </div>
        <input value={reason} onChange={(e)=>setReason(e.target.value)} placeholder="ເຫດຜົນ: ຈ່າຍຜິດ, ສັ່ງຜິດ..."
          style={{ width:"100%",padding:"10px 12px",borderRadius:8,border:"1px solid #e5e7eb",fontSize:13,boxSizing:"border-box",marginBottom:14 }} />
        <div style={{ display:"flex",flexDirection:"column",gap:8 }}>
          <button onClick={()=>{if(!reason)return alert("ກະລຸນາໃສ່ເຫດຜົນ");onVoid(reason);}} style={{ padding:12,background:"#dc2626",color:"#fff",border:"none",borderRadius:10,fontWeight:700,cursor:"pointer" }}>🚫 ຍົກເລີກໃບບິນ</button>
          <div style={{ display:"flex",gap:8 }}>
            <button onClick={()=>printReceipt(order,shopInfo)} style={{ flex:1,padding:10,background:"#1a1a2e",color:"#f4d03f",border:"none",borderRadius:10,fontWeight:600,cursor:"pointer",fontSize:13 }}>🖨️ ພິມຄືນ</button>
            <button onClick={()=>printReceipt({...order,voidReason:reason||"Voided"},shopInfo)} style={{ flex:1,padding:10,background:"#ea580c",color:"#fff",border:"none",borderRadius:10,fontWeight:600,cursor:"pointer",fontSize:13 }}>📄 Void Receipt</button>
          </div>
          <button onClick={onClose} style={{ padding:10,background:"#f3f4f6",border:"none",borderRadius:10,cursor:"pointer",fontSize:13 }}>ປິດ</button>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// SHIFT MODAL
// ============================================================
function ShiftModal({ type, currentShift, sales, onSubmit, onCancel }) {
  const [cash, setCash] = useState("");
  const [notes, setNotes] = useState("");
  const shiftSales = currentShift ? sales.filter(s => !s.voided && s.shiftId === currentShift.id) : [];
  const cashIn = shiftSales.filter(s=>s.payment==="cash").reduce((a,s)=>a+(s.total-(s.discount||0)),0);
  const expected = (currentShift?.openingCash||0) + cashIn;
  const qrR = shiftSales.filter(s=>s.payment==="qr").reduce((a,s)=>a+(s.total-(s.discount||0)),0);
  const tfR = shiftSales.filter(s=>s.payment==="transfer").reduce((a,s)=>a+(s.total-(s.discount||0)),0);

  return (
    <div style={{ position:"fixed",inset:0,background:"rgba(0,0,0,0.7)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:1000 }}>
      <div style={{ background:"#fff",borderRadius:16,padding:24,maxWidth:420,width:"90%" }}>
        <div style={{ fontSize:20,fontWeight:700,marginBottom:14 }}>{type==="open"?"🌅 ເປີດກະ":"🌙 ປິດກະ"}</div>
        {type==="close" && currentShift && (
          <div style={{ background:"#f9f6f0",padding:12,borderRadius:10,marginBottom:12,fontSize:13 }}>
            <div style={{ display:"flex",justifyContent:"space-between",marginBottom:3 }}><span>ເງິນເລີ່ມ</span><span>{formatKip(currentShift.openingCash)}</span></div>
            <div style={{ display:"flex",justifyContent:"space-between",marginBottom:3,color:"#16a34a" }}><span>+ ສົດ</span><span>{formatKip(cashIn)}</span></div>
            <div style={{ display:"flex",justifyContent:"space-between",marginBottom:3,color:"#7c3aed" }}><span>QR</span><span>{formatKip(qrR)}</span></div>
            <div style={{ display:"flex",justifyContent:"space-between",marginBottom:3,color:"#2563eb" }}><span>ໂອນ</span><span>{formatKip(tfR)}</span></div>
            <div style={{ display:"flex",justifyContent:"space-between",fontWeight:700,borderTop:"1px solid #e5e7eb",paddingTop:6 }}><span>ຄາດວ່າ</span><span>{formatKip(expected)}</span></div>
          </div>
        )}
        <div style={{ marginBottom:12 }}>
          <div style={{ fontSize:13,color:"#6b7280",marginBottom:4 }}>{type==="open"?"ເງິນສົດເລີ່ມ (₭)":"ເງິນສົດທີ່ນັບໄດ້ (₭)"}</div>
          <input type="number" value={cash} onChange={e=>setCash(e.target.value)} autoFocus placeholder="0"
            style={{ width:"100%",padding:"12px 14px",borderRadius:10,border:"1px solid #e5e7eb",fontSize:18,fontWeight:600,boxSizing:"border-box" }} />
          {type==="close" && cash && (
            <div style={{ fontSize:13,marginTop:6,color:Number(cash)>=expected?"#16a34a":"#dc2626",fontWeight:600 }}>
              ສ່ວນຕ່າງ: {formatKip(Number(cash)-expected)}
            </div>
          )}
        </div>
        <textarea value={notes} onChange={e=>setNotes(e.target.value)} rows={2} placeholder="ໝາຍເຫດ..."
          style={{ width:"100%",padding:10,borderRadius:10,border:"1px solid #e5e7eb",fontSize:13,boxSizing:"border-box",resize:"none",marginBottom:14 }} />
        <div style={{ display:"flex",gap:8 }}>
          <button onClick={onCancel} style={{ flex:1,padding:12,background:"#f3f4f6",border:"none",borderRadius:10,fontWeight:600,cursor:"pointer" }}>ຍົກເລີກ</button>
          <button onClick={()=>onSubmit({cash:Number(cash)||0,notes,expected,cashIn})} disabled={!cash}
            style={{ flex:2,padding:12,background:type==="open"?"#16a34a":"#1a1a2e",color:type==="open"?"#fff":"#f4d03f",border:"none",borderRadius:10,fontWeight:700,cursor:cash?"pointer":"not-allowed",opacity:cash?1:0.5 }}>
            {type==="open"?"✅ ເປີດ":"🔒 ປິດ"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// PARK ORDER NAME MODAL
// ============================================================
function ParkModal({ onConfirm, onCancel }) {
  const [name, setName] = useState("");
  return (
    <div style={{ position:"fixed",inset:0,background:"rgba(0,0,0,0.7)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:1000 }}>
      <div style={{ background:"#fff",borderRadius:16,padding:24,maxWidth:360,width:"90%" }}>
        <div style={{ fontSize:18,fontWeight:700,marginBottom:4 }}>📋 ພັກໃບສັ່ງ / Park Order</div>
        <div style={{ fontSize:12,color:"#6b7280",marginBottom:14 }}>ບັນທຶກໄວ້ ແລະ ສືບຕໍ່ສັ່ງລາຍຄົນຕໍ່ໄປ</div>
        <div style={{ fontSize:12,color:"#6b7280",marginBottom:4 }}>ຊື່/ໂຕະ/ໝາຍເຫດ</div>
        <input value={name} onChange={e=>setName(e.target.value)} autoFocus placeholder="ເຊັ່ນ: ໂຕະ 3, ນ້ອງ A, John..."
          style={{ width:"100%",padding:"12px 14px",borderRadius:10,border:"1px solid #e5e7eb",fontSize:15,boxSizing:"border-box",marginBottom:14 }} />
        <div style={{ display:"flex",gap:8 }}>
          <button onClick={onCancel} style={{ flex:1,padding:12,background:"#f3f4f6",border:"none",borderRadius:10,fontWeight:600,cursor:"pointer" }}>ຍົກເລີກ</button>
          <button onClick={()=>onConfirm(name || `ໂຕະ ${Date.now()%100}`)} style={{ flex:2,padding:12,background:"#ea580c",color:"#fff",border:"none",borderRadius:10,fontWeight:700,cursor:"pointer" }}>📋 ພັກໄວ້</button>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// POS VIEW with parked orders & add-ons
// ============================================================
function POSView({ menu, categories, addons, onSale, onUpdateSale, currentShift, cashier, qrImage, shopInfo, parkedOrders, setParkedOrders, mode }) {
  const isMobile = mode === "phone";
  // In-progress order ("order log") is persisted to localStorage so it survives
  // switching to another tab/module and accidental page refreshes.
  const draft = stor.get("orderDraft", {});
  const [cat, setCat] = useState(categories[0]?.id || "bakery");
  const [cart, setCart] = useState(draft.cart || []);
  const [search, setSearch] = useState("");
  const [payment, setPayment] = useState("cash");
  const [received, setReceived] = useState("");
  const [discount, setDiscount] = useState(draft.discount || 0);
  const [note, setNote] = useState(draft.note || "");
  const [receipt, setReceipt] = useState(null);
  const [showCheckout, setShowCheckout] = useState(false);
  const [showQR, setShowQR] = useState(false);
  const [focReason, setFocReason] = useState("");
  const [addonItem, setAddonItem] = useState(null);
  const [parkedId, setParkedId] = useState(draft.parkedId || null); // resumed parked order id
  const [parkedName, setParkedName] = useState(draft.parkedName || "");
  const [showParkModal, setShowParkModal] = useState(false);
  const [showParkedList, setShowParkedList] = useState(false);
  const [showCartMobile, setShowCartMobile] = useState(false); // Mobile cart modal state

  useEffect(() => { if (!categories.find(c=>c.id===cat)) setCat(categories[0]?.id); }, [categories]);

  // Persist the in-progress order so it isn't lost on tab switch or refresh.
  useEffect(() => {
    stor.set("orderDraft", { cart, discount, note, parkedId, parkedName });
  }, [cart, discount, note, parkedId, parkedName]);

  const filtered = menu.filter(m => m.cat===cat && (search==="" || m.name.toLowerCase().includes(search.toLowerCase()) || m.nameLao.includes(search)));

  const onMenuClick = (item) => {
    // All drinks → show modal (sweetness level, plus add-ons for coffee/matcha)
    if (DRINK_CATEGORIES.includes(item.cat)) {
      setAddonItem(item);
    } else {
      addToCart(item, []);
    }
  };

  const addToCart = (item, selectedAddons, sweetness) => {
    const newItem = { ...item, addons: selectedAddons, ...(sweetness ? { sweetness } : {}) };
    const key = cartKey(newItem);
    setCart(prev => {
      const ex = prev.find(c => cartKey(c) === key);
      if (ex) return prev.map(c => cartKey(c) === key ? { ...c, qty: c.qty + 1 } : c);
      return [...prev, { ...newItem, qty: 1 }];
    });
  };

  const updateQty = (key, d) => setCart(prev => prev.map(c => cartKey(c)===key ? {...c, qty: Math.max(0, c.qty+d)} : c).filter(c => c.qty > 0));

  const subtotal = cart.reduce((s,c) => s + itemPrice(c) * c.qty, 0);
  const total = Math.max(0, subtotal - discount);
  const change = payment==="cash" && received ? Number(received) - total : 0;

  const clearCart = () => {
    setCart([]); setDiscount(0); setReceived(""); setNote(""); setFocReason("");
    setShowCheckout(false); setShowQR(false); setParkedId(null); setParkedName("");
    setPayment("cash");
  };

  const finalize = (pmtOverride) => {
    const p = pmtOverride || payment;
    if (cart.length === 0) return;
    const order = {
      id: genId(), date: new Date().toISOString(),
      items: cart, total: subtotal, discount, payment: p,
      received: p==="cash" ? Number(received) : null,
      note: p==="foc" ? (focReason || "FOC") : note,
      cashier, shiftId: currentShift?.id, voided: false,
      parkedName: parkedName || null,
    };
    onSale(order);
    setReceipt(order);
    // remove from parked if this was a resumed order
    if (parkedId) setParkedOrders(parkedOrders.filter(p => p.id !== parkedId));
    clearCart();
  };

  const checkout = () => {
    if (cart.length === 0) return;
    if (payment === "qr") { setShowQR(true); return; }
    finalize();
  };

  const parkOrder = (name) => {
    const parked = {
      id: parkedId || genId(),
      name, items: cart, discount, note,
      parkedAt: new Date().toISOString(),
      cashier,
    };
    const updated = parkedId
      ? parkedOrders.map(p => p.id === parkedId ? parked : p)
      : [...parkedOrders, parked];
    setParkedOrders(updated);
    clearCart();
    setShowParkModal(false);
  };

  const resumeParked = (parked) => {
    setCart(parked.items);
    setDiscount(parked.discount || 0);
    setNote(parked.note || "");
    setParkedId(parked.id);
    setParkedName(parked.name);
    setShowParkedList(false);
  };

  const deleteParked = (id) => {
    if (!window.confirm("ລຶບລາຍການພັກ?")) return;
    setParkedOrders(parkedOrders.filter(p => p.id !== id));
  };

  if (!currentShift) return (
    <div style={{ display:"flex",alignItems:"center",justifyContent:"center",height:"100vh",background:"#f0ece4",fontFamily:"'Noto Sans Lao',sans-serif",flexDirection:"column",gap:12 }}>
      <div style={{ fontSize:60 }}>🌅</div>
      <div style={{ fontSize:18,fontWeight:700 }}>ກະຍັງບໍ່ໄດ້ເປີດ</div>
      <div style={{ fontSize:13,color:"#6b7280" }}>ໄປທີ່ "ກະ" ເພື່ອເປີດກ່ອນ</div>
    </div>
  );

  return (
    <div style={{ display:"flex",width:"100%",height:"100vh",fontFamily:"'Noto Sans Lao','Segoe UI',sans-serif",background:"#f0ece4",overflow:"hidden" }}>
      <div style={{ flex:1,minWidth:0,display:"flex",flexDirection:"column",overflowY:"auto" }}>
        <div style={{ padding:"10px 14px",background:"#1a1a2e",display:"flex",gap:8,alignItems:"center" }}>
          <input placeholder="🔍 ຄົ້ນຫາ..." value={search} onChange={e=>setSearch(e.target.value)}
            style={{ flex:1,padding:"10px 14px",borderRadius:10,border:"none",background:"rgba(255,255,255,0.15)",color:"#fff",fontSize:14,outline:"none" }} />
          {isMobile && (
            <button onClick={()=>setShowCartMobile(true)} style={{
              padding:"10px 14px",borderRadius:10,border:"none",cursor:"pointer",
              background: cart.length>0 ? "#f4d03f" : "rgba(255,255,255,0.12)",
              color: cart.length>0 ? "#1a1a2e" : "#fff",fontWeight:700,fontSize:13,position:"relative",whiteSpace:"nowrap"
            }}>
              🛒 {cart.reduce((s,c)=>s+c.qty,0)}
              {cart.length > 0 && (
                <span style={{ position:"absolute",top:-4,right:-4,background:"#dc2626",color:"#fff",borderRadius:"50%",width:18,height:18,fontSize:10,fontWeight:700,display:"flex",alignItems:"center",justifyContent:"center" }}>
                  {cart.length}
                </span>
              )}
            </button>
          )}
          <button onClick={()=>setShowParkedList(true)} style={{
            padding:"10px 14px",borderRadius:10,border:"none",cursor:"pointer",
            background: parkedOrders.length>0 ? "#ea580c" : "rgba(255,255,255,0.12)",
            color:"#fff",fontWeight:700,fontSize:13,position:"relative",whiteSpace:"nowrap"
          }}>
            📋 ພັກໄວ້
            {parkedOrders.length > 0 && (
              <span style={{ position:"absolute",top:-4,right:-4,background:"#fff",color:"#ea580c",borderRadius:"50%",width:20,height:20,fontSize:11,fontWeight:700,display:"flex",alignItems:"center",justifyContent:"center" }}>
                {parkedOrders.length}
              </span>
            )}
          </button>
        </div>
        {parkedName && (
          <div style={{ padding:"8px 14px",background:"#fed7aa",fontSize:13,color:"#9a3412",fontWeight:600,display:"flex",justifyContent:"space-between",alignItems:"center" }}>
            <span>📋 ກຳລັງແກ້ໄຂ: <b>{parkedName}</b></span>
            <button onClick={clearCart} style={{ padding:"4px 10px",background:"#fff",color:"#9a3412",border:"none",borderRadius:6,cursor:"pointer",fontSize:11 }}>ຍົກເລີກ</button>
          </div>
        )}
        <div style={{ display:"flex",background:"#1a1a2e",padding:"0 8px 8px",gap:6,overflowX:"auto",flexShrink:0,flexWrap:"wrap" }}>
          {categories.map(c => (
            <button key={c.id} onClick={()=>setCat(c.id)} style={{
              padding:"8px 14px",borderRadius:20,border:"none",cursor:"pointer",
              background:cat===c.id?"#f4d03f":"rgba(255,255,255,0.12)",
              color:cat===c.id?"#1a1a2e":"#e5e7eb",fontWeight:cat===c.id?700:500,fontSize:13,whiteSpace:"nowrap"
            }}>{c.label}{ADDON_CATEGORIES.includes(c.id) && " ✨"}</button>
          ))}
        </div>
        <div className="grid-responsive products" style={{ gap:10,padding:14,flex:1,display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(148px,1fr))" }}>
          {filtered.map(item => {
            const hasAddons = ADDON_CATEGORIES.includes(item.cat) && addons.length > 0;
            return (
              <button key={item.id} onClick={()=>onMenuClick(item)} style={{
                background:"#fff",border:"1px solid #e5e7eb",borderRadius:12,padding:0,
                cursor:"pointer",textAlign:"center",position:"relative",boxShadow:"0 1px 4px rgba(0,0,0,0.06)",
                overflow:"hidden",display:"flex",flexDirection:"column"
              }}>
                {item.popular && <span style={{ position:"absolute",top:6,right:6,background:"#f4d03f",color:"#1a1a2e",fontSize:9,fontWeight:700,padding:"2px 5px",borderRadius:4,zIndex:1 }}>🔥</span>}
                {hasAddons && <span style={{ position:"absolute",top:6,left:6,background:"#ede9fe",color:"#7c3aed",fontSize:9,fontWeight:700,padding:"2px 5px",borderRadius:4,zIndex:1 }}>✨</span>}
                {item.image
                  ? <img src={item.image} alt={item.name} style={{ width:"100%",height:110,objectFit:"cover",display:"block",flexShrink:0 }} />
                  : <div style={{ width:"100%",height:110,display:"flex",alignItems:"center",justifyContent:"center",background:"#f9fafb",fontSize:52,flexShrink:0 }}>{item.emoji}</div>}
                <div style={{ padding:"8px 8px 10px",display:"flex",flexDirection:"column",gap:2 }}>
                  <div style={{ fontSize:12,fontWeight:600,color:"#1a1a2e",lineHeight:1.3 }}>{item.name}</div>
                  <div style={{ fontSize:11,color:"#6b7280" }}>{item.nameLao}</div>
                  <div style={{ fontSize:13,fontWeight:700,color:"#7c3aed",marginTop:2 }}>{formatKip(item.price)}</div>
                </div>
              </button>
            );
          })}
          {filtered.length===0 && <div style={{ gridColumn:"1/-1",textAlign:"center",padding:40,color:"#9ca3af" }}>ບໍ່ພົບເມນູ</div>}
        </div>
      </div>

      {/* cart - hidden on mobile, shown as sidebar on desktop/tablet */}
      {!isMobile && (
      <div className="cart-sidebar" style={{ width:340,background:"#fff",display:"flex",flexDirection:"column",borderLeft:"1px solid #e5e7eb" }}>
        <div style={{ padding:"14px 20px",background:"#1a1a2e",color:"#f4d03f" }}>
          <div style={{ fontSize:16,fontWeight:700 }}>🛒 ລາຍການ</div>
          <div style={{ fontSize:12,color:"#9ca3af",marginTop:2 }}>{cart.reduce((s,c)=>s+c.qty,0)} ລາຍການ {parkedName && `· ${parkedName}`}</div>
        </div>
        <div style={{ flex:1,overflowY:"auto",padding:"12px 14px" }}>
          {cart.length===0
            ? <div style={{ textAlign:"center",padding:40,color:"#9ca3af" }}><div style={{ fontSize:40 }}>🧺</div><div style={{ marginTop:8,fontSize:13 }}>ຍັງບໍ່ມີລາຍການ</div></div>
            : cart.map(item => {
              const key = cartKey(item);
              const lp = itemPrice(item);
              return (
                <div key={key} style={{ padding:"8px 0",borderBottom:"1px solid #f3f4f6" }}>
                  <div style={{ display:"flex",alignItems:"center",gap:8 }}>
                    <span style={{ fontSize:20 }}>{item.emoji}</span>
                    <div style={{ flex:1,minWidth:0 }}>
                      <div style={{ fontSize:13,fontWeight:600,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap" }}>{item.name}</div>
                      <div style={{ fontSize:11,color:"#7c3aed",fontWeight:600 }}>{formatKip(lp)}</div>
                    </div>
                    <div style={{ display:"flex",alignItems:"center",gap:5 }}>
                      <button onClick={()=>updateQty(key,-1)} style={{ width:30,height:30,minWidth:30,borderRadius:"50%",border:"1px solid #e5e7eb",background:"#f9fafb",cursor:"pointer",fontWeight:700,padding:0,display:"flex",alignItems:"center",justifyContent:"center",fontSize:16,lineHeight:1 }}>−</button>
                      <span style={{ fontSize:13,fontWeight:700,minWidth:18,textAlign:"center" }}>{item.qty}</span>
                      <button onClick={()=>updateQty(key,1)} style={{ width:30,height:30,minWidth:30,borderRadius:"50%",border:"none",background:"#1a1a2e",color:"#f4d03f",cursor:"pointer",fontWeight:700,padding:0,display:"flex",alignItems:"center",justifyContent:"center",fontSize:16,lineHeight:1 }}>+</button>
                    </div>
                    <div style={{ fontSize:13,fontWeight:700,minWidth:65,textAlign:"right" }}>{formatKip(lp*item.qty)}</div>
                  </div>
                  {(item.sweetness || (item.addons || []).length > 0) && (
                    <div style={{ paddingLeft:28,marginTop:2 }}>
                      {item.sweetness && <div style={{ fontSize:11,color:"#16a34a" }}>{sweetLabel(item.sweetness)}</div>}
                      {(item.addons || []).map(a => (
                        <div key={a.id} style={{ fontSize:11,color:"#7c3aed" }}>+ {a.nameLao} <span style={{ color:"#9ca3af" }}>({formatKip(a.price)})</span></div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })
          }
        </div>
        {cart.length>0 && !showCheckout && (
          <div style={{ padding:"10px 14px",borderTop:"1px solid #f3f4f6" }}>
            <div style={{ display:"flex",justifyContent:"space-between",marginBottom:8 }}>
              <span style={{ color:"#6b7280",fontSize:14 }}>ລວມ</span>
              <span style={{ fontWeight:700,fontSize:16 }}>{formatKip(subtotal)}</span>
            </div>
            <button onClick={()=>setShowCheckout(true)} style={{ width:"100%",padding:13,background:"#f4d03f",color:"#1a1a2e",border:"none",borderRadius:10,fontWeight:700,fontSize:15,cursor:"pointer" }}>ຊຳລະ →</button>
            <div style={{ display:"flex",gap:6,marginTop:6 }}>
              <button onClick={()=>setShowParkModal(true)} style={{ flex:1,padding:8,background:"#ea580c",color:"#fff",border:"none",borderRadius:8,fontWeight:600,fontSize:12,cursor:"pointer" }}>📋 ພັກໄວ້</button>
              <button onClick={clearCart} style={{ flex:1,padding:8,background:"transparent",color:"#dc2626",border:"1px solid #fee2e2",borderRadius:8,fontSize:12,cursor:"pointer" }}>✕ ລ້າງ</button>
            </div>
          </div>
        )}
        {showCheckout && (
          <div style={{ padding:14,borderTop:"2px solid #1a1a2e",background:"#f9f6f0" }}>
            <div style={{ marginBottom:10 }}>
              <div style={{ fontSize:12,color:"#6b7280",marginBottom:4 }}>ສ່ວນຫຼຸດ (₭)</div>
              <input type="number" placeholder="0" value={discount||""} onChange={e=>setDiscount(Number(e.target.value))}
                style={{ width:"100%",padding:"8px 10px",borderRadius:8,border:"1px solid #e5e7eb",fontSize:14,boxSizing:"border-box" }} />
            </div>
            <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:6,marginBottom:10 }}>
              {[["cash","💵","ສົດ"],["qr","📲","QR"],["transfer","🏦","ໂອນ"],["foc","🎁","FOC"]].map(([v,ic,l]) => (
                <button key={v} onClick={()=>setPayment(v)} style={{
                  padding:"8px 4px",borderRadius:8,border:payment===v?"2px solid #1a1a2e":"1px solid #e5e7eb",
                  background:payment===v?"#1a1a2e":"#fff",color:payment===v?"#f4d03f":"#374151",
                  fontWeight:payment===v?700:500,cursor:"pointer",fontSize:12
                }}><div style={{ fontSize:16 }}>{ic}</div>{l}</button>
              ))}
            </div>
            {payment==="cash" && (
              <div style={{ marginBottom:10 }}>
                <div style={{ fontSize:12,color:"#6b7280",marginBottom:4 }}>ຮັບເງິນ (₭)</div>
                <input type="number" placeholder="ໃສ່ຈຳນວນ" value={received} onChange={e=>setReceived(e.target.value)}
                  style={{ width:"100%",padding:"8px 10px",borderRadius:8,border:"1px solid #e5e7eb",fontSize:14,boxSizing:"border-box" }} />
                {received && <div style={{ fontSize:13,marginTop:4,color:"#16a34a",fontWeight:600 }}>ທອນ: {formatKip(Math.max(0,change))}</div>}
              </div>
            )}
            {payment==="foc" && (
              <div style={{ background:"#dcfce7",border:"1px solid #86efac",borderRadius:8,padding:10,marginBottom:10,fontSize:12 }}>
                🎁 <b>FOC</b> — ບັນທຶກເປັນ 0 ₭<br/>
                <input value={focReason} onChange={e=>setFocReason(e.target.value)} placeholder="ເຫດຜົນ (ບໍ່ບັງຄັບ)"
                  style={{ width:"100%",padding:"6px 8px",marginTop:6,borderRadius:6,border:"1px solid #86efac",fontSize:12,boxSizing:"border-box" }} />
              </div>
            )}
            <input placeholder="ໝາຍເຫດ..." value={note} onChange={e=>setNote(e.target.value)}
              style={{ width:"100%",padding:"8px 10px",borderRadius:8,border:"1px solid #e5e7eb",fontSize:13,marginBottom:10,boxSizing:"border-box" }} />
            <div style={{ display:"flex",justifyContent:"space-between",fontWeight:700,fontSize:18,marginBottom:10 }}>
              <span>ທັງໝົດ</span>
              <span style={{ color:payment==="foc"?"#16a34a":"#7c3aed" }}>{payment==="foc"?"FOC ★":formatKip(total)}</span>
            </div>
            <button onClick={checkout} disabled={payment==="cash" && (!received||Number(received)<total)}
              style={{ width:"100%",padding:13,background:"#16a34a",color:"#fff",border:"none",borderRadius:10,fontWeight:700,fontSize:15,cursor:"pointer",opacity:(payment==="cash"&&(!received||Number(received)<total))?0.5:1 }}>
              {payment==="qr"?"📲 ສ້າງ QR":payment==="foc"?"🎁 ຢືນຢັນ FOC":"✅ ຢືນຢັນ"}
            </button>
            <button onClick={()=>setShowCheckout(false)} style={{ width:"100%",padding:8,background:"transparent",color:"#6b7280",border:"none",fontSize:13,cursor:"pointer",marginTop:6 }}>← ກັບໄປ</button>
          </div>
        )}
      </div>
      )}

      {/* Mobile cart modal */}
      {isMobile && showCartMobile && (
        <div style={{ position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",display:"flex",alignItems:"flex-end",zIndex:1000 }}>
          <div onClick={e=>e.stopPropagation()} style={{ width:"100%",maxHeight:"85vh",background:"#fff",borderRadius:"16px 16px 0 0",display:"flex",flexDirection:"column",animation:"slideUp 0.3s ease" }}>
            <div style={{ padding:"14px 20px",background:"#1a1a2e",color:"#f4d03f",display:"flex",justifyContent:"space-between",alignItems:"center" }}>
              <div>
                <div style={{ fontSize:16,fontWeight:700 }}>🛒 ລາຍການ</div>
                <div style={{ fontSize:12,color:"#9ca3af",marginTop:2 }}>{cart.reduce((s,c)=>s+c.qty,0)} ລາຍການ {parkedName && `· ${parkedName}`}</div>
              </div>
              <button onClick={()=>setShowCartMobile(false)} style={{ width:32,height:32,borderRadius:8,border:"none",background:"rgba(255,255,255,0.2)",color:"#fff",cursor:"pointer",fontSize:18 }}>✕</button>
            </div>
            <div style={{ flex:1,overflowY:"auto",padding:"12px 14px" }}>
              {cart.length===0
                ? <div style={{ textAlign:"center",padding:40,color:"#9ca3af" }}><div style={{ fontSize:40 }}>🧺</div><div style={{ marginTop:8,fontSize:13 }}>ຍັງບໍ່ມີລາຍການ</div></div>
                : cart.map(item => {
                  const key = cartKey(item);
                  const lp = itemPrice(item);
                  return (
                    <div key={key} style={{ padding:"8px 0",borderBottom:"1px solid #f3f4f6" }}>
                      <div style={{ display:"flex",alignItems:"center",gap:8 }}>
                        <span style={{ fontSize:20 }}>{item.emoji}</span>
                        <div style={{ flex:1,minWidth:0 }}>
                          <div style={{ fontSize:13,fontWeight:600,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap" }}>{item.name}</div>
                          <div style={{ fontSize:11,color:"#7c3aed",fontWeight:600 }}>{formatKip(lp)}</div>
                        </div>
                        <div style={{ display:"flex",alignItems:"center",gap:5 }}>
                          <button onClick={()=>updateQty(key,-1)} style={{ width:30,height:30,minWidth:30,borderRadius:"50%",border:"1px solid #e5e7eb",background:"#f9fafb",cursor:"pointer",fontWeight:700,padding:0,display:"flex",alignItems:"center",justifyContent:"center",fontSize:16,lineHeight:1 }}>−</button>
                          <span style={{ fontSize:13,fontWeight:700,minWidth:18,textAlign:"center" }}>{item.qty}</span>
                          <button onClick={()=>updateQty(key,1)} style={{ width:30,height:30,minWidth:30,borderRadius:"50%",border:"none",background:"#1a1a2e",color:"#f4d03f",cursor:"pointer",fontWeight:700,padding:0,display:"flex",alignItems:"center",justifyContent:"center",fontSize:16,lineHeight:1 }}>+</button>
                        </div>
                        <div style={{ fontSize:13,fontWeight:700,minWidth:65,textAlign:"right" }}>{formatKip(lp*item.qty)}</div>
                      </div>
                      {(item.sweetness || (item.addons || []).length > 0) && (
                        <div style={{ paddingLeft:28,marginTop:2 }}>
                          {item.sweetness && <div style={{ fontSize:11,color:"#16a34a" }}>{sweetLabel(item.sweetness)}</div>}
                          {(item.addons || []).map(a => (
                            <div key={a.id} style={{ fontSize:11,color:"#7c3aed" }}>+ {a.nameLao} <span style={{ color:"#9ca3af" }}>({formatKip(a.price)})</span></div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })
              }
            </div>
            {cart.length>0 && !showCheckout && (
              <div style={{ padding:"10px 14px",borderTop:"1px solid #f3f4f6" }}>
                <div style={{ display:"flex",justifyContent:"space-between",marginBottom:8 }}>
                  <span style={{ color:"#6b7280",fontSize:14 }}>ລວມ</span>
                  <span style={{ fontWeight:700,fontSize:16 }}>{formatKip(subtotal)}</span>
                </div>
                <button onClick={()=>{setShowCheckout(true); setShowCartMobile(false);}} style={{ width:"100%",padding:13,background:"#f4d03f",color:"#1a1a2e",border:"none",borderRadius:10,fontWeight:700,fontSize:15,cursor:"pointer" }}>ຊຳລະ →</button>
                <div style={{ display:"flex",gap:6,marginTop:6 }}>
                  <button onClick={()=>setShowParkModal(true)} style={{ flex:1,padding:8,background:"#ea580c",color:"#fff",border:"none",borderRadius:8,fontWeight:600,fontSize:12,cursor:"pointer" }}>📋 ພັກໄວ້</button>
                  <button onClick={clearCart} style={{ flex:1,padding:8,background:"transparent",color:"#dc2626",border:"1px solid #fee2e2",borderRadius:8,fontSize:12,cursor:"pointer" }}>✕ ລ້າງ</button>
                </div>
              </div>
            )}
            {showCheckout && (
              <div style={{ padding:14,borderTop:"2px solid #1a1a2e",background:"#f9f6f0" }}>
                <div style={{ marginBottom:10 }}>
                  <div style={{ fontSize:12,color:"#6b7280",marginBottom:4 }}>ສ່ວນຫຼຸດ (₭)</div>
                  <input type="number" placeholder="0" value={discount||""} onChange={e=>setDiscount(Number(e.target.value))}
                    style={{ width:"100%",padding:"8px 10px",borderRadius:8,border:"1px solid #e5e7eb",fontSize:14,boxSizing:"border-box" }} />
                </div>
                <div className="grid-responsive payment-grid" style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:6,marginBottom:10 }}>
                  {[["cash","💵","ສົດ"],["qr","📲","QR"],["transfer","🏦","ໂອນ"],["foc","🎁","FOC"]].map(([v,ic,l]) => (
                    <button key={v} onClick={()=>setPayment(v)} style={{
                      padding:"8px 4px",borderRadius:8,border:payment===v?"2px solid #1a1a2e":"1px solid #e5e7eb",
                      background:payment===v?"#1a1a2e":"#fff",color:payment===v?"#f4d03f":"#374151",
                      fontWeight:payment===v?700:500,cursor:"pointer",fontSize:12
                    }}><div style={{ fontSize:16 }}>{ic}</div>{l}</button>
                  ))}
                </div>
                {payment==="cash" && (
                  <div style={{ marginBottom:10 }}>
                    <div style={{ fontSize:12,color:"#6b7280",marginBottom:4 }}>ຮັບເງິນ (₭)</div>
                    <input type="number" placeholder="ໃສ່ຈຳນວນ" value={received} onChange={e=>setReceived(e.target.value)}
                      style={{ width:"100%",padding:"8px 10px",borderRadius:8,border:"1px solid #e5e7eb",fontSize:14,boxSizing:"border-box" }} />
                    {received && <div style={{ fontSize:13,marginTop:4,color:"#16a34a",fontWeight:600 }}>ທອນ: {formatKip(Math.max(0,change))}</div>}
                  </div>
                )}
                {payment==="foc" && (
                  <div style={{ background:"#dcfce7",border:"1px solid #86efac",borderRadius:8,padding:10,marginBottom:10,fontSize:12 }}>
                    🎁 <b>FOC</b> — ບັນທຶກເປັນ 0 ₭<br/>
                    <input value={focReason} onChange={e=>setFocReason(e.target.value)} placeholder="ເຫດຜົນ (ບໍ່ບັງຄັບ)"
                      style={{ width:"100%",padding:"6px 8px",marginTop:6,borderRadius:6,border:"1px solid #86efac",fontSize:12,boxSizing:"border-box" }} />
                  </div>
                )}
                <input placeholder="ໝາຍເຫດ..." value={note} onChange={e=>setNote(e.target.value)}
                  style={{ width:"100%",padding:"8px 10px",borderRadius:8,border:"1px solid #e5e7eb",fontSize:13,marginBottom:10,boxSizing:"border-box" }} />
                <div style={{ display:"flex",justifyContent:"space-between",fontWeight:700,fontSize:18,marginBottom:10 }}>
                  <span>ທັງໝົດ</span>
                  <span style={{ color:payment==="foc"?"#16a34a":"#7c3aed" }}>{payment==="foc"?"FOC ★":formatKip(total)}</span>
                </div>
                <button onClick={checkout} disabled={payment==="cash" && (!received||Number(received)<total)}
                  style={{ width:"100%",padding:13,background:"#16a34a",color:"#fff",border:"none",borderRadius:10,fontWeight:700,fontSize:15,cursor:"pointer",opacity:(payment==="cash"&&(!received||Number(received)<total))?0.5:1 }}>
                  {payment==="qr"?"📲 ສ້າງ QR":payment==="foc"?"🎁 ຢືນຢັນ FOC":"✅ ຢືນຢັນ"}
                </button>
                <button onClick={()=>setShowCheckout(false)} style={{ width:"100%",padding:8,background:"transparent",color:"#6b7280",border:"none",fontSize:13,cursor:"pointer",marginTop:6 }}>← ກັບໄປ</button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Parked orders list overlay */}
      {showParkedList && (
        <div style={{ position:"fixed",inset:0,background:"rgba(0,0,0,0.6)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:998 }} onClick={()=>setShowParkedList(false)}>
          <div onClick={e=>e.stopPropagation()} style={{ background:"#fff",borderRadius:16,maxWidth:480,width:"90%",maxHeight:"80vh",display:"flex",flexDirection:"column" }}>
            <div style={{ padding:"18px 20px",borderBottom:"1px solid #f3f4f6",display:"flex",justifyContent:"space-between",alignItems:"center" }}>
              <div>
                <div style={{ fontSize:17,fontWeight:700 }}>📋 ໃບສັ່ງທີ່ພັກໄວ້</div>
                <div style={{ fontSize:12,color:"#6b7280" }}>{parkedOrders.length} ໃບ — ກົດເພື່ອສືບຕໍ່</div>
              </div>
              <button onClick={()=>setShowParkedList(false)} style={{ width:32,height:32,borderRadius:8,border:"none",background:"#f3f4f6",cursor:"pointer" }}>✕</button>
            </div>
            <div style={{ flex:1,overflowY:"auto",padding:"10px 14px" }}>
              {parkedOrders.length === 0
                ? <div style={{ textAlign:"center",padding:40,color:"#9ca3af" }}><div style={{ fontSize:40 }}>📋</div><div style={{ marginTop:8,fontSize:13 }}>ຍັງບໍ່ມີໃບສັ່ງທີ່ພັກໄວ້</div></div>
                : parkedOrders.map(p => {
                  const ptotal = p.items.reduce((s,i) => s + itemPrice(i) * i.qty, 0) - (p.discount||0);
                  return (
                    <div key={p.id} style={{ display:"flex",alignItems:"center",gap:10,padding:"10px 12px",borderBottom:"1px solid #f3f4f6",borderRadius:8,background:"#fff7ed",marginBottom:6,border:"1px solid #fed7aa" }}>
                      <div style={{ fontSize:24 }}>📋</div>
                      <div style={{ flex:1 }}>
                        <div style={{ fontSize:14,fontWeight:700,color:"#9a3412" }}>{p.name}</div>
                        <div style={{ fontSize:12,color:"#6b7280" }}>{fmtTime(p.parkedAt)} · {p.items.reduce((s,i)=>s+i.qty,0)} ລາຍການ</div>
                        <div style={{ fontSize:11,color:"#9ca3af",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap" }}>
                          {p.items.map(i=>`${i.emoji}${i.name}×${i.qty}`).join(" · ")}
                        </div>
                      </div>
                      <div style={{ fontSize:14,fontWeight:700,color:"#7c3aed",minWidth:80,textAlign:"right" }}>{formatKip(ptotal)}</div>
                      <button onClick={()=>resumeParked(p)} style={{ padding:"8px 12px",background:"#16a34a",color:"#fff",border:"none",borderRadius:8,fontWeight:700,cursor:"pointer",fontSize:12 }}>▶ ສືບຕໍ່</button>
                      <button onClick={()=>deleteParked(p.id)} style={{ padding:"8px 10px",background:"#fee2e2",color:"#dc2626",border:"none",borderRadius:8,cursor:"pointer",fontSize:12 }}>🗑</button>
                    </div>
                  );
                })
              }
            </div>
          </div>
        </div>
      )}

      {addonItem && <AddonModal item={addonItem} addons={addons} onConfirm={(a, sw) => { addToCart(addonItem, a, sw); setAddonItem(null); }} onCancel={()=>setAddonItem(null)} />}
      {showParkModal && <ParkModal onConfirm={parkOrder} onCancel={()=>setShowParkModal(false)} />}
      {showQR && <QRModal amount={total} qrImage={qrImage} shopInfo={shopInfo} onConfirm={()=>finalize("qr")} onCancel={()=>setShowQR(false)} />}
      {receipt && <ReceiptModal order={receipt} shopInfo={shopInfo} onClose={()=>setReceipt(null)} onSaveRemark={(o)=>{ setReceipt(o); onUpdateSale && onUpdateSale(o); }} />}
    </div>
  );
}

// ============================================================
// DASHBOARD
// ============================================================
// ── Recharts custom tooltip ──────────────────────────────────
function KipTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background:"#fff", border:"1px solid #e5e7eb", borderRadius:8, padding:"8px 12px", fontSize:12, boxShadow:"0 2px 8px rgba(0,0,0,0.1)" }}>
      <div style={{ fontWeight:700, marginBottom:4, color:"#1a1a2e" }}>{label}</div>
      {payload.map((p,i)=>(
        <div key={i} style={{ color:p.color || "#7c3aed" }}>
          {p.name}: {typeof p.value === "number" && p.name !== "ໃບບິນ" ? formatKip(p.value) : p.value}
        </div>
      ))}
    </div>
  );
}

// ── Sync-status badge ─────────────────────────────────────────
function SyncBadge() {
  const [status, setStatus] = useState("checking");
  useEffect(() => {
    checkConnection().then(setStatus);
    const id = setInterval(() => checkConnection().then(setStatus), 30000);
    return () => clearInterval(id);
  }, []);
  const cfg = {
    online:   { bg:"#dcfce7", color:"#16a34a", label:"🟢 Cloud Sync" },
    offline:  { bg:"#fed7aa", color:"#ea580c", label:"🟡 Offline" },
    "no-db":  { bg:"#f3f4f6", color:"#6b7280", label:"⚪ Local Only" },
    checking: { bg:"#f3f4f6", color:"#6b7280", label:"… Checking" },
  }[status] || { bg:"#f3f4f6", color:"#6b7280", label:"—" };
  return (
    <div style={{ padding:"5px 10px", background:cfg.bg, borderRadius:20, fontSize:11, fontWeight:600, color:cfg.color, whiteSpace:"nowrap" }}>
      {cfg.label}
    </div>
  );
}

// Full-width warning bar shown whenever the cloud database is unreachable, so
// staff notice immediately that sales are NOT syncing across devices.
function OfflineBanner() {
  const [status, setStatus] = useState("checking");
  useEffect(() => {
    checkConnection().then(setStatus);
    const id = setInterval(() => checkConnection().then(setStatus), 15000);
    return () => clearInterval(id);
  }, []);
  if (status === "online" || status === "checking") return null;
  const isNoDb = status === "no-db";
  return (
    <div style={{
      position:"sticky", top:0, zIndex:50,
      width:"100%", background: isNoDb ? "#6b7280" : "#dc2626", color:"#fff",
      fontFamily:"'Noto Sans Lao',sans-serif", fontSize:12, fontWeight:700,
      textAlign:"center", padding:"6px 10px", lineHeight:1.4, flexShrink:0,
    }}>
      {isNoDb
        ? "⚪ Local Only — ບໍ່ໄດ້ເຊື່ອມຕໍ່ Cloud (ບໍ່ sync ລະຫວ່າງເຄື່ອງ)"
        : "🔴 Offline — ຍັງບໍ່ sync ຂຶ້ນ Cloud! ຂໍ້ມູນຍັງຢູ່ໃນເຄື່ອງນີ້ເທົ່ານັ້ນ / Sales are NOT syncing to other devices"}
    </div>
  );
}

// ── Dashboard ─────────────────────────────────────────────────
function DashboardView({ sales }) {
  const [range, setRange] = useState("today");
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().slice(0, 10));
  const [aiInsight, setAiInsight] = useState("");
  const [loadingAI, setLoadingAI] = useState(false);
  const now = new Date();

  const orderNet = (o) => o.items.reduce((s,i) => s + itemPrice(i)*i.qty, 0) - (o.discount||0);

  // Parse selected date and compute range boundaries
  const selDate = new Date(selectedDate);
  let rangeStart, rangeEnd;

  if (range === "today") {
    rangeStart = new Date(selDate);
    rangeStart.setHours(0, 0, 0, 0);
    rangeEnd = new Date(selDate);
    rangeEnd.setHours(23, 59, 59, 999);
  } else if (range === "week") {
    rangeStart = new Date(selDate);
    rangeStart.setDate(selDate.getDate() - 7);
    rangeStart.setHours(0, 0, 0, 0);
    rangeEnd = new Date(selDate);
    rangeEnd.setHours(23, 59, 59, 999);
  } else if (range === "month") {
    rangeStart = new Date(selDate.getFullYear(), selDate.getMonth(), 1);
    rangeStart.setHours(0, 0, 0, 0);
    rangeEnd = new Date(selDate.getFullYear(), selDate.getMonth() + 1, 0);
    rangeEnd.setHours(23, 59, 59, 999);
  } else if (range === "annual") {
    rangeStart = new Date(selDate.getFullYear(), 0, 1);
    rangeStart.setHours(0, 0, 0, 0);
    rangeEnd = new Date(selDate.getFullYear(), 11, 31);
    rangeEnd.setHours(23, 59, 59, 999);
  }

  const filtered = sales.filter(s => {
    if (s.voided || s.payment === "foc") return false;
    const d = new Date(s.date);
    return d >= rangeStart && d <= rangeEnd;
  });

  const totalRevenue = filtered.reduce((s,o) => s + orderNet(o), 0);
  const totalOrders  = filtered.length;
  const avg          = totalOrders > 0 ? totalRevenue / totalOrders : 0;
  const cashSales    = filtered.filter(o=>o.payment==="cash").reduce((s,o)=>s+orderNet(o),0);
  const qrSales      = filtered.filter(o=>o.payment==="qr").reduce((s,o)=>s+orderNet(o),0);
  const transferSales= filtered.filter(o=>o.payment==="transfer").reduce((s,o)=>s+orderNet(o),0);
  const focCount = sales.filter(s => {
    if (s.payment !== "foc") return false;
    const d = new Date(s.date);
    return d >= rangeStart && d <= rangeEnd;
  }).length;

  // Top items
  const itemCounts = {};
  filtered.forEach(o => o.items.forEach(it => {
    if (!itemCounts[it.name]) itemCounts[it.name] = { name:it.name, nameLao:it.nameLao, emoji:it.emoji, qty:0, rev:0 };
    itemCounts[it.name].qty += it.qty;
    itemCounts[it.name].rev += itemPrice(it) * it.qty;
  }));
  const topItems = Object.values(itemCounts).sort((a,b) => b.qty - a.qty).slice(0, 8);

  // 7-day trend (always last 7 days regardless of range filter)
  const dayTrend = Array.from({ length:7 }, (_,i) => {
    const d = new Date(now);
    d.setDate(now.getDate() - (6-i));
    const ds = d.toDateString();
    const daySales = sales.filter(s => !s.voided && s.payment!=="foc" && new Date(s.date).toDateString()===ds);
    return {
      date: `${String(d.getDate()).padStart(2,"0")}/${String(d.getMonth()+1).padStart(2,"0")}`,
      ລາຍຮັບ: daySales.reduce((s,o) => s+orderNet(o), 0),
      ໃບບິນ: daySales.length,
    };
  });

  // Hourly (7am–9pm)
  const hourly = Array.from({ length:15 }, (_,i) => {
    const h = i + 7;
    const hrSales = filtered.filter(o => new Date(o.date).getHours() === h);
    return {
      hour: `${h}h`,
      ລາຍຮັບ: hrSales.reduce((s,o) => s+orderNet(o), 0),
      ໃບບິນ: hrSales.length,
    };
  });

  // Top-6 chart data
  const topChartData = topItems.slice(0,6).map(it => ({
    name: it.emoji + " " + it.name.split(" ").slice(0,2).join(" "),
    ຊິ້ນ: it.qty,
    ລາຍຮັບ: it.rev,
  }));

  const BAR_COLORS = ["#7c3aed","#2563eb","#16a34a","#ea580c","#0891b2","#db2777"];

  const getAI = async () => {
    setLoadingAI(true);
    const summary = `Pan Pan Bake Vientiane, ${range}: Revenue ${formatKip(totalRevenue)}, Orders ${totalOrders}, Avg ${formatKip(avg)}, Cash ${formatKip(cashSales)}, QR ${formatKip(qrSales)}, FOC ${focCount}, Top: ${topItems.slice(0,5).map(i=>`${i.name}(${i.qty})`).join(", ")}`;
    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({ model:"claude-sonnet-4-20250514", max_tokens:1000, messages:[{ role:"user", content:`Business analyst for Lao bakery. 3-4 actionable insights in Lao+English bullets:\n${summary}` }] }) });
      const d = await res.json();
      setAiInsight(d.content?.[0]?.text || "Error");
    } catch { setAiInsight("ກະລຸນາລອງໃໝ່"); }
    setLoadingAI(false);
  };

  return (
    <div style={{ padding:"20px 24px", fontFamily:"'Noto Sans Lao',sans-serif", background:"#f0ece4", minHeight:"100vh" }}>

      {/* Header */}
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16, flexWrap:"wrap", gap:10 }}>
        <div>
          <h1 style={{ margin:0, fontSize:22, fontWeight:700 }}>📊 Dashboard</h1>
          <div style={{ fontSize:13, color:"#6b7280" }}>ລາຍງານຍອດຂາຍ</div>
        </div>
        <div style={{ display:"flex", gap:8, alignItems:"center", flexWrap:"wrap" }}>
          <SyncBadge />
        </div>
      </div>

      {/* Range & Date Selection */}
      <div style={{ display:"flex", gap:8, alignItems:"center", marginBottom:16, flexWrap:"wrap" }}>
        <div style={{ display:"flex", gap:6 }}>
          {[["today","ມື້ນີ້"],["week","7ວັນ"],["month","ເດືອນ"],["annual","ປີ"]].map(([v,l]) => (
            <button key={v} onClick={()=>setRange(v)} style={{ padding:"8px 14px", borderRadius:20, border:"none", cursor:"pointer", background:range===v?"#1a1a2e":"#fff", color:range===v?"#f4d03f":"#374151", fontWeight:range===v?700:500, fontSize:13 }}>{l}</button>
          ))}
        </div>
        <input type="date" value={selectedDate} onChange={e=>setSelectedDate(e.target.value)} style={{ padding:"8px 12px", borderRadius:8, border:"1px solid #e5e7eb", fontSize:13 }} />
        <button onClick={()=>{const d=new Date(selectedDate);d.setDate(d.getDate()-1);setSelectedDate(d.toISOString().slice(0,10));}} style={{ padding:"8px 12px", borderRadius:8, border:"1px solid #e5e7eb", background:"#fff", cursor:"pointer", fontSize:12 }}>← ກ່ອນ</button>
        <button onClick={()=>{const d=new Date(selectedDate);d.setDate(d.getDate()+1);setSelectedDate(d.toISOString().slice(0,10));}} style={{ padding:"8px 12px", borderRadius:8, border:"1px solid #e5e7eb", background:"#fff", cursor:"pointer", fontSize:12 }}>ຕໍ່ไป →</button>
        <button onClick={()=>setSelectedDate(new Date().toISOString().slice(0,10))} style={{ padding:"8px 12px", borderRadius:8, border:"1px solid #e5e7eb", background:"#f0f9ff", color:"#0284c7", cursor:"pointer", fontSize:12, fontWeight:600 }}>ວันນີ້</button>
      </div>

      {/* KPI Cards */}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(145px,1fr))", gap:12, marginBottom:20 }}>
        {[
          ["💰","ລາຍໄດ້",formatKip(totalRevenue),"#7c3aed"],
          ["🧾","ໃບບິນ",totalOrders,"#16a34a"],
          ["📈","ສະເລ່ຍ",formatKip(avg),"#2563eb"],
          ["💵","ສົດ",formatKip(cashSales),"#ea580c"],
          ["📲","QR",formatKip(qrSales),"#7c3aed"],
          ["🎁","FOC",focCount+" ໃບ","#6b7280"],
        ].map(([ic,l,v,c]) => (
          <div key={l} style={{ background:"#fff", borderRadius:12, padding:14, border:"1px solid #e5e7eb" }}>
            <div style={{ fontSize:20 }}>{ic}</div>
            <div style={{ fontSize:11, color:"#6b7280", marginTop:4 }}>{l}</div>
            <div style={{ fontSize:16, fontWeight:700, color:c, marginTop:2 }}>{v}</div>
          </div>
        ))}
      </div>

      {/* 7-Day Sales Trend */}
      <div style={{ background:"#fff", borderRadius:12, padding:16, border:"1px solid #e5e7eb", marginBottom:16 }}>
        <div style={{ fontSize:14, fontWeight:600, marginBottom:14 }}>📅 ຍອດຂາຍ 7 ວັນຫຼ້າສຸດ</div>
        <ResponsiveContainer width="100%" height={190}>
          <BarChart data={dayTrend} margin={{ top:4, right:8, left:0, bottom:4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
            <XAxis dataKey="date" tick={{ fontSize:11, fill:"#6b7280" }} axisLine={false} tickLine={false} />
            <YAxis tickFormatter={v => v > 0 ? `${(v/1000).toFixed(0)}K` : "0"} tick={{ fontSize:10, fill:"#9ca3af" }} axisLine={false} tickLine={false} width={36} />
            <Tooltip content={<KipTooltip />} />
            <Bar dataKey="ລາຍຮັບ" fill="#7c3aed" radius={[5,5,0,0]} maxBarSize={48} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Peak Hours + Top Products */}
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16, marginBottom:16 }}>

        {/* Peak Hours */}
        <div style={{ background:"#fff", borderRadius:12, padding:16, border:"1px solid #e5e7eb" }}>
          <div style={{ fontSize:14, fontWeight:600, marginBottom:14 }}>⏰ ຊົ່ວໂມງຂາຍດີ</div>
          <ResponsiveContainer width="100%" height={165}>
            <BarChart data={hourly} margin={{ top:4, right:4, left:-22, bottom:4 }}>
              <XAxis dataKey="hour" tick={{ fontSize:9, fill:"#9ca3af" }} axisLine={false} tickLine={false} />
              <YAxis hide />
              <Tooltip content={<KipTooltip />} />
              <Bar dataKey="ລາຍຮັບ" radius={[4,4,0,0]} maxBarSize={30}>
                {hourly.map((entry, i) => (
                  <Cell key={i} fill={entry.ລາຍຮັບ > 0 ? "#f4d03f" : "#e5e7eb"} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Top Products */}
        <div style={{ background:"#fff", borderRadius:12, padding:16, border:"1px solid #e5e7eb" }}>
          <div style={{ fontSize:14, fontWeight:600, marginBottom:14 }}>🏆 ເມນູຂາຍດີ</div>
          {topItems.length === 0
            ? <div style={{ color:"#9ca3af", textAlign:"center", padding:20, fontSize:13 }}>ຍັງບໍ່ມີ</div>
            : topItems.slice(0,6).map((it, i) => (
                <div key={it.name} style={{ display:"flex", alignItems:"center", gap:8, marginBottom:9 }}>
                  <span style={{ width:20, height:20, borderRadius:"50%", background:i<3?"#f4d03f":"#f3f4f6", display:"flex", alignItems:"center", justifyContent:"center", fontSize:10, fontWeight:700, color:i<3?"#1a1a2e":"#6b7280", flexShrink:0 }}>{i+1}</span>
                  <span style={{ fontSize:15 }}>{it.emoji}</span>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontSize:12, fontWeight:600, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{it.name}</div>
                    <div style={{ display:"flex", alignItems:"center", gap:4, marginTop:2 }}>
                      <div style={{ height:4, background:"#7c3aed", borderRadius:2, width:`${(it.qty/topItems[0].qty)*100}%`, minWidth:4 }} />
                      <span style={{ fontSize:10, color:"#9ca3af", whiteSpace:"nowrap" }}>{it.qty} ຊິ້ນ</span>
                    </div>
                  </div>
                  <div style={{ fontSize:11, fontWeight:700, color:"#7c3aed", whiteSpace:"nowrap" }}>{formatKip(it.rev)}</div>
                </div>
              ))
          }
        </div>
      </div>

      {/* Top Products Bar Chart */}
      {topChartData.length > 0 && (
        <div style={{ background:"#fff", borderRadius:12, padding:16, border:"1px solid #e5e7eb", marginBottom:16 }}>
          <div style={{ fontSize:14, fontWeight:600, marginBottom:14 }}>📦 ລາຍຮັບຕາມສິນຄ້າ (Top 6)</div>
          <ResponsiveContainer width="100%" height={190}>
            <BarChart data={topChartData} margin={{ top:4, right:8, left:0, bottom:4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize:10, fill:"#6b7280" }} axisLine={false} tickLine={false} />
              <YAxis tickFormatter={v => v > 0 ? `${(v/1000).toFixed(0)}K` : "0"} tick={{ fontSize:10, fill:"#9ca3af" }} axisLine={false} tickLine={false} width={36} />
              <Tooltip content={<KipTooltip />} />
              <Bar dataKey="ລາຍຮັບ" radius={[5,5,0,0]} maxBarSize={48}>
                {topChartData.map((_,i) => <Cell key={i} fill={BAR_COLORS[i % BAR_COLORS.length]} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Payment Breakdown */}
      <div style={{ background:"#fff", borderRadius:12, padding:16, border:"1px solid #e5e7eb", marginBottom:16 }}>
        <div style={{ fontSize:14, fontWeight:600, marginBottom:14 }}>💳 ວິທີຊຳລະ</div>
        <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:10 }}>
          {[
            { label:"💵 ສົດ", value:cashSales, color:"#16a34a" },
            { label:"📲 QR", value:qrSales, color:"#7c3aed" },
            { label:"🏦 ໂອນ", value:transferSales, color:"#2563eb" },
          ].map(m => {
            const pct = totalRevenue > 0 ? (m.value / totalRevenue * 100) : 0;
            return (
              <div key={m.label} style={{ textAlign:"center", padding:10 }}>
                <div style={{ fontSize:13, marginBottom:6 }}>{m.label}</div>
                <div style={{ fontSize:15, fontWeight:700, color:m.color }}>{formatKip(m.value)}</div>
                <div style={{ fontSize:11, color:"#9ca3af", marginTop:2 }}>{pct.toFixed(1)}%</div>
                <div style={{ height:5, background:"#f3f4f6", borderRadius:3, marginTop:8, overflow:"hidden" }}>
                  <div style={{ height:"100%", background:m.color, borderRadius:3, width:`${pct}%`, transition:"width 0.5s ease" }} />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* AI Analysis */}
      <div style={{ background:"#1a1a2e", borderRadius:12, padding:20 }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:12 }}>
          <div style={{ fontSize:15, fontWeight:600, color:"#f4d03f" }}>🤖 AI ວິເຄາະ</div>
          <button onClick={getAI} disabled={loadingAI} style={{ padding:"8px 14px", background:"#f4d03f", color:"#1a1a2e", border:"none", borderRadius:8, fontWeight:700, cursor:"pointer", fontSize:13, opacity:loadingAI?0.7:1 }}>
            {loadingAI ? "⏳ ກຳລັງ..." : "✨ ວິເຄາະ"}
          </button>
        </div>
        {aiInsight
          ? <div style={{ fontSize:13, color:"#e5e7eb", lineHeight:1.8, whiteSpace:"pre-wrap" }}>{aiInsight}</div>
          : <div style={{ fontSize:13, color:"#6b7280", textAlign:"center", padding:"16px 0" }}>ກົດວິເຄາະ ເພື່ອຮັບຄຳແນະນຳ AI</div>
        }
      </div>
    </div>
  );
}

// ============================================================
// ACCOUNTING (with addons in revenue)
// ============================================================
function AccountingView({ sales }) {
  const [expenses,setExpenses]=useState(()=>stor.get("expenses",[]));
  const [form,setForm]=useState({name:"",nameLao:"",type:"variable",category:"ingredients",amount:"",month:new Date().toISOString().slice(0,7)});
  const [sel,setSel]=useState(new Date().toISOString().slice(0,7));
  const allCats=[...EXPENSE_CATS.fixed,...EXPENSE_CATS.variable];

  useEffect(()=>{
    const valid=EXPENSE_CATS[form.type].find(c=>c.id===form.category);
    if(!valid)setForm(f=>({...f,category:EXPENSE_CATS[f.type][0].id}));
  },[form.type]);

  const saveExp=()=>{ if(!form.name||!form.amount)return; const u=[...expenses,{id:genId(),...form,amount:Number(form.amount)}];setExpenses(u);stor.set("expenses",u);setForm({...form,name:"",nameLao:"",amount:""}); };
  const delExp=(id)=>{const u=expenses.filter(e=>e.id!==id);setExpenses(u);stor.set("expenses",u);};

  const orderNet = (o) => o.items.reduce((s,i)=>s+itemPrice(i)*i.qty,0) - (o.discount||0);
  const monthSales=sales.filter(s=>!s.voided&&s.payment!=="foc"&&s.date.startsWith(sel));
  const revenue=monthSales.reduce((s,o)=>s+orderNet(o),0);
  const monthExp=expenses.filter(e=>e.month===sel);
  const cogs=monthExp.filter(e=>COGS_IDS.includes(e.category)).reduce((s,e)=>s+e.amount,0);
  const grossProfit=revenue-cogs;
  const fixedTotal=monthExp.filter(e=>e.type==="fixed").reduce((s,e)=>s+e.amount,0);
  const varNonCogs=monthExp.filter(e=>e.type==="variable"&&!COGS_IDS.includes(e.category)).reduce((s,e)=>s+e.amount,0);
  const netIncome=grossProfit-fixedTotal-varNonCogs;
  const gm=revenue>0?(grossProfit/revenue*100):0;
  const nm=revenue>0?(netIncome/revenue*100):0;
  const byCat={};
  monthExp.forEach(e=>{const c=allCats.find(x=>x.id===e.category);const key=c?.id||"other";if(!byCat[key])byCat[key]={...c,items:[],total:0,type:e.type};byCat[key].items.push(e);byCat[key].total+=e.amount;});
  const sortedCats=Object.values(byCat).sort((a,b)=>b.total-a.total);
  const totalExpAll=sortedCats.reduce((s,c)=>s+c.total,0);
  const inpStyle={width:"100%",padding:"8px 10px",borderRadius:8,border:"1px solid #e5e7eb",fontSize:14,boxSizing:"border-box"};

  return (
    <div style={{ padding:"20px 24px",fontFamily:"'Noto Sans Lao',sans-serif",background:"#f0ece4",minHeight:"100vh" }}>
      <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20 }}>
        <div><h1 style={{ margin:0,fontSize:22,fontWeight:700 }}>📒 ບັນຊີ</h1><div style={{ fontSize:13,color:"#6b7280" }}>Income Statement</div></div>
        <input type="month" value={sel} onChange={e=>setSel(e.target.value)} style={{ padding:"8px 12px",borderRadius:8,border:"1px solid #e5e7eb",fontSize:14 }} />
      </div>
      <div style={{ background:"#fff",borderRadius:12,padding:20,border:"1px solid #e5e7eb",marginBottom:16 }}>
        <div style={{ fontSize:15,fontWeight:700,marginBottom:14 }}>📊 ລາຍງານ {sel}</div>
        {[
          {label:"💰 ລາຍຮັບ (Revenue)",val:revenue,color:"#16a34a",extra:`${monthSales.length} ໃບ`},
          {label:"− COGS (ວັດຖຸດິບ + ບັນຈຸພັນ)",val:cogs,color:"#dc2626",indent:16},
          {label:"= ກຳໄລຂັ້ນຕົ້ນ",val:grossProfit,color:"#0891b2",bold:true,extra:`${gm.toFixed(1)}%`,sep:true},
          {label:"− ຄ່າໃຊ້ຈ່າຍຄົງທີ່",val:fixedTotal,color:"#dc2626",indent:16},
          {label:"− ຄ່າໃຊ້ຈ່າຍແປຜັນອື່ນ",val:varNonCogs,color:"#dc2626",indent:16},
          {label:"= ກຳໄລສຸດທິ",val:netIncome,color:netIncome>=0?"#7c3aed":"#dc2626",big:true,extra:`${nm.toFixed(1)}%`,sep2:true},
        ].map((r,i)=>(
          <div key={i} style={{ display:"flex",justifyContent:"space-between",padding:r.big?"14px 0":"7px 0",borderTop:r.big?"2px solid #1a1a2e":r.sep||r.sep2?"1px solid #d1d5db":"1px solid #f3f4f6",paddingLeft:r.indent||0 }}>
            <span style={{ fontSize:r.big?15:13,fontWeight:r.big||r.bold?700:500 }}>{r.label}</span>
            <span style={{ display:"flex",gap:8,alignItems:"center" }}>
              {r.extra&&<span style={{ fontSize:11,color:"#6b7280",background:"#f3f4f6",padding:"2px 6px",borderRadius:4 }}>{r.extra}</span>}
              <span style={{ fontSize:r.big?18:14,fontWeight:700,color:r.color }}>{formatKip(r.val)}</span>
            </span>
          </div>
        ))}
      </div>
      <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:16,marginBottom:16 }}>
        <div style={{ background:"#fff",borderRadius:12,padding:16,border:"1px solid #e5e7eb" }}>
          <div style={{ fontSize:14,fontWeight:600,marginBottom:14 }}>➕ ເພີ່ມລາຍຈ່າຍ</div>
          <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:10 }}>
            <select value={form.type} onChange={e=>setForm({...form,type:e.target.value})} style={{ padding:"8px 10px",borderRadius:8,border:"1px solid #e5e7eb",fontSize:13 }}>
              <option value="fixed">🏠 ຄົງທີ່</option><option value="variable">📦 ແປຜັນ</option>
            </select>
            <select value={form.category} onChange={e=>setForm({...form,category:e.target.value})} style={{ padding:"8px 10px",borderRadius:8,border:"1px solid #e5e7eb",fontSize:12 }}>
              {EXPENSE_CATS[form.type].map(c=><option key={c.id} value={c.id}>{c.label}</option>)}
            </select>
          </div>
          {[["ຊື່ (EN)","name","text"],["ຊື່ (ລາວ)","nameLao","text"],["ຈຳນວນ (₭)","amount","number"]].map(([l,k,t])=>(
            <div key={k} style={{ marginBottom:10 }}>
              <div style={{ fontSize:12,color:"#6b7280",marginBottom:4 }}>{l}</div>
              <input type={t} value={form[k]} onChange={e=>setForm({...form,[k]:e.target.value})} style={inpStyle} />
            </div>
          ))}
          <div style={{ marginBottom:12 }}>
            <div style={{ fontSize:12,color:"#6b7280",marginBottom:4 }}>ເດືອນ</div>
            <input type="month" value={form.month} onChange={e=>setForm({...form,month:e.target.value})} style={inpStyle} />
          </div>
          <button onClick={saveExp} style={{ width:"100%",padding:10,background:"#1a1a2e",color:"#f4d03f",border:"none",borderRadius:8,fontWeight:700,cursor:"pointer" }}>ບັນທຶກ</button>
        </div>
        <div style={{ background:"#fff",borderRadius:12,padding:16,border:"1px solid #e5e7eb" }}>
          <div style={{ fontSize:14,fontWeight:600,marginBottom:14 }}>📊 ໝວດໝູ່</div>
          {sortedCats.length===0?<div style={{ color:"#9ca3af",textAlign:"center",padding:20,fontSize:13 }}>ຍັງບໍ່ມີ</div>:
            <div style={{ maxHeight:340,overflowY:"auto" }}>
              {sortedCats.map(c=>{
                const pct=totalExpAll>0?(c.total/totalExpAll*100):0;
                const isCogs=COGS_IDS.includes(c.id);
                return(
                  <div key={c.id} style={{ marginBottom:12 }}>
                    <div style={{ display:"flex",justifyContent:"space-between",marginBottom:3 }}>
                      <span style={{ fontSize:12,fontWeight:600 }}>{c.label}{isCogs&&<span style={{ marginLeft:4,fontSize:9,background:"#fef3c7",color:"#d97706",padding:"1px 4px",borderRadius:3 }}>COGS</span>}</span>
                      <span style={{ fontSize:12,fontWeight:700,color:"#dc2626" }}>{formatKip(c.total)}</span>
                    </div>
                    <div style={{ height:5,background:"#f3f4f6",borderRadius:3,overflow:"hidden",marginBottom:3 }}>
                      <div style={{ height:"100%",width:`${pct}%`,background:c.type==="fixed"?"#7c3aed":isCogs?"#d97706":"#ea580c" }} />
                    </div>
                    <div style={{ fontSize:10,color:"#6b7280" }}>{pct.toFixed(1)}% · {c.items.length} ລາຍ</div>
                  </div>
                );
              })}
            </div>
          }
        </div>
      </div>
      <div style={{ background:"#fff",borderRadius:12,padding:16,border:"1px solid #e5e7eb" }}>
        <div style={{ fontSize:14,fontWeight:600,marginBottom:12 }}>📋 ລາຍຈ່າຍທັງໝົດ</div>
        <div style={{ maxHeight:300,overflowY:"auto" }}>
          {monthExp.length===0?<div style={{ color:"#9ca3af",textAlign:"center",padding:20,fontSize:13 }}>ຍັງບໍ່ມີ</div>:monthExp.map(e=>{
            const cat=allCats.find(c=>c.id===e.category);
            return(
              <div key={e.id} style={{ display:"flex",alignItems:"center",gap:8,padding:"8px 0",borderBottom:"1px solid #f3f4f6" }}>
                <span style={{ fontSize:10,padding:"2px 6px",borderRadius:4,background:e.type==="fixed"?"#ede9fe":"#fef3c7",color:e.type==="fixed"?"#7c3aed":"#d97706" }}>{e.type==="fixed"?"ຄົງ":"ແປ"}</span>
                <span style={{ fontSize:11,color:"#6b7280",minWidth:80 }}>{cat?.label}</span>
                <div style={{ flex:1 }}><div style={{ fontSize:13,fontWeight:600 }}>{e.name}</div>{e.nameLao&&<div style={{ fontSize:11,color:"#6b7280" }}>{e.nameLao}</div>}</div>
                <span style={{ fontSize:13,fontWeight:700,color:"#dc2626" }}>{formatKip(e.amount)}</span>
                <button onClick={()=>delExp(e.id)} style={{ padding:"4px 8px",background:"#fee2e2",color:"#dc2626",border:"none",borderRadius:6,cursor:"pointer",fontSize:11 }}>✕</button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ============================================================
// SALES HISTORY
// ============================================================
function SalesHistoryView({ sales, setSales, shopInfo }) {
  const [search,setSearch]=useState("");
  const [dateFrom,setDateFrom]=useState("");
  const [dateTo,setDateTo]=useState("");
  const [voidTarget,setVoidTarget]=useState(null);
  const voidOrder=(order,reason)=>{
    const voidedOrder={...order,voided:true,voidReason:reason,voidedAt:new Date().toISOString()};
    const updated=sales.map(s=>s.id===order.id?voidedOrder:s);
    setSales(updated); stor.set("sales",updated); syncOrder(voidedOrder); setVoidTarget(null);
  };

  const filtered=sales.filter(s=>{
    // Text search: bill ID or item name
    const matchesSearch=search===""||s.id.includes(search)||s.items.some(i=>i.name.toLowerCase().includes(search.toLowerCase()));
    if(!matchesSearch)return false;

    // Date range filter
    if(dateFrom||dateTo){
      const sDate=new Date(s.date).toISOString().slice(0,10);
      if(dateFrom&&sDate<dateFrom)return false;
      if(dateTo&&sDate>dateTo)return false;
    }
    return true;
  }).slice().reverse().slice(0,150);

  return (
    <div style={{ padding:"20px 24px",fontFamily:"'Noto Sans Lao',sans-serif",background:"#f0ece4",minHeight:"100vh" }}>
      <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16 }}>
        <div><h1 style={{ margin:0,fontSize:22,fontWeight:700 }}>🧾 ປະຫວັດການຂາຍ</h1><div style={{ fontSize:13,color:"#6b7280" }}>{sales.length} ໃບ</div></div>
      </div>

      {/* Search & Date Filters */}
      <div style={{ display:"flex",gap:8,alignItems:"center",marginBottom:20,flexWrap:"wrap" }}>
        <input placeholder="ຄົ້ນຫາບິນ/ສິນຄ້າ..." value={search} onChange={e=>setSearch(e.target.value)} style={{ padding:"8px 14px",borderRadius:20,border:"1px solid #e5e7eb",fontSize:13,flex:1,minWidth:200 }} />
        <div style={{ display:"flex",gap:6,alignItems:"center",flexWrap:"wrap" }}>
          <label style={{ fontSize:12,color:"#6b7280",whiteSpace:"nowrap" }}>ວັນທີ່ເລີ່ມ:</label>
          <input type="date" value={dateFrom} onChange={e=>setDateFrom(e.target.value)} style={{ padding:"6px 10px",borderRadius:8,border:"1px solid #e5e7eb",fontSize:12 }} />
          <label style={{ fontSize:12,color:"#6b7280",whiteSpace:"nowrap" }}>ວັນທີ່ສິ້ນ:</label>
          <input type="date" value={dateTo} onChange={e=>setDateTo(e.target.value)} style={{ padding:"6px 10px",borderRadius:8,border:"1px solid #e5e7eb",fontSize:12 }} />
          {(dateFrom||dateTo)&&<button onClick={()=>{setDateFrom("");setDateTo("");}} style={{ padding:"6px 10px",borderRadius:8,border:"1px solid #e5e7eb",background:"#fee2e2",color:"#dc2626",cursor:"pointer",fontSize:11,fontWeight:600 }}>ລຶບກັ່ນ</button>}
        </div>
      </div>
      <div style={{ background:"#fff",borderRadius:12,border:"1px solid #e5e7eb",overflow:"hidden" }}>
        {filtered.length===0?<div style={{ padding:40,textAlign:"center",color:"#9ca3af" }}>ຍັງບໍ່ມີ</div>:filtered.map((s,i)=>{
          const net=s.items.reduce((a,it)=>a+itemPrice(it)*it.qty,0)-(s.discount||0);
          const isFOC=s.payment==="foc"; const isVoid=s.voided;
          return(
            <div key={s.id} style={{ display:"flex",alignItems:"center",gap:10,padding:"10px 14px",borderBottom:i<filtered.length-1?"1px solid #f3f4f6":"none",opacity:isVoid?0.5:1,background:isVoid?"#fff5f5":isFOC?"#f0fdf4":"#fff" }}>
              <div style={{ width:34,height:34,borderRadius:"50%",display:"flex",alignItems:"center",justifyContent:"center",background:isVoid?"#fee2e2":isFOC?"#dcfce7":s.payment==="cash"?"#dcfce7":s.payment==="qr"?"#ede9fe":"#dbeafe",fontSize:16 }}>
                {isVoid?"🚫":isFOC?"🎁":s.payment==="cash"?"💵":s.payment==="qr"?"📲":"🏦"}
              </div>
              <div style={{ flex:1,minWidth:0 }}>
                <div style={{ fontSize:13,fontWeight:600 }}>
                  #{s.id.toUpperCase()}
                  {isVoid&&<span style={{ marginLeft:6,fontSize:10,background:"#fee2e2",color:"#dc2626",padding:"1px 5px",borderRadius:3 }}>VOID</span>}
                  {isFOC&&<span style={{ marginLeft:6,fontSize:10,background:"#dcfce7",color:"#16a34a",padding:"1px 5px",borderRadius:3 }}>FOC</span>}
                </div>
                <div style={{ fontSize:11,color:"#6b7280" }}>{fmtDT(s.date)} · {s.cashier||"—"}</div>
                <div style={{ fontSize:11,color:"#9ca3af",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap" }}>
                  {s.items.map(it=>`${it.emoji}${it.name}×${it.qty}${(it.addons||[]).length>0?` (+${it.addons.length})`:""}`).join(" · ")}
                </div>
                {(s.note||s.voidReason)&&<div style={{ fontSize:11,color:"#6b7280" }}>📝 {s.voidReason||s.note}</div>}
              </div>
              <div style={{ textAlign:"right",flexShrink:0 }}>
                <div style={{ fontSize:14,fontWeight:700,color:isVoid?"#9ca3af":isFOC?"#16a34a":"#7c3aed" }}>{isVoid?"—":isFOC?"FOC":formatKip(net)}</div>
                <div style={{ fontSize:11,color:"#6b7280" }}>{s.payment==="cash"?"ສົດ":s.payment==="qr"?"QR":s.payment==="transfer"?"ໂອນ":"FOC"}</div>
              </div>
              <div style={{ display:"flex",gap:4 }}>
                <button onClick={()=>printReceipt(s,shopInfo)} title="ພິມ" style={{ padding:"5px 8px",background:"#1a1a2e",color:"#f4d03f",border:"none",borderRadius:6,cursor:"pointer",fontSize:11 }}>🖨️</button>
                {!isVoid&&<button onClick={()=>setVoidTarget(s)} title="ຍົກເລີກ" style={{ padding:"5px 8px",background:"#fee2e2",color:"#dc2626",border:"none",borderRadius:6,cursor:"pointer",fontSize:11 }}>⚠️</button>}
              </div>
            </div>
          );
        })}
      </div>
      {voidTarget&&<VoidModal order={voidTarget} shopInfo={shopInfo} onVoid={(r)=>voidOrder(voidTarget,r)} onClose={()=>setVoidTarget(null)} />}
    </div>
  );
}

// ============================================================
// ADMIN with Add-ons management
// ============================================================
function AdminView({ menu, setMenu, categories, setCategories, addons, setAddons, qrImage, setQrImage, shopInfo, setShopInfo, role, onResetTestData, onPushAll }) {
  const [tab,setTab]=useState("menu");
  const [editItem,setEditItem]=useState(null);
  const [filterCat,setFilterCat]=useState("all");
  const [form,setForm]=useState({name:"",nameLao:"",price:"",cat:categories[0]?.id||"bakery",emoji:"🍞",popular:false,image:""});
  const [showAdd,setShowAdd]=useState(false);
  const [editCat,setEditCat]=useState(null);
  const [showAddCat,setShowAddCat]=useState(false);
  const [catForm,setCatForm]=useState({id:"",label:"",labelEn:""});
  const [editAddon,setEditAddon]=useState(null);
  const [showAddAddon,setShowAddAddon]=useState(false);
  const [addonForm,setAddonForm]=useState({name:"",nameLao:"",price:"",group:"milk"});
  const [shopForm,setShopForm]=useState(shopInfo);
  const [printerCfg,setPrinterCfg]=useState(()=>stor.get("printerConfig",PRINTER_DEFAULT));
  const fileRef=useRef(null); const editFileRef=useRef(null); const qrRef=useRef(null); const logoRef=useRef(null);

  const savePrinter=(patch)=>{ const next={...stor.get("printerConfig",PRINTER_DEFAULT),...patch}; setPrinterCfg(next); stor.set("printerConfig",next); };
  const testPrint=()=>{
    printReceipt({
      id:"test01", date:new Date().toISOString(), cashier:ROLES[role]?.label||"—",
      payment:"cash", received:50000, discount:0, total:30000,
      items:[{emoji:"🥐",name:"Croissant",nameLao:"ຄວາຊ໊ອງ",price:15000,qty:2,addons:[]}],
    }, shopInfo);
  };

  const handleImg=(e,target)=>{
    const f=e.target.files?.[0]; if(!f)return;
    if(f.size>1024*1024){alert("ໃຫຍ່ເກີນ 1MB");return;}
    const r=new FileReader();
    r.onload=(ev)=>{ if(target==="form")setForm(x=>({...x,image:ev.target.result})); else if(target==="edit")setEditItem(x=>({...x,image:ev.target.result})); else if(target==="logo")setShopForm(x=>({...x,logo:ev.target.result})); else{setQrImage(ev.target.result);stor.set("qrImage",ev.target.result);} };
    r.readAsDataURL(f);
  };

  const saveNew=()=>{ if(!form.name||!form.price)return; const u=[...menu,{id:Date.now(),...form,price:Number(form.price)}]; setMenu(u);stor.set("menu",u);setShowAdd(false); setForm({name:"",nameLao:"",price:"",cat:categories[0]?.id,emoji:"🍞",popular:false,image:""}); };
  const saveEdit=()=>{ const u=menu.map(m=>m.id===editItem.id?{...editItem,price:Number(editItem.price)}:m); setMenu(u);stor.set("menu",u);setEditItem(null); };
  const delItem=(id)=>{ if(!window.confirm("ລຶບ?"))return; const u=menu.filter(m=>m.id!==id); setMenu(u);stor.set("menu",u); };

  const saveCat=()=>{
    const id=catForm.id||catForm.labelEn.toLowerCase().replace(/[^a-z0-9]/g,"_").slice(0,20);
    if(!catForm.label||!catForm.labelEn)return;
    if(!editCat&&categories.find(c=>c.id===id)){alert("ID ຊ້ຳ");return;}
    const u=editCat ? categories.map(c=>c.id===editCat.id?{id:editCat.id,label:catForm.label,labelEn:catForm.labelEn}:c) : [...categories,{id,label:catForm.label,labelEn:catForm.labelEn}];
    setCategories(u);stor.set("categories",u);setShowAddCat(false);setEditCat(null);setCatForm({id:"",label:"",labelEn:""});
  };
  const startEditCat=(c)=>{setEditCat(c);setCatForm({id:c.id,label:c.label,labelEn:c.labelEn});setShowAddCat(true);};
  const delCat=(id)=>{ const cnt=menu.filter(m=>m.cat===id).length; if(cnt>0){alert(`ມີ ${cnt} ເມນູ`);return;} if(!window.confirm("ລຶບ?"))return; const u=categories.filter(c=>c.id!==id); setCategories(u);stor.set("categories",u); };

  const saveAddon=()=>{
    if(!addonForm.name||!addonForm.price)return;
    const id=editAddon?.id || addonForm.name.toLowerCase().replace(/[^a-z0-9]/g,"_").slice(0,20)+"_"+Date.now().toString(36);
    const newAddon={id,...addonForm,price:Number(addonForm.price)};
    const u=editAddon ? addons.map(a=>a.id===editAddon.id?newAddon:a) : [...addons,newAddon];
    setAddons(u);stor.set("addons",u);setShowAddAddon(false);setEditAddon(null);
    setAddonForm({name:"",nameLao:"",price:"",group:"milk"});
  };
  const startEditAddon=(a)=>{setEditAddon(a);setAddonForm({name:a.name,nameLao:a.nameLao,price:a.price,group:a.group});setShowAddAddon(true);};
  const delAddon=(id)=>{ if(!window.confirm("ລຶບ?"))return; const u=addons.filter(a=>a.id!==id); setAddons(u);stor.set("addons",u); };

  const saveShop=()=>{setShopInfo(shopForm);stor.set("shopInfo",shopForm);alert("ບັນທຶກສຳເລັດ ✓");};

  const filtered=filterCat==="all"?menu:menu.filter(m=>m.cat===filterCat);
  const inpStyle={width:"100%",padding:"8px 10px",borderRadius:8,border:"1px solid #e5e7eb",fontSize:14,boxSizing:"border-box"};

  return (
    <div style={{ padding:"20px 24px",fontFamily:"'Noto Sans Lao',sans-serif",background:"#f0ece4",minHeight:"100vh" }}>
      <h1 style={{ margin:"0 0 4px",fontSize:22,fontWeight:700 }}>⚙️ ຈັດການລະບົບ</h1>
      <div style={{ fontSize:13,color:"#6b7280",marginBottom:16 }}>Admin Settings</div>
      <div style={{ display:"flex",gap:4,marginBottom:16,background:"#fff",padding:4,borderRadius:10,width:"fit-content",flexWrap:"wrap" }}>
        {[["menu","🍞 ເມນູ"],["categories","📂 ໝວດ"],["addons","✨ Add-ons"],["settings","🏪 ຮ້ານ"],["qr","📲 QR"],["printer","🖨️ ເຄື່ອງພິມ"]].map(([v,l])=>(
          <button key={v} onClick={()=>setTab(v)} style={{ padding:"8px 14px",borderRadius:8,border:"none",cursor:"pointer",background:tab===v?"#1a1a2e":"transparent",color:tab===v?"#f4d03f":"#374151",fontWeight:tab===v?700:500,fontSize:13 }}>{l}</button>
        ))}
      </div>

      {tab==="menu"&&(
        <>
          <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12,gap:8,flexWrap:"wrap" }}>
            <div style={{ fontSize:13,color:"#6b7280" }}>{menu.length} ລາຍການ</div>
            <div style={{ display:"flex",gap:8 }}>
              <button onClick={()=>{ if(onPushAll && window.confirm("ສົ່ງເມນູ, ໝວດ, Add-ons ແລະ ຂໍ້ມູນຮ້ານ ປັດຈຸບັນ ໄປໃຫ້ທຸກອຸປະກອນ?\n\nPush current menu, categories, add-ons & shop info to ALL devices?")){ onPushAll(); alert("✅ ສົ່ງຂຶ້ນ Cloud ແລ້ວ.\nອຸປະກອນອື່ນຈະອັບເດດພາຍໃນ ~10 ວິນາທີ.\nPushed — other devices update within ~10s."); } }} style={{ padding:"10px 16px",background:"#1a1a2e",color:"#f4d03f",border:"none",borderRadius:8,fontWeight:700,cursor:"pointer" }} title="ສົ່ງເມນູໄປໃຫ້ທຸກອຸປະກອນ">📤 ສົ່ງໄປທຸກເຄື່ອງ</button>
              <button onClick={()=>setShowAdd(!showAdd)} style={{ padding:"10px 18px",background:"#f4d03f",color:"#1a1a2e",border:"none",borderRadius:8,fontWeight:700,cursor:"pointer" }}>+ ເພີ່ມ</button>
            </div>
          </div>
          {showAdd&&(
            <div style={{ background:"#fff",borderRadius:12,padding:18,border:"1px solid #e5e7eb",marginBottom:14 }}>
              <div style={{ display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(170px,1fr))",gap:10 }}>
                {[["ຊື່ (EN)","name","text"],["ຊື່ (ລາວ)","nameLao","text"],["ລາຄາ (₭)","price","number"],["Emoji","emoji","text"]].map(([l,k,t])=>(
                  <div key={k}><div style={{ fontSize:12,color:"#6b7280",marginBottom:3 }}>{l}</div><input type={t} value={form[k]} onChange={e=>setForm({...form,[k]:e.target.value})} style={inpStyle} /></div>
                ))}
                <div><div style={{ fontSize:12,color:"#6b7280",marginBottom:3 }}>ໝວດໝູ່</div>
                  <select value={form.cat} onChange={e=>setForm({...form,cat:e.target.value})} style={inpStyle}>{categories.map(c=><option key={c.id} value={c.id}>{c.label}</option>)}</select>
                </div>
                <div>
                  <div style={{ fontSize:12,color:"#6b7280",marginBottom:3 }}>ຮູບ</div>
                  <input ref={fileRef} type="file" accept="image/*" onChange={e=>handleImg(e,"form")} style={{ display:"none" }} />
                  <button onClick={()=>fileRef.current?.click()} style={{ ...inpStyle,background:"#f9f9f9",border:"1px dashed #d1d5db",cursor:"pointer",textAlign:"center" }}>📷 {form.image?"ປ່ຽນ":"ອັບໂຫຼດ"}</button>
                </div>
                <div style={{ display:"flex",alignItems:"center",gap:8,paddingTop:20 }}>
                  {form.image&&<img src={form.image} alt="" style={{ width:44,height:44,borderRadius:8,objectFit:"cover" }} />}
                  <label style={{ display:"flex",alignItems:"center",gap:6,cursor:"pointer",fontSize:13 }}>
                    <input type="checkbox" checked={form.popular} onChange={e=>setForm({...form,popular:e.target.checked})} />🔥 ຂາຍດີ
                  </label>
                </div>
              </div>
              <div style={{ display:"flex",gap:8,marginTop:12 }}>
                <button onClick={saveNew} style={{ padding:"10px 18px",background:"#16a34a",color:"#fff",border:"none",borderRadius:8,fontWeight:700,cursor:"pointer" }}>ບັນທຶກ</button>
                <button onClick={()=>setShowAdd(false)} style={{ padding:"10px 18px",background:"#f3f4f6",border:"none",borderRadius:8,cursor:"pointer" }}>ຍົກເລີກ</button>
              </div>
            </div>
          )}
          <div style={{ display:"flex",gap:6,marginBottom:12,flexWrap:"wrap" }}>
            <button onClick={()=>setFilterCat("all")} style={{ padding:"6px 12px",borderRadius:20,border:"none",cursor:"pointer",background:filterCat==="all"?"#1a1a2e":"#fff",color:filterCat==="all"?"#f4d03f":"#374151",fontSize:13 }}>ທັງໝົດ ({menu.length})</button>
            {categories.map(c=>(
              <button key={c.id} onClick={()=>setFilterCat(c.id)} style={{ padding:"6px 12px",borderRadius:20,border:"none",cursor:"pointer",background:filterCat===c.id?"#1a1a2e":"#fff",color:filterCat===c.id?"#f4d03f":"#374151",fontSize:13 }}>{c.label} ({menu.filter(m=>m.cat===c.id).length})</button>
            ))}
          </div>
          <div style={{ background:"#fff",borderRadius:12,border:"1px solid #e5e7eb",overflow:"hidden" }}>
            {filtered.map((item,idx)=>(
              editItem?.id===item.id?(
                <div key={item.id} style={{ padding:"12px 14px",background:"#f0f9ff",borderBottom:"1px solid #e5e7eb" }}>
                  <div style={{ display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(130px,1fr))",gap:8 }}>
                    {[["name","text"],["nameLao","text"],["price","number"],["emoji","text"]].map(([k,t])=>(
                      <input key={k} type={t} value={editItem[k]} onChange={e=>setEditItem({...editItem,[k]:e.target.value})} style={{ padding:"6px 8px",borderRadius:6,border:"1px solid #bfdbfe",fontSize:13 }} />
                    ))}
                    <select value={editItem.cat} onChange={e=>setEditItem({...editItem,cat:e.target.value})} style={{ padding:"6px 8px",borderRadius:6,border:"1px solid #bfdbfe",fontSize:13 }}>
                      {categories.map(c=><option key={c.id} value={c.id}>{c.label}</option>)}
                    </select>
                    <input ref={editFileRef} type="file" accept="image/*" onChange={e=>handleImg(e,"edit")} style={{ display:"none" }} />
                    <button onClick={()=>editFileRef.current?.click()} style={{ padding:"6px 8px",background:"#fff",border:"1px solid #bfdbfe",borderRadius:6,cursor:"pointer",fontSize:12 }}>📷 {editItem.image?"ປ່ຽນ":"ເພີ່ມ"}</button>
                    <label style={{ display:"flex",alignItems:"center",gap:6,fontSize:12,cursor:"pointer" }}>
                      <input type="checkbox" checked={editItem.popular} onChange={e=>setEditItem({...editItem,popular:e.target.checked})} />🔥
                    </label>
                  </div>
                  {editItem.image&&<div style={{ marginTop:8,display:"flex",alignItems:"center",gap:8 }}><img src={editItem.image} alt="" style={{ width:56,height:56,borderRadius:8,objectFit:"cover" }} /><button onClick={()=>setEditItem({...editItem,image:""})} style={{ padding:"4px 8px",background:"#fee2e2",color:"#dc2626",border:"none",borderRadius:6,cursor:"pointer",fontSize:11 }}>ລຶບຮູບ</button></div>}
                  <div style={{ display:"flex",gap:8,marginTop:8 }}>
                    <button onClick={saveEdit} style={{ padding:"6px 14px",background:"#16a34a",color:"#fff",border:"none",borderRadius:6,cursor:"pointer",fontSize:13,fontWeight:600 }}>ບັນທຶກ</button>
                    <button onClick={()=>setEditItem(null)} style={{ padding:"6px 14px",background:"#f3f4f6",border:"none",borderRadius:6,cursor:"pointer",fontSize:13 }}>ຍົກເລີກ</button>
                  </div>
                </div>
              ):(
                <div key={item.id} style={{ display:"flex",alignItems:"center",gap:10,padding:"9px 14px",borderBottom:idx<filtered.length-1?"1px solid #f3f4f6":"none" }}>
                  {item.image?<img src={item.image} alt={item.name} style={{ width:38,height:38,borderRadius:7,objectFit:"cover" }} />:<span style={{ fontSize:20,width:38,textAlign:"center" }}>{item.emoji}</span>}
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:13,fontWeight:600 }}>{item.name}{item.popular&&<span style={{ marginLeft:5,fontSize:9,background:"#fef3c7",color:"#d97706",padding:"1px 5px",borderRadius:3 }}>🔥</span>}{ADDON_CATEGORIES.includes(item.cat)&&<span style={{ marginLeft:4,fontSize:9,background:"#ede9fe",color:"#7c3aed",padding:"1px 5px",borderRadius:3 }}>✨</span>}</div>
                    <div style={{ fontSize:11,color:"#6b7280" }}>{item.nameLao}</div>
                  </div>
                  <span style={{ fontSize:11,color:"#6b7280",background:"#f3f4f6",padding:"2px 7px",borderRadius:4 }}>{categories.find(c=>c.id===item.cat)?.labelEn||item.cat}</span>
                  <span style={{ fontSize:13,fontWeight:700,color:"#7c3aed",minWidth:85,textAlign:"right" }}>{formatKip(item.price)}</span>
                  <button onClick={()=>setEditItem({...item})} style={{ padding:"5px 10px",background:"#ede9fe",color:"#7c3aed",border:"none",borderRadius:6,cursor:"pointer",fontSize:11,fontWeight:600 }}>✏️</button>
                  <button onClick={()=>delItem(item.id)} style={{ padding:"5px 10px",background:"#fee2e2",color:"#dc2626",border:"none",borderRadius:6,cursor:"pointer",fontSize:11 }}>🗑</button>
                </div>
              )
            ))}
          </div>
        </>
      )}

      {tab==="categories"&&(
        <>
          <div style={{ display:"flex",justifyContent:"space-between",marginBottom:12 }}>
            <div style={{ fontSize:13,color:"#6b7280" }}>{categories.length} ໝວດໝູ່</div>
            <button onClick={()=>{setEditCat(null);setCatForm({id:"",label:"",labelEn:""});setShowAddCat(!showAddCat);}} style={{ padding:"10px 18px",background:"#f4d03f",color:"#1a1a2e",border:"none",borderRadius:8,fontWeight:700,cursor:"pointer" }}>+ ເພີ່ມ</button>
          </div>
          {showAddCat&&(
            <div style={{ background:"#fff",borderRadius:12,padding:18,border:"1px solid #e5e7eb",marginBottom:14 }}>
              <div style={{ fontWeight:600,marginBottom:12,fontSize:14 }}>{editCat?"✏️ ແກ້ໄຂ":"+ ໃໝ່"}</div>
              <div style={{ display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(170px,1fr))",gap:10 }}>
                <div><div style={{ fontSize:12,color:"#6b7280",marginBottom:3 }}>ຊື່ (ລາວ + emoji)</div><input value={catForm.label} onChange={e=>setCatForm({...catForm,label:e.target.value})} placeholder="🍦 ໄອສຄຣີມ" style={inpStyle} /></div>
                <div><div style={{ fontSize:12,color:"#6b7280",marginBottom:3 }}>ຊື່ (EN)</div><input value={catForm.labelEn} onChange={e=>setCatForm({...catForm,labelEn:e.target.value})} placeholder="Ice Cream" style={inpStyle} /></div>
                {!editCat&&<div><div style={{ fontSize:12,color:"#6b7280",marginBottom:3 }}>ID (auto)</div><input value={catForm.id} onChange={e=>setCatForm({...catForm,id:e.target.value})} placeholder="ice_cream" style={inpStyle} /></div>}
              </div>
              <div style={{ display:"flex",gap:8,marginTop:12 }}>
                <button onClick={saveCat} style={{ padding:"10px 18px",background:"#16a34a",color:"#fff",border:"none",borderRadius:8,fontWeight:700,cursor:"pointer" }}>ບັນທຶກ</button>
                <button onClick={()=>{setShowAddCat(false);setEditCat(null);}} style={{ padding:"10px 18px",background:"#f3f4f6",border:"none",borderRadius:8,cursor:"pointer" }}>ຍົກເລີກ</button>
              </div>
            </div>
          )}
          <div style={{ background:"#fff",borderRadius:12,border:"1px solid #e5e7eb",overflow:"hidden" }}>
            {categories.map((c,i)=>(
              <div key={c.id} style={{ display:"flex",alignItems:"center",gap:12,padding:"12px 16px",borderBottom:i<categories.length-1?"1px solid #f3f4f6":"none" }}>
                <span style={{ fontSize:22 }}>{c.label.split(" ")[0]}</span>
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:14,fontWeight:600 }}>{c.label}{ADDON_CATEGORIES.includes(c.id)&&<span style={{ marginLeft:6,fontSize:10,background:"#ede9fe",color:"#7c3aed",padding:"1px 6px",borderRadius:3 }}>✨ Add-ons</span>}</div>
                  <div style={{ fontSize:12,color:"#6b7280" }}>{c.labelEn} · <code style={{ fontSize:11 }}>{c.id}</code></div>
                </div>
                <span style={{ fontSize:12,color:"#6b7280",background:"#f3f4f6",padding:"2px 8px",borderRadius:4 }}>{menu.filter(m=>m.cat===c.id).length} ເມນູ</span>
                <button onClick={()=>startEditCat(c)} style={{ padding:"6px 10px",background:"#ede9fe",color:"#7c3aed",border:"none",borderRadius:6,cursor:"pointer",fontSize:11,fontWeight:600 }}>✏️</button>
                <button onClick={()=>delCat(c.id)} style={{ padding:"6px 10px",background:"#fee2e2",color:"#dc2626",border:"none",borderRadius:6,cursor:"pointer",fontSize:11 }}>🗑</button>
              </div>
            ))}
          </div>
        </>
      )}

      {tab==="addons"&&(
        <>
          <div style={{ background:"#ede9fe",border:"1px solid #c4b5fd",borderRadius:10,padding:12,marginBottom:14,fontSize:13,color:"#5b21b6" }}>
            ℹ️ Add-ons ຈະສະແດງເປັນ modal ໃຫ້ລູກຄ້າເລືອກ ເມື່ອກົດເມນູໃນໝວດເຄື່ອງດື່ມ: <b>ກາເຟ ☕</b>, <b>ມັດຊາ 🍵</b>, <b>ສະມູດທີ 🥤</b> ແລະ <b>ເຄື່ອງດື່ມ 🧃</b>
          </div>
          <div style={{ display:"flex",justifyContent:"space-between",marginBottom:12 }}>
            <div style={{ fontSize:13,color:"#6b7280" }}>{addons.length} Add-ons</div>
            <button onClick={()=>{setEditAddon(null);setAddonForm({name:"",nameLao:"",price:"",group:"milk"});setShowAddAddon(!showAddAddon);}} style={{ padding:"10px 18px",background:"#f4d03f",color:"#1a1a2e",border:"none",borderRadius:8,fontWeight:700,cursor:"pointer" }}>+ ເພີ່ມ</button>
          </div>
          {showAddAddon&&(
            <div style={{ background:"#fff",borderRadius:12,padding:18,border:"1px solid #e5e7eb",marginBottom:14 }}>
              <div style={{ fontWeight:600,marginBottom:12,fontSize:14 }}>{editAddon?"✏️ ແກ້ໄຂ Add-on":"+ Add-on ໃໝ່"}</div>
              <div style={{ display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(170px,1fr))",gap:10 }}>
                <div><div style={{ fontSize:12,color:"#6b7280",marginBottom:3 }}>ຊື່ (EN)</div><input value={addonForm.name} onChange={e=>setAddonForm({...addonForm,name:e.target.value})} placeholder="Oat Milk" style={inpStyle} /></div>
                <div><div style={{ fontSize:12,color:"#6b7280",marginBottom:3 }}>ຊື່ (ລາວ)</div><input value={addonForm.nameLao} onChange={e=>setAddonForm({...addonForm,nameLao:e.target.value})} placeholder="ນົມໂອ໋ດ" style={inpStyle} /></div>
                <div><div style={{ fontSize:12,color:"#6b7280",marginBottom:3 }}>ລາຄາ (₭)</div><input type="number" value={addonForm.price} onChange={e=>setAddonForm({...addonForm,price:e.target.value})} style={inpStyle} /></div>
                <div><div style={{ fontSize:12,color:"#6b7280",marginBottom:3 }}>ກຸ່ມ</div>
                  <select value={addonForm.group} onChange={e=>setAddonForm({...addonForm,group:e.target.value})} style={inpStyle}>
                    {Object.entries(ADDON_GROUPS).map(([k,l])=><option key={k} value={k}>{l}</option>)}
                  </select>
                </div>
              </div>
              <div style={{ display:"flex",gap:8,marginTop:12 }}>
                <button onClick={saveAddon} style={{ padding:"10px 18px",background:"#16a34a",color:"#fff",border:"none",borderRadius:8,fontWeight:700,cursor:"pointer" }}>ບັນທຶກ</button>
                <button onClick={()=>{setShowAddAddon(false);setEditAddon(null);}} style={{ padding:"10px 18px",background:"#f3f4f6",border:"none",borderRadius:8,cursor:"pointer" }}>ຍົກເລີກ</button>
              </div>
            </div>
          )}
          {Object.entries(ADDON_GROUPS).map(([groupId,groupLabel])=>{
            const groupAddons=addons.filter(a=>a.group===groupId);
            if(groupAddons.length===0)return null;
            return(
              <div key={groupId} style={{ marginBottom:14 }}>
                <div style={{ fontSize:13,fontWeight:700,marginBottom:6,color:"#1a1a2e" }}>{groupLabel}</div>
                <div style={{ background:"#fff",borderRadius:12,border:"1px solid #e5e7eb",overflow:"hidden" }}>
                  {groupAddons.map((a,i)=>(
                    <div key={a.id} style={{ display:"flex",alignItems:"center",gap:10,padding:"10px 14px",borderBottom:i<groupAddons.length-1?"1px solid #f3f4f6":"none" }}>
                      <div style={{ flex:1 }}>
                        <div style={{ fontSize:13,fontWeight:600 }}>{a.name}</div>
                        <div style={{ fontSize:11,color:"#6b7280" }}>{a.nameLao}</div>
                      </div>
                      <span style={{ fontSize:13,fontWeight:700,color:"#7c3aed" }}>+{formatKip(a.price)}</span>
                      <button onClick={()=>startEditAddon(a)} style={{ padding:"5px 10px",background:"#ede9fe",color:"#7c3aed",border:"none",borderRadius:6,cursor:"pointer",fontSize:11,fontWeight:600 }}>✏️</button>
                      <button onClick={()=>delAddon(a.id)} style={{ padding:"5px 10px",background:"#fee2e2",color:"#dc2626",border:"none",borderRadius:6,cursor:"pointer",fontSize:11 }}>🗑</button>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
          {addons.length===0&&<div style={{ background:"#fff",borderRadius:12,padding:40,textAlign:"center",color:"#9ca3af" }}>ຍັງບໍ່ມີ Add-ons</div>}
        </>
      )}

      {tab==="settings"&&(
        <div style={{ background:"#fff",borderRadius:12,padding:20,border:"1px solid #e5e7eb" }}>
          <div style={{ fontSize:15,fontWeight:700,marginBottom:16 }}>🏪 ຂໍ້ມູນຮ້ານ (ໃບບິນ)</div>
          <div style={{ display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(260px,1fr))",gap:12 }}>
            {[["ຊື່ຮ້ານ (EN)","name"],["ຊື່ຮ້ານ (ລາວ)","nameLao"],["ທີ່ຢູ່ (EN)","addressEn"],["ທີ່ຢູ່ (ລາວ)","address"],["ເມືອງ","city"],["ເບີໂທ","phone"],["ຂໍ້ຄວາມທ້າຍໃບ","footer"]].map(([l,k])=>(
              <div key={k}><div style={{ fontSize:12,color:"#6b7280",marginBottom:4 }}>{l}</div><input value={shopForm[k]||""} onChange={e=>setShopForm({...shopForm,[k]:e.target.value})} style={inpStyle} /></div>
            ))}
          </div>
          <div style={{ borderTop:"1px solid #e5e7eb",marginTop:18,paddingTop:16 }}>
            <div style={{ fontSize:14,fontWeight:600,marginBottom:4 }}>🖼️ ໂລໂກ້ຮ້ານ / Shop Logo</div>
            <div style={{ fontSize:11,color:"#9ca3af",marginBottom:10 }}>ພິມຢູ່ຫົວໃບບິນ (ໂໝດ Dialog/ຮູບພາບເທົ່ານັ້ນ) · Prints at top of receipt (image/dialog mode only)</div>
            {shopForm.logo?(
              <div style={{ display:"flex",alignItems:"center",gap:16 }}>
                <img src={shopForm.logo} alt="logo" style={{ width:110,height:110,borderRadius:12,border:"1px solid #e5e7eb",objectFit:"contain",background:"#f9f6f0" }} />
                <div>
                  <div style={{ fontSize:13,color:"#16a34a",fontWeight:600,marginBottom:8 }}>✓ ຕັ້ງຄ່າແລ້ວ</div>
                  <button onClick={()=>logoRef.current?.click()} style={{ padding:"8px 14px",background:"#1a1a2e",color:"#f4d03f",border:"none",borderRadius:8,fontWeight:600,cursor:"pointer",marginRight:8,fontSize:12 }}>ປ່ຽນ</button>
                  <button onClick={()=>setShopForm(x=>({...x,logo:""}))} style={{ padding:"8px 14px",background:"#fee2e2",color:"#dc2626",border:"none",borderRadius:8,fontWeight:600,cursor:"pointer",fontSize:12 }}>ລຶບ</button>
                </div>
              </div>
            ):(
              <button onClick={()=>logoRef.current?.click()} style={{ padding:24,background:"#f9f6f0",border:"2px dashed #d1d5db",borderRadius:12,cursor:"pointer",width:"100%",textAlign:"center" }}>
                <div style={{ fontSize:32,marginBottom:6 }}>🖼️</div><div style={{ fontSize:14,fontWeight:600 }}>ອັບໂຫຼດ ໂລໂກ້ / Upload Logo</div>
              </button>
            )}
            <input ref={logoRef} type="file" accept="image/*" onChange={e=>handleImg(e,"logo")} style={{ display:"none" }} />
            <div style={{ fontSize:11,color:"#9ca3af",marginTop:8 }}>💡 ໃຊ້ຮູບຂາວດຳ ຊັດເຈນ ຈະພິມໄດ້ດີທີ່ສຸດ · Use a clear black &amp; white logo for best thermal print</div>
          </div>
          <button onClick={saveShop} style={{ marginTop:16,padding:"12px 24px",background:"#16a34a",color:"#fff",border:"none",borderRadius:10,fontWeight:700,cursor:"pointer" }}>💾 ບັນທຶກ</button>
        </div>
      )}

      {tab==="qr"&&(
        <div style={{ background:"#fff",borderRadius:12,padding:20,border:"1px solid #e5e7eb" }}>
          <div style={{ fontSize:15,fontWeight:700,marginBottom:14 }}>📲 QR Code</div>
          <div style={{ display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(200px,1fr))",gap:10,marginBottom:16 }}>
            {[["ທະນາຄານ","qrBank"],["ຊື່ບັນຊີ","qrAccount"],["ເລກບັນຊີ","qrNumber"]].map(([l,k])=>(
              <div key={k}><div style={{ fontSize:12,color:"#6b7280",marginBottom:4 }}>{l}</div><input value={shopForm[k]||""} onChange={e=>setShopForm({...shopForm,[k]:e.target.value})} style={inpStyle} /></div>
            ))}
          </div>
          <button onClick={saveShop} style={{ marginBottom:20,padding:"10px 20px",background:"#1a1a2e",color:"#f4d03f",border:"none",borderRadius:8,fontWeight:700,cursor:"pointer" }}>💾 ບັນທຶກ</button>
          <div style={{ borderTop:"1px solid #e5e7eb",paddingTop:16 }}>
            <div style={{ fontSize:14,fontWeight:600,marginBottom:10 }}>ຮູບ QR</div>
            {qrImage?(
              <div style={{ display:"flex",alignItems:"center",gap:16 }}>
                <img src={qrImage} alt="QR" style={{ width:160,height:160,borderRadius:12,border:"1px solid #e5e7eb",objectFit:"cover" }} />
                <div>
                  <div style={{ fontSize:13,color:"#16a34a",fontWeight:600,marginBottom:8 }}>✓ ຕັ້ງຄ່າແລ້ວ</div>
                  <button onClick={()=>qrRef.current?.click()} style={{ padding:"8px 14px",background:"#1a1a2e",color:"#f4d03f",border:"none",borderRadius:8,fontWeight:600,cursor:"pointer",marginRight:8,fontSize:12 }}>ປ່ຽນ</button>
                  <button onClick={()=>{setQrImage("");stor.set("qrImage","");}} style={{ padding:"8px 14px",background:"#fee2e2",color:"#dc2626",border:"none",borderRadius:8,fontWeight:600,cursor:"pointer",fontSize:12 }}>ລຶບ</button>
                </div>
              </div>
            ):(
              <button onClick={()=>qrRef.current?.click()} style={{ padding:30,background:"#f9f6f0",border:"2px dashed #d1d5db",borderRadius:12,cursor:"pointer",width:"100%",textAlign:"center" }}>
                <div style={{ fontSize:36,marginBottom:8 }}>📲</div><div style={{ fontSize:14,fontWeight:600 }}>ອັບໂຫຼດ QR</div>
              </button>
            )}
            <input ref={qrRef} type="file" accept="image/*" onChange={e=>handleImg(e,"qr")} style={{ display:"none" }} />
          </div>
          {role==="owner"&&(
            <>
              <div style={{ background:"#fff",borderRadius:14,padding:20,border:"2px solid #fecaca",marginTop:20 }}>
                <div style={{ fontSize:15,fontWeight:700,color:"#dc2626",marginBottom:6 }}>⚠️ Danger Zone — ລ້າງຂໍ້ມູນທົດສອບ</div>
                <div style={{ fontSize:12,color:"#6b7280",marginBottom:14,lineHeight:1.6 }}>
                  ລຶບລາຍການຂາຍ, ກະ, ແລະ ລາຍຈ່າຍທັງໝົດ (ທັງໃນເຄື່ອງ ແລະ ໃນ Cloud).<br/>
                  Menu, settings, QR ຈະຍັງຄົງຢູ່.<br/>
                  <span style={{ color:"#dc2626",fontWeight:600 }}>Wipes all sales / shifts / expenses (local + cloud). Menu &amp; settings stay.</span>
                </div>
                <button onClick={onResetTestData} style={{ padding:"10px 18px",background:"#dc2626",color:"#fff",border:"none",borderRadius:8,fontWeight:700,cursor:"pointer",fontSize:13 }}>
                  🗑️ Reset Test Data
                </button>
              </div>

              <div style={{ background:"#fff",borderRadius:14,padding:20,border:"2px solid #bfdbfe",marginTop:16 }}>
                <div style={{ fontSize:15,fontWeight:700,color:"#2563eb",marginBottom:6 }}>🔄 Force Refresh (PWA)</div>
                <div style={{ fontSize:12,color:"#6b7280",marginBottom:14,lineHeight:1.6 }}>
                  ລຶບ cache ທັງໝົດ ແລະ ໂຫລດຂໍ້ມູນໃໝ່ຈາກ server.<br/>
                  ບໍ່ຈຳເປັນ uninstall/reinstall app ອີກຕໍ່ໄປ.<br/>
                  <span style={{ color:"#2563eb",fontWeight:600 }}>Clears PWA cache &amp; service workers. No need to uninstall &amp; reinstall app.</span>
                </div>
                <button onClick={async()=>{
                  if(!window.confirm("Clear all PWA cache and refresh? You'll be back at the login screen."))return;
                  // IMPORTANT: actually WAIT for cache-clear + SW unregister to finish
                  // before reloading. The old code reloaded immediately (race), so the
                  // tablet often kept serving the stale build.
                  try{ if(window.caches){ const names=await caches.keys(); await Promise.all(names.map(n=>caches.delete(n))); } }catch(e){}
                  try{ if(navigator.serviceWorker){ const regs=await navigator.serviceWorker.getRegistrations(); await Promise.all(regs.map(r=>r.unregister())); } }catch(e){}
                  // Cache-bust the HTML so GitHub Pages serves the newest index.html.
                  window.location.replace(window.location.pathname+"?v="+Date.now());
                }} style={{ padding:"10px 18px",background:"#2563eb",color:"#fff",border:"none",borderRadius:8,fontWeight:700,cursor:"pointer",fontSize:13 }}>
                  🔄 Force Refresh
                </button>
                <div style={{ marginTop:14,paddingTop:12,borderTop:"1px solid #e5e7eb",fontSize:13,color:"#374151" }}>
                  ເວີຊັນ / Version: <span style={{ fontWeight:700,fontFamily:"monospace",color:"#111827" }}>{BUILD_VERSION}</span>
                  <div style={{ fontSize:11,color:"#9ca3af",marginTop:2 }}>ຫຼັງ Force Refresh ໃຫ້ເຊັກວ່າເລກນີ້ກົງກັນທຸກເຄື່ອງ · After refresh, this number should match on every device.</div>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {tab==="printer"&&(
        <div style={{ background:"#fff",borderRadius:12,padding:20,border:"1px solid #e5e7eb" }}>
          <div style={{ fontSize:15,fontWeight:700,marginBottom:4 }}>🖨️ ຕັ້ງຄ່າເຄື່ອງພິມ</div>
          <div style={{ fontSize:13,color:"#6b7280",marginBottom:18 }}>Printer Settings — Xprinter ຜ່ານ Bluetooth</div>

          {/* Paper width */}
          <div style={{ fontSize:13,fontWeight:600,marginBottom:8 }}>📏 ຄວາມກວ້າງເຈ້ຍ / Paper width</div>
          <div style={{ display:"flex",gap:10,marginBottom:20 }}>
            {[["58","58mm (ນ້ອຍ / small)"],["80","80mm (ມາດຕະຖານ / standard)"]].map(([v,l])=>(
              <button key={v} onClick={()=>savePrinter({paperWidth:v})} style={{ flex:1,padding:"12px 10px",borderRadius:10,cursor:"pointer",fontSize:13,fontWeight:600,border:printerCfg.paperWidth===v?"2px solid #7c3aed":"1px solid #e5e7eb",background:printerCfg.paperWidth===v?"#7c3aed":"#fff",color:printerCfg.paperWidth===v?"#fff":"#374151" }}>{printerCfg.paperWidth===v?"✓ ":""}{l}</button>
            ))}
          </div>

          {/* Print mode */}
          <div style={{ fontSize:13,fontWeight:600,marginBottom:8 }}>⚙️ ວິທີພິມ / Print method</div>
          <div style={{ display:"flex",flexDirection:"column",gap:8,marginBottom:20 }}>
            {[
              ["dialog","📄 Android Print (RawBT)","ແນະນຳ · ຮອງຮັບພາສາລາວ · ມີໜ້າຈໍເລືອກ — Recommended, supports Lao"],
              ["rawbt","⚡ RawBT ໂດຍກົງ / Direct","ໄວ ບໍ່ມີໜ້າຈໍ · ຕົວອັກສອນລາຕິນ/ໂຕເລກ — Instant, no dialog, Latin/numbers"],
            ].map(([v,title,desc])=>(
              <button key={v} onClick={()=>savePrinter({mode:v})} style={{ textAlign:"left",padding:"12px 14px",borderRadius:10,cursor:"pointer",border:printerCfg.mode===v?"2px solid #16a34a":"1px solid #e5e7eb",background:printerCfg.mode===v?"#f0fdf4":"#fff" }}>
                <div style={{ fontSize:13,fontWeight:700,color:printerCfg.mode===v?"#16a34a":"#374151" }}>{printerCfg.mode===v?"✓ ":""}{title}</div>
                <div style={{ fontSize:11,color:"#6b7280",marginTop:2 }}>{desc}</div>
              </button>
            ))}
          </div>

          {/* Test print */}
          <button onClick={testPrint} style={{ width:"100%",padding:14,background:"#1a1a2e",color:"#f4d03f",border:"none",borderRadius:10,fontWeight:700,cursor:"pointer",fontSize:14,marginBottom:20 }}>
            🧾 ທົດສອບພິມ / Test Print
          </button>

          {/* Setup guide */}
          <div style={{ background:"#eff6ff",border:"1px solid #bfdbfe",borderRadius:10,padding:14 }}>
            <div style={{ fontSize:13,fontWeight:700,color:"#1d4ed8",marginBottom:8 }}>📲 ການຕັ້ງຄ່າຄັ້ງທຳອິດ / One-time setup on the tablet</div>
            <ol style={{ margin:0,paddingLeft:18,fontSize:12,color:"#374151",lineHeight:1.9 }}>
              <li>ຕິດຕັ້ງແອັບ <b>RawBT</b> ຈາກ Google Play / Install <b>RawBT</b> from Google Play.</li>
              <li>ເປີດ Bluetooth ຂອງແທັບເລັດ ແລະ <b>ຈັບຄູ່ (pair)</b> ກັບ Xprinter / Pair the Xprinter in Android Bluetooth settings.</li>
              <li>ເປີດ RawBT → ເລືອກ Xprinter ເປັນເຄື່ອງພິມ / Open RawBT → select the Xprinter as its printer.</li>
              <li>ກັບມາທີ່ນີ້ ກົດ <b>ທົດສອບພິມ</b> / Come back here and tap <b>Test Print</b>.</li>
              <li>ຖ້າໃຊ້ "Android Print": ໃນໜ້າຈໍພິມ ເລືອກ <b>RawBT</b> ເປັນປາຍທາງ / In the print dialog pick <b>RawBT</b> as the destination.</li>
            </ol>
            <div style={{ fontSize:11,color:"#6b7280",marginTop:10,lineHeight:1.6 }}>
              ℹ️ ເບຣົາເຊີບໍ່ສາມາດຕໍ່ Bluetooth ໂດຍກົງ — RawBT ເປັນຕົວເຊື່ອມລະຫວ່າງແອັບ ກັບ Xprinter.<br/>
              A browser can't reach Bluetooth directly; RawBT bridges the app to your Xprinter.
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================
// SHIFT VIEW
// ============================================================
function ShiftView({ shifts, sales, currentShift, onOpen, onClose }) {
  const [expanded,setExpanded]=useState(null);
  const orderNet = (o) => o.items.reduce((s,i)=>s+itemPrice(i)*i.qty,0) - (o.discount||0);
  return (
    <div style={{ padding:"20px 24px",fontFamily:"'Noto Sans Lao',sans-serif",background:"#f0ece4",minHeight:"100vh" }}>
      <h1 style={{ margin:"0 0 4px",fontSize:22,fontWeight:700 }}>🌗 ກະ / Shift</h1>
      <div style={{ fontSize:13,color:"#6b7280",marginBottom:20 }}>ຄວບຄຸມ & ລາຍງານ</div>
      <div style={{ background:"#fff",borderRadius:12,padding:20,border:"1px solid #e5e7eb",marginBottom:20 }}>
        {currentShift?(
          <>
            <div style={{ display:"flex",alignItems:"center",gap:12,marginBottom:14 }}>
              <span style={{ fontSize:36 }}>🟢</span>
              <div><div style={{ fontSize:16,fontWeight:700,color:"#16a34a" }}>ກະກຳລັງເປີດ</div><div style={{ fontSize:13,color:"#6b7280" }}>{fmtDT(currentShift.openedAt)} · {currentShift.cashier}</div></div>
            </div>
            <div style={{ background:"#f9f6f0",padding:10,borderRadius:8,marginBottom:14,fontSize:13 }}>💵 ເງິນເລີ່ມ: <b>{formatKip(currentShift.openingCash)}</b></div>
            <button onClick={onClose} style={{ width:"100%",padding:14,background:"#1a1a2e",color:"#f4d03f",border:"none",borderRadius:10,fontWeight:700,fontSize:16,cursor:"pointer" }}>🔒 ປິດກະ</button>
          </>
        ):(
          <div style={{ textAlign:"center",padding:20 }}>
            <div style={{ fontSize:56,marginBottom:10 }}>🌅</div>
            <div style={{ fontSize:18,fontWeight:700,marginBottom:4 }}>ກະຍັງບໍ່ໄດ້ເປີດ</div>
            <button onClick={onOpen} style={{ padding:"14px 32px",background:"#16a34a",color:"#fff",border:"none",borderRadius:10,fontWeight:700,fontSize:16,cursor:"pointer",marginTop:14 }}>🌅 ເປີດກະ</button>
          </div>
        )}
      </div>
      <div style={{ fontSize:15,fontWeight:700,marginBottom:12 }}>ປະຫວັດກະ</div>
      {[...shifts].reverse().map(sh=>{
        const ss=sales.filter(s=>!s.voided&&s.payment!=="foc"&&s.shiftId===sh.id);
        const cashR=ss.filter(s=>s.payment==="cash").reduce((a,s)=>a+orderNet(s),0);
        const qrR=ss.filter(s=>s.payment==="qr").reduce((a,s)=>a+orderNet(s),0);
        const tfR=ss.filter(s=>s.payment==="transfer").reduce((a,s)=>a+orderNet(s),0);
        const total=cashR+qrR+tfR; const open=!sh.closedAt;
        return(
          <div key={sh.id} style={{ background:"#fff",borderRadius:12,border:"1px solid #e5e7eb",marginBottom:8,overflow:"hidden" }}>
            <div onClick={()=>setExpanded(expanded===sh.id?null:sh.id)} style={{ padding:"12px 16px",cursor:"pointer",display:"flex",alignItems:"center",gap:10 }}>
              <span style={{ fontSize:22 }}>{open?"🟢":"🔒"}</span>
              <div style={{ flex:1 }}>
                <div style={{ fontSize:14,fontWeight:700 }}>{fmtDate(sh.openedAt)} · {sh.cashier}{open&&<span style={{ marginLeft:8,fontSize:10,background:"#dcfce7",color:"#16a34a",padding:"2px 6px",borderRadius:3 }}>ເປີດ</span>}</div>
                <div style={{ fontSize:12,color:"#6b7280" }}>{fmtTime(sh.openedAt)}{sh.closedAt&&` → ${fmtTime(sh.closedAt)}`} · {ss.length} ໃບ</div>
              </div>
              <div style={{ textAlign:"right" }}><div style={{ fontSize:15,fontWeight:700,color:"#7c3aed" }}>{formatKip(total)}</div>{sh.variance!=null&&sh.variance!==0&&<div style={{ fontSize:11,color:sh.variance>0?"#16a34a":"#dc2626" }}>{sh.variance>0?"+":""}{formatKip(sh.variance)}</div>}</div>
              <span style={{ color:"#9ca3af" }}>{expanded===sh.id?"▲":"▼"}</span>
            </div>
            {expanded===sh.id&&(
              <div style={{ padding:"14px 16px",borderTop:"1px solid #f3f4f6",background:"#f9f6f0" }}>
                <div style={{ display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:8,marginBottom:10 }}>
                  {[["💵 ສົດ",cashR,"#16a34a"],["📲 QR",qrR,"#7c3aed"],["🏦 ໂອນ",tfR,"#2563eb"],["🧾",ss.length,"#374151"]].map(([l,v,c])=>(
                    <div key={l} style={{ background:"#fff",padding:8,borderRadius:7,textAlign:"center" }}>
                      <div style={{ fontSize:11,color:"#6b7280" }}>{l}</div>
                      <div style={{ fontWeight:700,color:c,fontSize:12 }}>{typeof v==="number"&&l!=="🧾"?formatKip(v):v}</div>
                    </div>
                  ))}
                </div>
                <div style={{ background:"#fff",padding:10,borderRadius:7,fontSize:12 }}>
                  <div style={{ display:"flex",justifyContent:"space-between",marginBottom:3 }}><span>ເງິນເລີ່ມ</span><span>{formatKip(sh.openingCash)}</span></div>
                  {sh.closedAt&&<>
                    <div style={{ display:"flex",justifyContent:"space-between",marginBottom:3 }}><span>ຄາດວ່າ</span><span>{formatKip(sh.expectedCash||0)}</span></div>
                    <div style={{ display:"flex",justifyContent:"space-between",marginBottom:3 }}><span>ນັບໄດ້</span><span style={{ fontWeight:700 }}>{formatKip(sh.closingCash)}</span></div>
                    <div style={{ display:"flex",justifyContent:"space-between",borderTop:"1px dashed #e5e7eb",paddingTop:4,fontWeight:700 }}><span>ສ່ວນຕ່າງ</span><span style={{ color:sh.variance>=0?"#16a34a":"#dc2626" }}>{sh.variance>=0?"+":""}{formatKip(sh.variance)}</span></div>
                  </>}
                  {sh.notes&&<div style={{ marginTop:6,fontSize:11,color:"#6b7280",fontStyle:"italic" }}>📝 {sh.notes}</div>}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ============================================================
// MAIN APP
// ============================================================
const NAV=[
  {id:"pos",label:"POS",icon:"🏪",roles:["cashier","manager","owner"]},
  {id:"shift",label:"ກະ",icon:"🌗",roles:["cashier","manager","owner"]},
  {id:"dashboard",label:"Dashboard",icon:"📊",roles:["manager","owner"]},
  {id:"history",label:"ປະຫວັດ",icon:"🧾",roles:["manager","owner"]},
  {id:"accounting",label:"ບັນຊີ",icon:"📒",roles:["owner"]},
  {id:"admin",label:"ຈັດການ",icon:"⚙️",roles:["manager","owner"]},
];
const ROLES={ cashier:{label:"ພະນັກງານ",en:"Cashier",pin:"1234"}, manager:{label:"ຜູ້ຈັດການ",en:"Manager",pin:"5555"}, owner:{label:"ເຈົ້າຂອງ",en:"Owner",pin:"556559"} };

export default function App() {
  // Restore the saved login session so a refresh / accidental reload does NOT
  // log the user out. Stays logged in until they explicitly tap the 🔓 logout.
  const savedRole = stor.get("session", null);
  const [role,setRole]=useState(savedRole && ROLES[savedRole] ? savedRole : null);
  const [pin,setPin]=useState("");
  const [pinErr,setPinErr]=useState("");
  const [view,setView]=useState("pos");
  const [menu,setMenu]=useState(()=>stor.get("menu",INITIAL_MENU));
  const [categories,setCategories]=useState(()=>stor.get("categories",INITIAL_CATEGORIES));
  const [addons,setAddons]=useState(()=>stor.get("addons",DEFAULT_ADDONS));
  const [sales,setSales]=useState(()=>stor.get("sales",[]));
  const [shifts,setShifts]=useState(()=>stor.get("shifts",[]));
  const [qrImage,setQrImage]=useState(()=>stor.get("qrImage",""));
  const [shopInfo,setShopInfo]=useState(()=>stor.get("shopInfo",DEFAULT_SHOP_INFO));
  const [parkedOrders,setParkedOrders]=useState(()=>stor.get("parked",[]));
  const [shiftModal,setShiftModal]=useState(null);
  const [layoutMode,setLayoutMode]=useState(()=>stor.get("layoutMode","auto"));
  const vp = useWindowSize();
  const autoMode = vp.isMobile ? "phone" : vp.isTablet ? "tablet" : "desktop";
  const mode = layoutMode === "auto" ? autoMode : layoutMode;
  const switchMode = (m) => { setLayoutMode(m); stor.set("layoutMode", m); };

  const currentShift=shifts.find(s=>!s.closedAt);

  // ── Settings cloud sync (menu, categories, add-ons, shop info) ──
  // These were local-only before, so editing the menu on one device never
  // reached the others. Now each save is stamped with a timestamp and pushed to
  // the cloud `settings` table; the poll below pulls any newer cloud version.
  const pushSetting = (key, value) => {
    const ts = new Date().toISOString();
    stor.set(key, value);
    stor.set(key + "Ts", ts);
    syncSetting(key, value, ts);
  };
  const setMenuSync       = (v) => { setMenu(v);       pushSetting("menu", v); };
  const setCategoriesSync = (v) => { setCategories(v); pushSetting("categories", v); };
  const setAddonsSync     = (v) => { setAddons(v);     pushSetting("addons", v); };
  const setShopInfoSync   = (v) => { setShopInfo(v);   pushSetting("shopInfo", v); };
  // Manual "Push to all devices" — stamps the current menu/categories/add-ons/
  // shop info as newest and uploads them, so every other device pulls this copy.
  const pushAllSettings = () => {
    pushSetting("menu", menu);
    pushSetting("categories", categories);
    pushSetting("addons", addons);
    pushSetting("shopInfo", shopInfo);
  };

  // Auto-save parked
  useEffect(() => { stor.set("parked", parkedOrders); }, [parkedOrders]);

  // Persist login session (null on logout) so reloads keep the user signed in.
  useEffect(() => { stor.set("session", role); }, [role]);

  // Real-time cloud sync — polls Supabase every 10s. The cloud is authoritative:
  //   • cloud rows win for matching ids,
  //   • a local row that's NOT in the cloud is kept ONLY if it was created very
  //     recently (likely an offline sale not yet uploaded) — and it's re-pushed
  //     so it lands in the cloud,
  //   • an OLD local row missing from the cloud is treated as deleted on the
  //     server (e.g. Reset Test Data, or a void/removal on another device) and
  //     is dropped — this is what makes deletions/resets propagate to every device.
  // Reconciliation only runs on a SUCCESSFUL fetch, so a dropped connection
  // (fetch returns null) never deletes anything.
  useEffect(() => {
    if (!role) return; // only when logged in
    let cancelled = false;
    const RECENT_MS = 15 * 60 * 1000; // protect + re-upload local-only rows newer than this
    const reconcile = (prev, cloud, tsField, repush) => {
      const cloudMap = new Map(cloud.map(r => [r.id, r]));
      const merged = new Map(cloudMap);
      prev.forEach(r => {
        if (!cloudMap.has(r.id)) {
          const age = Date.now() - new Date(r[tsField]).getTime();
          if (age >= 0 && age < RECENT_MS) { merged.set(r.id, r); repush(r); } // recent → keep & re-upload
          // else: old local-only row → deleted on server → drop
        }
      });
      return Array.from(merged.values());
    };
    // Apply a cloud setting only when it is strictly newer than our local copy,
    // so a device that just saved doesn't get its own edit echoed back, and an
    // older cloud value never clobbers a fresh local edit.
    const applySetting = (key, setter, cloud) => {
      const c = cloud[key];
      if (!c) return;
      const localTs = stor.get(key + "Ts", null);
      if (!localTs || new Date(c.updatedAt) > new Date(localTs)) {
        setter(c.value);
        stor.set(key, c.value);
        stor.set(key + "Ts", c.updatedAt);
      }
    };
    const sync = async () => {
      const [cs, cf, cset] = await Promise.all([fetchSales(), fetchShifts(), fetchSettings()]);
      if (cancelled) return;
      if (cs) {
        setSales(prev => {
          const next = reconcile(prev, cs, "date", syncOrder);
          stor.set("sales", next);
          return next;
        });
      }
      if (cf) {
        setShifts(prev => {
          const next = reconcile(prev, cf, "openedAt", syncShift);
          stor.set("shifts", next);
          return next;
        });
      }
      if (cset) {
        applySetting("menu", setMenu, cset);
        applySetting("categories", setCategories, cset);
        applySetting("addons", setAddons, cset);
        applySetting("shopInfo", setShopInfo, cset);
      }
    };
    sync(); // immediate on login
    const id = setInterval(sync, 10000); // every 10s
    return () => { cancelled = true; clearInterval(id); };
  }, [role]);

  const handlePin=(r)=>{ if(pin===ROLES[r].pin){setRole(r);setPin("");setPinErr("");}else setPinErr("PIN ບໍ່ຖືກຕ້ອງ"); };
  const addSale=(o)=>{ const u=[...sales,o];setSales(u);stor.set("sales",u);syncOrder(o); };
  const updateSale=(o)=>{ const u=sales.map(s=>s.id===o.id?o:s);setSales(u);stor.set("sales",u);syncOrder(o); };
  const openShift=({cash,notes})=>{ const s={id:genId(),openedAt:new Date().toISOString(),openingCash:cash,cashier:ROLES[role].label,notes};const u=[...shifts,s];setShifts(u);stor.set("shifts",u);syncShift(s);setShiftModal(null); };
  const closeShift=({cash,notes,expected})=>{ const u=shifts.map(s=>s.id===currentShift.id?{...s,closedAt:new Date().toISOString(),closingCash:cash,expectedCash:expected,variance:cash-expected,notes:(s.notes?s.notes+" | ":"")+(notes||"")}:s);setShifts(u);stor.set("shifts",u);syncShift(u.find(s=>s.id===currentShift.id));setShiftModal(null); };

  const resetTestData=async()=>{
    const c1=window.prompt("⚠️ ນີ້ຈະລຶບ Sales, Shifts, ແລະ Expenses ທັງໝົດ (ທັງໃນເຄື່ອງ ແລະ ໃນ Cloud).\nMenu, settings, QR ຈະຍັງຄົງຢູ່.\n\nພິມ RESET ເພື່ອຢືນຢັນ:");
    if(c1!=="RESET")return;
    // Wipe the cloud FIRST. If it fails, abort and change nothing — otherwise a
    // surviving cloud copy would just re-sync back down.
    const r=await wipeAllCloudData();
    if(!r.ok){ alert("⚠️ ລຶບ Cloud ບໍ່ສຳເລັດ: "+r.error+"\nບໍ່ໄດ້ລຶບຫຍັງ. ລອງໃໝ່ຕອນ online.\nCloud wipe failed — nothing was cleared."); return; }
    // Cloud is empty. Clear all local POS data and reload so no in-flight poll or
    // stale state can re-populate. Other devices drop their copies on next sync.
    ["sales","shifts","parked","expenses"].forEach(k=>stor.set(k,[]));
    alert("✅ ລ້າງຂໍ້ມູນທົດສອບສຳເລັດ (local + cloud).\nອຸປະກອນອື່ນຈະລ້າງເອງພາຍໃນ ~10 ວິນາທີ.\nກຳລັງໂຫຼດໃໝ່...");
    window.location.reload();
  };

  const allowed=NAV.filter(n=>n.roles.includes(role||"cashier"));

  if(!role) return (
    <div style={{ width:"100%",minHeight:"100vh",background:"#1a1a2e",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",fontFamily:"'Noto Sans Lao',sans-serif" }}>
      <div style={{ textAlign:"center",marginBottom:36 }}>
        <div style={{ fontSize:60,marginBottom:10 }}>🥐</div>
        <div style={{ fontSize:30,fontWeight:700,color:"#f4d03f",letterSpacing:2 }}>PAN PAN BAKE</div>
        <div style={{ fontSize:15,color:"#fde68a",marginTop:4 }}>ຮ້ານ ແປນ ແປນ ເບກ</div>
      </div>
      <div style={{ background:"rgba(255,255,255,0.07)",borderRadius:16,padding:"28px 36px",width:320 }}>
        <div style={{ fontSize:15,color:"#e5e7eb",fontWeight:600,textAlign:"center",marginBottom:16 }}>ເຂົ້າສູ່ລະບົບ / Login</div>
        <input type="password" inputMode="numeric" pattern="[0-9]*" autoComplete="one-time-code" placeholder="ໃສ່ PIN" value={pin} onChange={e=>{setPin(e.target.value);setPinErr("");}}
          style={{ width:"100%",padding:"12px 14px",borderRadius:10,border:"1px solid rgba(255,255,255,0.2)",background:"rgba(255,255,255,0.1)",color:"#fff",fontSize:20,textAlign:"center",letterSpacing:8,outline:"none",marginBottom:12,boxSizing:"border-box" }} />
        {pinErr&&<div style={{ color:"#f87171",fontSize:13,textAlign:"center",marginBottom:10 }}>{pinErr}</div>}
        <div style={{ display:"flex",flexDirection:"column",gap:8 }}>
          {Object.entries(ROLES).map(([r,info])=>(
            <button key={r} onClick={()=>handlePin(r)} style={{ padding:12,background:"#f4d03f",color:"#1a1a2e",border:"none",borderRadius:10,fontWeight:700,cursor:"pointer",fontSize:14,display:"flex",justifyContent:"space-between" }}>
              <span>{info.label}</span><span style={{ opacity:0.7 }}>{info.en}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );

  // Helper: mode-toggle button — defined as a plain render expression, NOT a component
  // (inner component functions cause POSView to remount on every re-render, wiping cart state)
  const modeBtn = (m, icon, label, small) => {
    const active = layoutMode === m || (layoutMode === "auto" && autoMode === m);
    const sz = small ? 26 : 30;
    return (
      <button key={m} onClick={()=>switchMode(m)} title={label} style={{
        width:sz,height:sz,minWidth:sz,borderRadius:6,border:"none",cursor:"pointer",
        background: active ? "#f4d03f" : "rgba(255,255,255,0.1)",
        color: active ? "#1a1a2e" : "#9ca3af",
        fontSize: small ? 11 : 13, padding:0, boxSizing:"border-box",
        display:"flex",alignItems:"center",justifyContent:"center"
      }}>{icon}</button>
    );
  };

  // Shared view content — inlined JSX, not a component, so POSView's state is never lost
  const viewContent = (
    <div className={`view-content layout-${mode}`} style={{ flex:1,minWidth:0,overflowY:"auto",overflowX:"hidden" }}>
      <OfflineBanner />
      {view==="pos"&&<POSView menu={menu} categories={categories} addons={addons} onSale={addSale} onUpdateSale={updateSale} currentShift={currentShift} cashier={ROLES[role].label} qrImage={qrImage} shopInfo={shopInfo} parkedOrders={parkedOrders} setParkedOrders={setParkedOrders} mode={mode} />}
      {view==="shift"&&<ShiftView shifts={shifts} sales={sales} currentShift={currentShift} onOpen={()=>setShiftModal("open")} onClose={()=>setShiftModal("close")} />}
      {view==="dashboard"&&<DashboardView sales={sales} />}
      {view==="history"&&<SalesHistoryView sales={sales} setSales={setSales} shopInfo={shopInfo} />}
      {view==="accounting"&&<AccountingView sales={sales} />}
      {view==="admin"&&<AdminView menu={menu} setMenu={setMenuSync} categories={categories} setCategories={setCategoriesSync} addons={addons} setAddons={setAddonsSync} qrImage={qrImage} setQrImage={setQrImage} shopInfo={shopInfo} setShopInfo={setShopInfoSync} role={role} onResetTestData={resetTestData} onPushAll={pushAllSettings} />}
    </div>
  );

  /* ── PHONE layout: top header + content + bottom tab bar ── */
  if (mode === "phone") return (
    <div style={{ display:"flex",flexDirection:"column",width:"100%",height:"100vh",fontFamily:"'Noto Sans Lao','Segoe UI',sans-serif",overflow:"hidden" }}>
      <div style={{ position:"fixed",top:0,left:0,right:0,height:"calc(44px + env(safe-area-inset-top, 0px))",background:"#1a1a2e",display:"flex",alignItems:"flex-end",justifyContent:"space-between",padding:"0 12px",paddingTop:"env(safe-area-inset-top, 0px)",paddingBottom:8,zIndex:200,borderBottom:"1px solid rgba(255,255,255,0.06)",flexShrink:0,boxSizing:"border-box" }}>
        <div style={{ display:"flex",alignItems:"center",gap:8 }}>
          <span style={{ fontSize:18 }}>🥐</span>
          <span style={{ fontSize:11,color:"#9ca3af" }}>{ROLES[role].label}</span>
        </div>
        <div style={{ display:"flex",alignItems:"center",gap:5 }}>
          {modeBtn("phone","📱","Phone",true)}
          {modeBtn("tablet","📲","Tablet",true)}
          {modeBtn("desktop","💻","Desktop",true)}
          <button onClick={()=>{setRole(null);setView("pos");}} style={{ width:26,height:26,minWidth:26,borderRadius:6,border:"none",background:"rgba(255,255,255,0.1)",color:"#9ca3af",cursor:"pointer",fontSize:13,padding:0,boxSizing:"border-box",display:"flex",alignItems:"center",justifyContent:"center" }}>🔓</button>
        </div>
      </div>
      <div className={`view-content layout-${mode}`} style={{ flex:1,minWidth:0,overflowY:"auto",overflowX:"hidden",paddingTop:"calc(44px + env(safe-area-inset-top, 0px))",paddingBottom:"calc(64px + env(safe-area-inset-bottom, 0px))" }}>
        <OfflineBanner />
        {view==="pos"&&<POSView menu={menu} categories={categories} addons={addons} onSale={addSale} onUpdateSale={updateSale} currentShift={currentShift} cashier={ROLES[role].label} qrImage={qrImage} shopInfo={shopInfo} parkedOrders={parkedOrders} setParkedOrders={setParkedOrders} mode={mode} />}
        {view==="shift"&&<ShiftView shifts={shifts} sales={sales} currentShift={currentShift} onOpen={()=>setShiftModal("open")} onClose={()=>setShiftModal("close")} />}
        {view==="dashboard"&&<DashboardView sales={sales} />}
        {view==="history"&&<SalesHistoryView sales={sales} setSales={setSales} shopInfo={shopInfo} />}
        {view==="accounting"&&<AccountingView sales={sales} />}
        {view==="admin"&&<AdminView menu={menu} setMenu={setMenuSync} categories={categories} setCategories={setCategoriesSync} addons={addons} setAddons={setAddonsSync} qrImage={qrImage} setQrImage={setQrImage} shopInfo={shopInfo} setShopInfo={setShopInfoSync} role={role} onResetTestData={resetTestData} onPushAll={pushAllSettings} />}
      </div>
      <div style={{ position:"fixed",bottom:0,left:0,right:0,height:"calc(64px + env(safe-area-inset-bottom, 0px))",background:"#1a1a2e",display:"flex",alignItems:"flex-start",paddingBottom:"env(safe-area-inset-bottom, 0px)",zIndex:200,borderTop:"1px solid rgba(255,255,255,0.08)",boxSizing:"border-box" }}>
        {allowed.map(n=>(
          <button key={n.id} onClick={()=>setView(n.id)} style={{
            flex:1,height:64,border:"none",cursor:"pointer",
            background:view===n.id?"rgba(244,208,63,0.15)":"transparent",
            color:view===n.id?"#f4d03f":"#6b7280",
            display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",
            gap:2,position:"relative",padding:0,boxSizing:"border-box",
            borderTop:view===n.id?"2px solid #f4d03f":"2px solid transparent"
          }}>
            <span style={{ fontSize:22,lineHeight:1 }}>{n.icon}</span>
            <span style={{ fontSize:9,fontWeight:600,lineHeight:1 }}>{n.label}</span>
            {n.id==="shift"&&currentShift&&<span style={{ position:"absolute",top:6,right:"calc(50% - 14px)",width:7,height:7,borderRadius:"50%",background:"#16a34a" }} />}
            {n.id==="pos"&&parkedOrders.length>0&&<span style={{ position:"absolute",top:6,right:"calc(50% - 18px)",minWidth:16,height:16,borderRadius:8,background:"#ea580c",color:"#fff",fontSize:9,fontWeight:700,display:"flex",alignItems:"center",justifyContent:"center",padding:"0 3px" }}>{parkedOrders.length}</span>}
          </button>
        ))}
      </div>
      {shiftModal&&<ShiftModal type={shiftModal} currentShift={currentShift} sales={sales} onSubmit={shiftModal==="open"?openShift:closeShift} onCancel={()=>setShiftModal(null)} />}
    </div>
  );

  /* ── TABLET / DESKTOP layout: left sidebar ── */
  return (
    <div style={{ display:"flex",width:"100%",height:"100vh",fontFamily:"'Noto Sans Lao','Segoe UI',sans-serif",overflow:"hidden" }}>
      <div style={{ width:70,minWidth:70,maxWidth:70,background:"#1a1a2e",display:"flex",flexDirection:"column",alignItems:"center",padding:"14px 0",gap:3,flexShrink:0,overflow:"hidden" }}>
        <div style={{ fontSize:26,marginBottom:14,lineHeight:1 }}>🥐</div>
        {allowed.map(n=>(
          <button key={n.id} onClick={()=>setView(n.id)} style={{
            width:54,height:54,minWidth:54,maxWidth:54,
            borderRadius:13,border:"none",cursor:"pointer",
            background:view===n.id?"#f4d03f":"transparent",
            color:view===n.id?"#1a1a2e":"#6b7280",
            display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",
            gap:2,position:"relative",padding:0,boxSizing:"border-box",flexShrink:0,overflow:"hidden"
          }}>
            <span style={{ fontSize:20,lineHeight:1 }}>{n.icon}</span>
            <span style={{ fontSize:9,fontWeight:600,lineHeight:1 }}>{n.label}</span>
            {n.id==="shift"&&currentShift&&<span style={{ position:"absolute",top:4,right:6,width:7,height:7,borderRadius:"50%",background:"#16a34a" }} />}
            {n.id==="pos"&&parkedOrders.length>0&&<span style={{ position:"absolute",top:4,right:6,minWidth:16,height:16,borderRadius:8,background:"#ea580c",color:"#fff",fontSize:9,fontWeight:700,display:"flex",alignItems:"center",justifyContent:"center",padding:"0 3px" }}>{parkedOrders.length}</span>}
          </button>
        ))}
        <div style={{ flex:1 }} />
        <div style={{ display:"flex",flexDirection:"column",gap:4,marginBottom:8 }}>
          {modeBtn("phone","📱","Phone",false)}
          {modeBtn("tablet","📲","Tablet",false)}
          {modeBtn("desktop","💻","Desktop",false)}
        </div>
        <div style={{ textAlign:"center",marginBottom:6 }}>
          <div style={{ fontSize:9,color:"#4b5563",marginBottom:4 }}>{ROLES[role].label}</div>
          <button onClick={()=>{setRole(null);setView("pos");}} style={{ width:38,height:38,minWidth:38,borderRadius:9,border:"none",background:"rgba(255,255,255,0.1)",color:"#6b7280",cursor:"pointer",fontSize:15,padding:0,boxSizing:"border-box",display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto" }}>🔓</button>
        </div>
      </div>
      {viewContent}
      {shiftModal&&<ShiftModal type={shiftModal} currentShift={currentShift} sales={sales} onSubmit={shiftModal==="open"?openShift:closeShift} onCancel={()=>setShiftModal(null)} />}
    </div>
  );
}

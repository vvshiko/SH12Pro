/* SH12 Pro — Ultra-Professional Subscription Server, Multi-Payment Telegram Bot & Obfuscation API
 * Developed for @vvshiko
 */

const http = require("http");
const https = require("https");
const fs = require("fs");
const path = require("path");
const { buildAll } = require("./obfuscate");

const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, "data");
const DB_FILE = path.join(DATA_DIR, "database.json");
const PUBLIC_DIR = path.join(__dirname, "public");

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

/* ======================== CRYPTO LICENSE ENGINE ======================== */
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function extractAndNormalizeDeviceId(raw) {
  const str = String(raw || "").toUpperCase();
  const match = str.match(/ID[-_ ]?([A-Z0-9]{4})[-_ ]?([A-Z0-9]{4})[-_ ]?([A-Z0-9]{4})/);
  if (match) {
    return `ID-${match[1]}-${match[2]}-${match[3]}`;
  }
  let s = str.replace(/[^A-Z0-9]/g, "");
  if (s.startsWith("ID")) s = s.slice(2);
  if (s.length !== 12) return null;
  return "ID-" + s.slice(0, 4) + "-" + s.slice(4, 8) + "-" + s.slice(8, 12);
}

function computeLicenseKey(deviceId) {
  const norm = extractAndNormalizeDeviceId(deviceId);
  if (!norm) return null;
  const clean = norm.replace(/-/g, "");
  let h0 = (0x73683132 ^ 0xa5f19c3d) >>> 0;
  let h1 = (0x56565348 ^ 0x3c9e7b1f) >>> 0;
  let h2 = (0x494b4f50 ^ 0x91d46e83) >>> 0;
  let h3 = (0x524f3236 ^ 0x6e2b85a7) >>> 0;
  const secret = [0x9d, 0x41, 0xe7, 0x2b, 0x88, 0x53, 0xc6, 0x19, 0x7f, 0x3a, 0xb2, 0x64, 0xd5, 0x0e, 0x4c, 0xf8];

  for (let round = 0; round < 64; round++) {
    const ch = clean.charCodeAt(round % clean.length);
    const sc = secret[(round * 3 + ch) & 15] ^ (round * 0x1f);
    h0 = Math.imul(h0 ^ ch ^ sc, 0x85ebca6b) >>> 0;
    h1 = Math.imul(h1 ^ ((h0 >>> 13) | (h0 << 19)), 0xc2b2ae35) >>> 0;
    h2 = Math.imul(h2 ^ ((h1 >>> 11) | (h1 << 21)) ^ sc, 0x27d4eb2f) >>> 0;
    h3 = Math.imul(h3 ^ ((h2 >>> 15) | (h2 << 17)) ^ ch, 0x165667b1) >>> 0;
    const tmp = h0;
    h0 = (h1 + ((h3 << 7) | (h3 >>> 25))) >>> 0;
    h1 = (h2 ^ h0) >>> 0;
    h2 = (h3 + tmp) >>> 0;
    h3 = (tmp ^ h1 ^ Math.imul(round, 0x9e3779b9)) >>> 0;
  }

  const words = [h0, h1, h2, h3];
  const groups = [];
  for (let g = 0; g < 4; g++) {
    let w = words[g];
    let block = "";
    for (let c = 0; c < 4; c++) {
      const idx = (w ^ (w >>> 16)) & 31;
      block += ALPHABET[idx];
      w = Math.imul(w >>> 5, 0x45d9f3b) >>> 0;
    }
    groups.push(block);
  }
  return "SH12-" + groups.join("-");
}

function normalizeLicenseKey(raw) {
  let s = String(raw || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (s.startsWith("SH12")) s = s.slice(4);
  if (s.length !== 16) return null;
  return "SH12-" + s.slice(0, 4) + "-" + s.slice(4, 8) + "-" + s.slice(8, 12) + "-" + s.slice(12, 16);
}

function isLicenseValid(deviceId, licenseKey) {
  const expected = computeLicenseKey(deviceId);
  const actual = normalizeLicenseKey(licenseKey);
  return !!(expected && actual && expected === actual);
}

/* ======================== DATABASE LAYER ======================== */
const DEFAULT_PAYMENT_METHODS = [
  {
    id: "vodafone",
    name: "🔴 فودافون كاش (Vodafone Cash)",
    account: "010XXXXXXXX",
    note: "حوّل المبلغ على رقم فودافون كاش ثم أرسل اسكرين شوت التحويل هنا",
    enabled: true
  },
  {
    id: "instapay",
    name: "🟣 إنستا باي (InstaPay)",
    account: "vvshiko@instapay",
    note: "حوّل عبر تطبيق InstaPay إلى العنوان أو الرقم الموضح ثم أرسل صورة الإيصال",
    enabled: true
  },
  {
    id: "etisalat_orange",
    name: "🟠 اتصالات / أورانج كاش",
    account: "011XXXXXXXX",
    note: "تحويل محفظة إلكترونية وأرسل صورة تأكيد العملية",
    enabled: true
  },
  {
    id: "binance",
    name: "🟡 باينانس (Binance Pay / USDT)",
    account: "ID: 123456789",
    note: "تحويل عبر Binance Pay ID بدون عمولة ثم أرسل اسكرين الدفع",
    enabled: true
  }
];

const DEFAULT_DB = {
  settings: {
    botToken: process.env.BOT_TOKEN || "",
    adminChatId: process.env.ADMIN_CHAT_ID || "",
    botUsername: "SH12Pro_Sub_bot",
    planPrice: "200 ج.م",
    supportUsername: "vvshiko",
    serverUrl: process.env.RENDER_EXTERNAL_URL || `http://localhost:${PORT}`,
    paymentMethods: DEFAULT_PAYMENT_METHODS
  },
  licenses: [],
  revokedDevices: [],
  orders: [],
  botUsers: []
};

function loadDb() {
  try {
    if (fs.existsSync(DB_FILE)) {
      const parsed = JSON.parse(fs.readFileSync(DB_FILE, "utf8"));
      const settings = { ...DEFAULT_DB.settings, ...(parsed.settings || {}) };
      if (!settings.botUsername) settings.botUsername = "SH12Pro_Sub_bot";
      if (!settings.supportUsername) settings.supportUsername = "vvshiko";
      if (!Array.isArray(settings.paymentMethods) || settings.paymentMethods.length === 0) {
        settings.paymentMethods = JSON.parse(JSON.stringify(DEFAULT_PAYMENT_METHODS));
      }
      return {
        settings,
        licenses: Array.isArray(parsed.licenses) ? parsed.licenses : [],
        revokedDevices: Array.isArray(parsed.revokedDevices) ? parsed.revokedDevices : [],
        orders: Array.isArray(parsed.orders) ? parsed.orders : [],
        botUsers: Array.isArray(parsed.botUsers) ? parsed.botUsers : []
      };
    }
  } catch (e) {
    console.error("DB Load Error:", e);
  }
  return JSON.parse(JSON.stringify(DEFAULT_DB));
}

let db = loadDb();

function saveDb() {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2), "utf8");
  } catch (e) {
    console.error("DB Save Error:", e);
  }
}

function registerBotUser(chatId, firstName, username) {
  if (!chatId || String(chatId).startsWith("SIM-")) return;
  const idStr = String(chatId);
  let u = db.botUsers.find((x) => String(x.chatId) === idStr);
  if (!u) {
    db.botUsers.push({
      chatId: idStr,
      firstName: firstName || "مستخدم",
      username: username || "",
      joinedAt: new Date().toISOString()
    });
    saveDb();
  } else {
    u.firstName = firstName || u.firstName;
    u.username = username || u.username;
  }
}

function upsertLicense({ deviceId, customerName, telegramId, telegramUsername, status = "active" }) {
  const normId = extractAndNormalizeDeviceId(deviceId);
  if (!normId) return null;
  const key = computeLicenseKey(normId);
  const now = new Date().toISOString();

  if (Array.isArray(db.revokedDevices)) {
    db.revokedDevices = db.revokedDevices.filter((id) => id !== normId);
  }

  let lic = db.licenses.find((x) => x.deviceId === normId);
  if (lic) {
    lic.status = status;
    lic.licenseKey = key;
    if (customerName) lic.customerName = customerName;
    if (telegramId) lic.telegramId = String(telegramId);
    if (telegramUsername) lic.telegramUsername = telegramUsername;
    lic.updatedAt = now;
  } else {
    lic = {
      id: "LIC-" + Date.now().toString(36).toUpperCase(),
      deviceId: normId,
      licenseKey: key,
      status,
      customerName: customerName || "مشترك",
      telegramId: telegramId ? String(telegramId) : "",
      telegramUsername: telegramUsername || "",
      createdAt: now,
      updatedAt: now,
      lastSeenAt: null
    };
    db.licenses.unshift(lic);
  }
  saveDb();
  return lic;
}

/* ======================== TELEGRAM BOT ENGINE ======================== */
let botRunning = false;
let botOffset = 0;
let currentPollingToken = "";
let botInfo = { connected: false, username: "", firstName: "", error: "" };
const userSessions = new Map();

function tgApi(method, payload = {}) {
  return new Promise((resolve) => {
    const token = db.settings.botToken ? db.settings.botToken.trim() : "";
    if (!token) return resolve({ ok: false, description: "No bot token configured" });

    const body = Buffer.from(JSON.stringify(payload), "utf8");
    const req = https.request(
      {
        hostname: "api.telegram.org",
        path: `/bot${token}/${method}`,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": body.length
        },
        timeout: 35000
      },
      (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            resolve({ ok: false, description: "Invalid JSON from Telegram" });
          }
        });
      }
    );
    req.on("error", (err) => resolve({ ok: false, description: err.message }));
    req.on("timeout", () => {
      req.destroy();
      resolve({ ok: false, description: "Timeout" });
    });
    req.write(body);
    req.end();
  });
}

async function processOrderDecision(orderId, action) {
  const order = db.orders.find((o) => o.orderId === orderId);
  if (!order) return { ok: false, error: "الطلب غير موجود" };

  if (action === "approve") {
    const lic = upsertLicense({
      deviceId: order.deviceId,
      customerName: order.customerName,
      telegramId: order.telegramId,
      telegramUsername: order.telegramUsername,
      status: "active"
    });
    order.status = "approved";
    order.licenseKey = lic.licenseKey;
    order.decidedAt = new Date().toISOString();
    saveDb();

    if (order.telegramId && !String(order.telegramId).startsWith("SIM-")) {
      await tgApi("sendMessage", {
        chat_id: order.telegramId,
        parse_mode: "HTML",
        text:
          `🎉 <b>مبروك! تم قبول تحويلك وتفعيل اشتراكك الدائم (مدى الحياة) في أداة SH12 Pro!</b>\n` +
          `━━━━━━━━━━━━━━\n` +
          `🖥 <b>سيريال الهاردوير لجهازك:</b>\n<code>${order.deviceId}</code>\n\n` +
          `🔑 <b>سيريال التفعيل الخاص بك (اضغط عليه للنسخ):</b>\n<code>${lic.licenseKey}</code>\n` +
          `━━━━━━━━━━━━━━\n` +
          `📌 <b>طريقة التفعيل:</b>\n` +
          `1️⃣ افتح أداة <b>SH12 Pro</b> في المتصفح.\n` +
          `2️⃣ الصق السيريال في خانة التفعيل واضغط <b>تفعيل دلوقتي</b>.\n` +
          `3️⃣ استمتع بتفعيل مدى الحياة على جهازك! 💎`
      });
    }

    if (order.adminMsgId && db.settings.adminChatId) {
      const updatedCaption =
        `✅ <b>تم قبول الطلب وإرسال السيريال للعميل أوتوماتيكياً!</b>\n` +
        `━━━━━━━━━━━━━━\n` +
        `📋 <b>رقم الطلب:</b> #${order.orderId}\n` +
        `👤 <b>العميل:</b> ${order.customerName} ${order.telegramUsername ? "(@" + order.telegramUsername + ")" : ""}\n` +
        `💳 <b>طريقة الدفع:</b> ${order.paymentMethodName || "تحويل كاش"}\n` +
        `🖥 <b>سيريال الجهاز:</b> <code>${order.deviceId}</code>\n` +
        `🔑 <b>سيريال التفعيل:</b> <code>${lic.licenseKey}</code>\n` +
        `🟢 <b>الحالة:</b> نشط (مدى الحياة)`;

      const editMethod = order.adminMsgIsPhoto ? "editMessageCaption" : "editMessageText";
      const editField = order.adminMsgIsPhoto ? "caption" : "text";
      await tgApi(editMethod, {
        chat_id: db.settings.adminChatId,
        message_id: order.adminMsgId,
        parse_mode: "HTML",
        [editField]: updatedCaption,
        reply_markup: {
          inline_keyboard: [
            [{ text: "🚫 قطع الاشتراك عن هذا العميل", callback_data: `suspend:${order.deviceId}` }]
          ]
        }
      });
    }

    return { ok: true, order, license: lic };
  } else if (action === "reject") {
    order.status = "rejected";
    order.decidedAt = new Date().toISOString();
    saveDb();

    if (order.telegramId && !String(order.telegramId).startsWith("SIM-")) {
      await tgApi("sendMessage", {
        chat_id: order.telegramId,
        parse_mode: "HTML",
        text:
          `❌ <b>عذراً، تم رفض طلب الاشتراك رقم #${order.orderId}</b>\n` +
          `لم نتمكن من تأكيد صورة التحويل المرسلة.\n\n` +
          `يمكنك إعادة المحاولة بالضغط على /start أو التواصل مع الدعم الفني: @${db.settings.supportUsername || "vvshiko"}`
      });
    }

    if (order.adminMsgId && db.settings.adminChatId) {
      const rejectedText =
        `❌ <b>تم رفض الطلب #${order.orderId}</b>\n` +
        `👤 العميل: ${order.customerName}\n` +
        `🖥 الجهاز: <code>${order.deviceId}</code>`;

      const editMethod = order.adminMsgIsPhoto ? "editMessageCaption" : "editMessageText";
      const editField = order.adminMsgIsPhoto ? "caption" : "text";
      await tgApi(editMethod, {
        chat_id: db.settings.adminChatId,
        message_id: order.adminMsgId,
        parse_mode: "HTML",
        [editField]: rejectedText
      });
    }

    return { ok: true, order };
  }
  return { ok: false, error: "إجراء غير معروف" };
}

async function toggleSubscriptionStatus(deviceId, targetStatus, notifyTelegram = true) {
  const normId = extractAndNormalizeDeviceId(deviceId);
  const lic = db.licenses.find((x) => x.deviceId === normId);
  if (!lic) return { ok: false, error: "الاشتراك غير موجود" };

  lic.status = targetStatus === "suspended" ? "suspended" : "active";
  lic.updatedAt = new Date().toISOString();
  saveDb();

  if (notifyTelegram && lic.telegramId && !String(lic.telegramId).startsWith("SIM-")) {
    if (lic.status === "suspended") {
      await tgApi("sendMessage", {
        chat_id: lic.telegramId,
        parse_mode: "HTML",
        text:
          `⛔ <b>تنبيه هام من إدارة SH12 Pro:</b>\n` +
          `تم إيقاف/قطع اشتراك أداة SH12 Pro الخاص بجهازك (<code>${lic.deviceId}</code>).\n` +
          `للاستفسار تواصل مع الإدارة: @${db.settings.supportUsername || "vvshiko"}`
      });
    } else {
      await tgApi("sendMessage", {
        chat_id: lic.telegramId,
        parse_mode: "HTML",
        text:
          `✅ <b>إشعار من إدارة SH12 Pro:</b>\n` +
          `تم إعادة تفعيل اشتراكك الدائم لجهازك (<code>${lic.deviceId}</code>) بنجاح! يمكنك استخدام الأداة الآن.`
      });
    }
  }
  return { ok: true, license: lic };
}

async function permanentlyDeleteSubscription(deviceId, notifyTelegram = true) {
  const normId = extractAndNormalizeDeviceId(deviceId);
  if (!normId) return { ok: false, error: "Device ID غير صالح" };
  const lic = db.licenses.find((x) => x.deviceId === normId);
  db.licenses = db.licenses.filter((x) => x.deviceId !== normId);
  if (!Array.isArray(db.revokedDevices)) db.revokedDevices = [];
  if (!db.revokedDevices.includes(normId)) {
    db.revokedDevices.push(normId);
  }
  saveDb();

  if (notifyTelegram && lic && lic.telegramId && !String(lic.telegramId).startsWith("SIM-")) {
    await tgApi("sendMessage", {
      chat_id: lic.telegramId,
      parse_mode: "HTML",
      text:
        `🚫 <b>إشعار إلغاء وحذف نهائي من إدارة SH12 Pro:</b>\n` +
        `تم حذف اشتراك جهازك (<code>${normId}</code>) نهائياً وإغلاق الأداة.\n` +
        `للاشتراك من جديد: @${db.settings.botUsername || "SH12Pro_Sub_bot"} | الدعم: @${db.settings.supportUsername || "vvshiko"}`
    });
  }
  return { ok: true, deviceId: normId };
}

function getEnabledPaymentMethods() {
  const list = Array.isArray(db.settings.paymentMethods) ? db.settings.paymentMethods : DEFAULT_PAYMENT_METHODS;
  const enabled = list.filter((m) => m.enabled !== false);
  return enabled.length > 0 ? enabled : list;
}

async function sendWelcomeScreen(chatId, firstName, prefillDeviceId = null) {
  const price = db.settings.planPrice || "200 ج.م";
  const support = db.settings.supportUsername || "vvshiko";

  const buttons = [
    [{ text: `💎 شراء الاشتراك الدائم (${price} · دفع لمرة واحدة)`, callback_data: "buy_plan" }],
    [
      { text: "🔍 فحص اشتراكي واسترجاع الكود", callback_data: "check_sub" },
      { text: "📖 شرح التفعيل", callback_data: "how_to_use" }
    ],
    [{ text: `💬 الدعم الفني المباشر (@${support})`, url: `https://t.me/${support}` }]
  ];

  if (String(chatId) === String(db.settings.adminChatId)) {
    buttons.push([{ text: "👑 لوحة تحكم الأدمن (إدارة المشتركين والطلبات)", callback_data: "admin_home" }]);
  }

  await tgApi("sendMessage", {
    chat_id: chatId,
    parse_mode: "HTML",
    text:
      `أهلاً بيك يا <b>${firstName || "بطل"}</b> في البوت الرسمي لأداة <b>SH12 Pro</b> 🚀\n` +
      `━━━━━━━━━━━━━━\n` +
      `💎 <b>خطة الدفع لمرة واحدة فقط (مدى الحياة · Lifetime):</b>\n` +
      `✔ فتح كل طبقات التفعيل (12 شهر + طبقات الـ 6 شهور التراكمية)\n` +
      `✔ تفعيل مربوط ببصمة جهازك مدى الحياة بدون أي تجديد شهري\n` +
      `✔ نظام حماية ذكي لفحص السعر ($0.00) قبل الدفع\n` +
      `✔ استلام سيريال التفعيل أوتوماتيكياً من البوت\n` +
      `━━━━━━━━━━━━━━\n` +
      `💵 <b>سعر الاشتراك الدائم:</b> <code>${price}</code>\n` +
      `👇 اضغط على زر الشراء بالأسفل لبدء التفعيل فوراً:`,
    reply_markup: { inline_keyboard: buttons }
  });

  if (prefillDeviceId) {
    userSessions.set(String(chatId), { step: "AWAITING_PAYMENT_METHOD", deviceId: prefillDeviceId, methodId: "" });
    await sendPaymentMethodPicker(chatId, prefillDeviceId);
  }
}

async function sendPaymentMethodPicker(chatId, deviceId) {
  const methods = getEnabledPaymentMethods();
  const rows = methods.map((m) => [{ text: m.name, callback_data: `pay_method:${m.id}` }]);
  rows.push([{ text: "🔄 تغيير سيريال الجهاز", callback_data: "buy_plan" }]);

  await tgApi("sendMessage", {
    chat_id: chatId,
    parse_mode: "HTML",
    text:
      `✅ <b>تم تسجيل سيريال الهاردوير لجهازك:</b>\n` +
      `<code>${deviceId}</code>\n\n` +
      `💳 <b>الخطوة (2 من 3): اختر وسيلة الدفع المناسبة لك من القائمة:</b>`,
    reply_markup: { inline_keyboard: rows }
  });
}

async function sendSelectedMethodDetails(chatId, deviceId, method) {
  const price = db.settings.planPrice || "200 ج.م";

  await tgApi("sendMessage", {
    chat_id: chatId,
    parse_mode: "HTML",
    text:
      `💳 <b>وسيلة الدفع المختارة:</b> ${method.name}\n` +
      `🖥 <b>سيريال الجهاز:</b> <code>${deviceId}</code>\n` +
      `━━━━━━━━━━━━━━\n` +
      `💵 <b>المبلغ المطلوب تحويله:</b> <code>${price}</code>\n` +
      `📲 <b>رقم / حساب التحويل (اضغط عليه للنسخ):</b>\n` +
      `<code>${method.account}</code>\n\n` +
      `📝 <b>تعليمات:</b> ${method.note || "أرسل صورة التحويل بعد الدفع"}\n` +
      `━━━━━━━━━━━━━━\n` +
      `📸 <b>الخطوة الأخيرة (3 من 3): بعد التحويل، ابعت دلوقتي صورة الإيصال (اسكرين شوت التحويل) هنا في الشات:</b>`,
    reply_markup: {
      inline_keyboard: [[{ text: "🔙 اختيار وسيلة دفع أخرى", callback_data: "back_to_methods" }]]
    }
  });
}

async function handleTelegramUpdate(update) {
  try {
    if (update.callback_query) {
      const cb = update.callback_query;
      const chatId = cb.message.chat.id;
      const data = cb.data || "";
      const isAdmin = String(chatId) === String(db.settings.adminChatId);

      await tgApi("answerCallbackQuery", { callback_query_id: cb.id });

      if (data === "buy_plan") {
        userSessions.set(String(chatId), { step: "AWAITING_DEVICE_ID", deviceId: "", methodId: "" });
        await tgApi("sendMessage", {
          chat_id: chatId,
          parse_mode: "HTML",
          text:
            `🖥 <b>الخطوة (1 من 3): إرسال سيريال الجهاز (Device ID)</b>\n\n` +
            `افتح أداة <b>SH12 Pro</b> في متصفحك، واضغط على <b>نسخ السيريال</b> ثم ابعته هنا في رسالة:\n` +
            `مثال: <code>ID-A1B2-C3D4-E5F6</code>`
        });
        return;
      }

      if (data === "back_to_methods") {
        const s = userSessions.get(String(chatId));
        if (!s || !s.deviceId) {
          userSessions.set(String(chatId), { step: "AWAITING_DEVICE_ID", deviceId: "", methodId: "" });
          await tgApi("sendMessage", { chat_id: chatId, text: "أرسل سيريال الجهاز أولاً (ID-XXXX-XXXX-XXXX):" });
          return;
        }
        s.step = "AWAITING_PAYMENT_METHOD";
        await sendPaymentMethodPicker(chatId, s.deviceId);
        return;
      }

      if (data.startsWith("pay_method:")) {
        const methodId = data.split(":")[1];
        const s = userSessions.get(String(chatId));
        if (!s || !s.deviceId) {
          await tgApi("sendMessage", { chat_id: chatId, text: "يرجى إرسال سيريال الجهاز أولاً بالضغط على شراء الاشتراك." });
          return;
        }
        const methods = getEnabledPaymentMethods();
        const chosen = methods.find((m) => m.id === methodId) || methods[0];
        s.step = "AWAITING_SCREENSHOT";
        s.methodId = chosen.id;
        s.methodName = chosen.name;
        userSessions.set(String(chatId), s);
        await sendSelectedMethodDetails(chatId, s.deviceId, chosen);
        return;
      }

      if (data === "how_to_use") {
        await tgApi("sendMessage", {
          chat_id: chatId,
          parse_mode: "HTML",
          text:
            `📖 <b>خطوات تفعيل وتشغيل أداة SH12 Pro:</b>\n\n` +
            `1️⃣ افتح الإضافة في متصفح كروم وانسخ <b>سيريال الهاردوير (Device ID)</b> الخاص بجهازك.\n` +
            `2️⃣ اضغط على <b>شراء الاشتراك</b> في البوت، وابعت السيريال، واختار طريقة الدفع المناسبة ليك (فودافون كاش / إنستا باي / إلخ).\n` +
            `3️⃣ ابعت صورة تحويل الكاش (اسكرين شوت) هنا في البوت.\n` +
            `4️⃣ بمجرد مراجعة التحويل، البوت هيبعتلك <b>سيريال التفعيل (SH12-XXXX-...)</b> أوتوماتيكياً هنا في الشات.\n` +
            `5️⃣ الصق السيريال في الأداة وهتفتح معاك مدى الحياة على جهازك!`
        });
        return;
      }

      if (data === "check_sub") {
        const mySubs = db.licenses.filter((l) => String(l.telegramId) === String(chatId));
        if (mySubs.length === 0) {
          await tgApi("sendMessage", {
            chat_id: chatId,
            parse_mode: "HTML",
            text: `ℹ️ لا يوجد اشتراك مسجل بحسابك حتى الآن.\nاضغط على زر <b>شراء الاشتراك</b> لتفعيل جهازك مدى الحياة.`
          });
        } else {
          let txt = `💎 <b>اشتراكاتك المسجلة في SH12 Pro:</b>\n\n`;
          mySubs.forEach((s) => {
            const st = s.status === "active" ? "🟢 شغال (مدى الحياة)" : "🔴 مقطوع / موقوف من الإدارة";
            txt += `🖥 سيريال الجهاز: <code>${s.deviceId}</code>\n🔑 سيريال التفعيل: <code>${s.licenseKey}</code>\n📊 الحالة: ${st}\n━━━━━━━━━━━━━━\n`;
          });
          await tgApi("sendMessage", { chat_id: chatId, parse_mode: "HTML", text: txt });
        }
        return;
      }

      if (data.startsWith("set_admin:")) {
        const newAdminId = data.split(":")[1];
        if (!db.settings.adminChatId) {
          db.settings.adminChatId = String(newAdminId);
          saveDb();
          await tgApi("sendMessage", {
            chat_id: chatId,
            parse_mode: "HTML",
            text: `✅ <b>تم تعيين حسابك كأدمن للبوت بنجاح!</b>\nالـ ID الخاص بك: <code>${newAdminId}</code>\nيمكنك الآن استقبال طلبات مراجعة الكاش وإدارة المشتركين عبر الأمر /admin`
          });
        }
        return;
      }

      // Admin callbacks
      if (data.startsWith("approve:")) {
        if (!isAdmin) return;
        const orderId = data.split(":")[1];
        await processOrderDecision(orderId, "approve");
        return;
      }

      if (data.startsWith("reject:")) {
        if (!isAdmin) return;
        const orderId = data.split(":")[1];
        await processOrderDecision(orderId, "reject");
        return;
      }

      if (data.startsWith("suspend:")) {
        if (!isAdmin) return;
        const devId = data.split(":")[1];
        const res = await toggleSubscriptionStatus(devId, "suspended", true);
        if (res.ok) {
          await tgApi("sendMessage", {
            chat_id: chatId,
            parse_mode: "HTML",
            text: `🚫 <b>تم قطع الاشتراك فوراً عن الجهاز:</b> <code>${devId}</code>\nتم قفل الأداة عند العميل.`,
            reply_markup: {
              inline_keyboard: [[{ text: "✅ إعادة تفعيل هذا الجهاز الآن", callback_data: `unsuspend:${devId}` }]]
            }
          });
        }
        return;
      }

      if (data.startsWith("unsuspend:")) {
        if (!isAdmin) return;
        const devId = data.split(":")[1];
        const res = await toggleSubscriptionStatus(devId, "active", true);
        if (res.ok) {
          await tgApi("sendMessage", {
            chat_id: chatId,
            parse_mode: "HTML",
            text: `✅ <b>تم إعادة تفعيل الاشتراك للجهاز:</b> <code>${devId}</code>`,
            reply_markup: {
              inline_keyboard: [
                [
                  { text: "🚫 قطع الاشتراك", callback_data: `suspend:${devId}` },
                  { text: "🗑 حذف نهائي وقفل الأداة", callback_data: `delete_sub:${devId}` }
                ]
              ]
            }
          });
        }
        return;
      }

      if (data.startsWith("delete_sub:")) {
        if (!isAdmin) return;
        const devId = data.split(":")[1];
        const res = await permanentlyDeleteSubscription(devId, true);
        if (res.ok) {
          await tgApi("sendMessage", {
            chat_id: chatId,
            parse_mode: "HTML",
            text: `🗑 <b>تم الحذف النهائي للجهاز:</b> <code>${devId}</code>\nتم مسح التفعيل وقفل الأداة نهائياً عند العميل.`
          });
        }
        return;
      }

      if (data === "admin_home" && isAdmin) {
        const activeCount = db.licenses.filter((x) => x.status === "active").length;
        const suspCount = db.licenses.filter((x) => x.status === "suspended").length;
        const pendingCount = db.orders.filter((x) => x.status === "pending").length;
        const methodsTxt = getEnabledPaymentMethods().map((m) => `• ${m.name}: <code>${m.account}</code>`).join("\n");

        await tgApi("sendMessage", {
          chat_id: chatId,
          parse_mode: "HTML",
          text:
            `👑 <b>لوحة تحكم الأدمن الاحترافية — SH12 Pro</b>\n` +
            `━━━━━━━━━━━━━━\n` +
            `🟢 اشتراكات شغالة: <b>${activeCount}</b>\n` +
            `🔴 اشتراكات مقطوعة: <b>${suspCount}</b>\n` +
            `⏳ طلبات كاش بانتظار المراجعة: <b>${pendingCount}</b>\n` +
            `👥 مستخدمي البوت: <b>${db.botUsers.length}</b>\n` +
            `💵 السعر الحالي: <b>${db.settings.planPrice}</b>\n` +
            `━━━━━━━━━━━━━━\n` +
            `💳 <b>طرق الدفع المفعّلة حالياً:</b>\n${methodsTxt}`,
          reply_markup: {
            inline_keyboard: [
              [{ text: "👥 المشتركين (قطع / إعادة تفعيل فوري)", callback_data: "admin_subs" }],
              [{ text: "🔑 توليد سيريال فوري لجهاز", callback_data: "admin_gen" }],
              [{ text: "📢 إرسال رسالة جماعية للعملاء (Broadcast)", callback_data: "admin_broadcast" }]
            ]
          }
        });
        return;
      }

      if (data === "admin_subs" && isAdmin) {
        if (db.licenses.length === 0) {
          await tgApi("sendMessage", { chat_id: chatId, text: "لا يوجد مشتركون حتى الآن." });
          return;
        }
        const rows = db.licenses.slice(0, 18).map((l) => {
          const isAct = l.status === "active";
          return [
            {
              text: `${isAct ? "🟢" : "🔴"} ${l.customerName} (${l.deviceId}) — ${isAct ? "قطع 🚫" : "تفعيل ✅"}`,
              callback_data: `${isAct ? "suspend" : "unsuspend"}:${l.deviceId}`
            },
            {
              text: `🗑 حذف نهائي`,
              callback_data: `delete_sub:${l.deviceId}`
            }
          ];
        });
        await tgApi("sendMessage", {
          chat_id: chatId,
          parse_mode: "HTML",
          text: `👥 <b>قائمة المشتركين (اضغط على أي مشترك لقطع الاشتراك أو إعادة تفعيله فوراً):</b>`,
          reply_markup: { inline_keyboard: rows }
        });
        return;
      }

      if (data === "admin_gen" && isAdmin) {
        userSessions.set(String(chatId), { step: "ADMIN_GEN_KEY", deviceId: "" });
        await tgApi("sendMessage", {
          chat_id: chatId,
          parse_mode: "HTML",
          text: `🔑 أرسل الآن <b>سيريال الجهاز (Device ID)</b> لتوليد وتفعيل كود له فوراً:`
        });
        return;
      }

      if (data === "admin_broadcast" && isAdmin) {
        userSessions.set(String(chatId), { step: "ADMIN_BROADCAST", deviceId: "" });
        await tgApi("sendMessage", {
          chat_id: chatId,
          parse_mode: "HTML",
          text: `📢 أرسل الآن <b>نص الرسالة الجماعية</b> التي تريد إرسالها لجميع مستخدمي البوت والمشتركين:`
        });
        return;
      }
    }

    if (!update.message) return;
    const msg = update.message;
    const chatId = msg.chat.id;
    const text = (msg.text || "").trim();
    const firstName = (msg.from && msg.from.first_name) || "عميل";
    const username = (msg.from && msg.from.username) || "";
    const isAdmin = String(chatId) === String(db.settings.adminChatId);

    registerBotUser(chatId, firstName, username);

    if (text === "/id") {
      const kb = [];
      if (!db.settings.adminChatId) {
        kb.push([{ text: "👑 تعيين نفسي كأدمن للبوت", callback_data: `set_admin:${chatId}` }]);
      }
      await tgApi("sendMessage", {
        chat_id: chatId,
        parse_mode: "HTML",
        text: `🆔 <b>معرّف حسابك في تيليجرام (Chat ID) هو:</b>\n<code>${chatId}</code>`,
        reply_markup: kb.length ? { inline_keyboard: kb } : undefined
      });
      return;
    }

    if (text === "/admin" && isAdmin) {
      const activeCount = db.licenses.filter((x) => x.status === "active").length;
      const suspCount = db.licenses.filter((x) => x.status === "suspended").length;
      await tgApi("sendMessage", {
        chat_id: chatId,
        parse_mode: "HTML",
        text:
          `👑 <b>لوحة تحكم الأدمن — SH12 Pro</b>\n` +
          `🟢 شغال: <b>${activeCount}</b> | 🔴 مقطوع: <b>${suspCount}</b>`,
        reply_markup: {
          inline_keyboard: [
            [{ text: "👥 إدارة المشتركين (قطع / تفعيل)", callback_data: "admin_subs" }],
            [{ text: "🔑 توليد سيريال فوري لجهاز", callback_data: "admin_gen" }],
            [{ text: "📢 إرسال إشعار جماعي للعملاء", callback_data: "admin_broadcast" }]
          ]
        }
      });
      return;
    }

    if (text.startsWith("/start")) {
      const parts = text.split(" ");
      const param = parts[1] ? extractAndNormalizeDeviceId(parts[1]) : null;
      await sendWelcomeScreen(chatId, firstName, param);
      return;
    }

    const session = userSessions.get(String(chatId));

    // Admin Broadcast
    if (session && session.step === "ADMIN_BROADCAST" && isAdmin && text) {
      userSessions.delete(String(chatId));
      const targets = new Set();
      db.botUsers.forEach((u) => targets.add(String(u.chatId)));
      db.licenses.forEach((l) => {
        if (l.telegramId && !String(l.telegramId).startsWith("SIM-")) targets.add(String(l.telegramId));
      });
      let sentCount = 0;
      for (const tid of targets) {
        const r = await tgApi("sendMessage", {
          chat_id: tid,
          parse_mode: "HTML",
          text: `📢 <b>إشعار من إدارة SH12 Pro:</b>\n\n${text}`
        });
        if (r && r.ok) sentCount++;
      }
      await tgApi("sendMessage", {
        chat_id: chatId,
        parse_mode: "HTML",
        text: `✅ تم إرسال الرسالة الجماعية بنجاح إلى <b>${sentCount}</b> مستخدم!`
      });
      return;
    }

    // Admin instant key generation
    if (session && session.step === "ADMIN_GEN_KEY" && isAdmin && text) {
      const normId = extractAndNormalizeDeviceId(text);
      if (!normId) {
        await tgApi("sendMessage", {
          chat_id: chatId,
          text: "❌ صيغة سيريال الجهاز غير صحيحة. يجب أن تكون مثل: ID-XXXX-XXXX-XXXX"
        });
        return;
      }
      const lic = upsertLicense({ deviceId: normId, customerName: "تفعيل فوري من الأدمن", status: "active" });
      userSessions.delete(String(chatId));
      await tgApi("sendMessage", {
        chat_id: chatId,
        parse_mode: "HTML",
        text:
          `✅ <b>تم توليد وتفعيل السيريال بنجاح!</b>\n\n` +
          `🖥 الجهاز: <code>${lic.deviceId}</code>\n` +
          `🔑 كود التفعيل:\n<code>${lic.licenseKey}</code>`,
        reply_markup: {
          inline_keyboard: [[{ text: "🚫 قطع الاشتراك عن هذا الجهاز", callback_data: `suspend:${lic.deviceId}` }]]
        }
      });
      return;
    }

    // Customer Step 1: Sending Device ID -> Show Multiple Payment Methods
    if (text && (!session || session.step === "AWAITING_DEVICE_ID" || extractAndNormalizeDeviceId(text))) {
      const normId = extractAndNormalizeDeviceId(text);
      if (normId) {
        userSessions.set(String(chatId), { step: "AWAITING_PAYMENT_METHOD", deviceId: normId, methodId: "", methodName: "" });
        await sendPaymentMethodPicker(chatId, normId);
        return;
      } else if (session && session.step === "AWAITING_DEVICE_ID") {
        await tgApi("sendMessage", {
          chat_id: chatId,
          parse_mode: "HTML",
          text:
            `⚠️ <b>صيغة سيريال الجهاز غير صحيحة!</b>\n` +
            `يرجى نسخ سيريال الهاردوير من داخل أداة SH12 Pro وإرساله كما هو (مثال: <code>ID-A1B2-C3D4-E5F6</code>).`
        });
        return;
      }
    }

    // Customer Step 3: Sending Screenshot Photo
    const hasPhoto =
      (Array.isArray(msg.photo) && msg.photo.length > 0) ||
      (msg.document && msg.document.mime_type && msg.document.mime_type.startsWith("image/"));
    if (hasPhoto) {
      let devId = session && session.deviceId;
      if (!devId && msg.caption) {
        devId = extractAndNormalizeDeviceId(msg.caption);
      }
      if (!devId) {
        userSessions.set(String(chatId), { step: "AWAITING_DEVICE_ID", deviceId: "" });
        await tgApi("sendMessage", {
          chat_id: chatId,
          parse_mode: "HTML",
          text: `⚠️ من فضلك أرسل <b>سيريال الجهاز (Device ID)</b> أولاً قبل إرسال صورة التحويل!`
        });
        return;
      }

      const fileId = Array.isArray(msg.photo)
        ? msg.photo[msg.photo.length - 1].file_id
        : msg.document.file_id;

      const methodName = (session && session.methodName) || getEnabledPaymentMethods()[0].name;
      const orderId = "ORD-" + Math.random().toString(36).substring(2, 7).toUpperCase();
      const order = {
        orderId,
        telegramId: String(chatId),
        telegramUsername: username,
        customerName: firstName,
        deviceId: devId,
        paymentMethodName: methodName,
        price: db.settings.planPrice,
        photoFileId: fileId,
        photoDataUrl: "",
        status: "pending",
        licenseKey: "",
        createdAt: new Date().toISOString(),
        adminMsgId: null,
        adminMsgIsPhoto: true
      };
      db.orders.unshift(order);
      saveDb();
      userSessions.delete(String(chatId));

      await tgApi("sendMessage", {
        chat_id: chatId,
        parse_mode: "HTML",
        text:
          `⏳ <b>تم استلام صورة الإيصال بنجاح!</b>\n` +
          `📋 رقم الطلب: <code>#${orderId}</code>\n` +
          `💳 وسيلة الدفع: <b>${methodName}</b>\n` +
          `🖥 سيريال الجهاز: <code>${devId}</code>\n\n` +
          `جاري مراجعة التحويل من الإدارة، وهيوصلك <b>سيريال التفعيل</b> هنا في البوت تلقائياً فور القبول ✅`
      });

      if (db.settings.adminChatId) {
        const caption =
          `🔔 <b>طلب اشتراك جديد (مراجعة إيصال دفع)</b>\n` +
          `━━━━━━━━━━━━━━\n` +
          `📋 <b>رقم الطلب:</b> #${orderId}\n` +
          `👤 <b>العميل:</b> ${firstName} ${username ? "(@" + username + ")" : ""}\n` +
          `🆔 <b>ايدي العميل:</b> <code>${chatId}</code>\n` +
          `💳 <b>وسيلة الدفع:</b> ${methodName}\n` +
          `🖥 <b>سيريال الجهاز:</b> <code>${devId}</code>\n` +
          `💵 <b>المبلغ:</b> ${db.settings.planPrice}\n` +
          `━━━━━━━━━━━━━━\n` +
          `اضغط <b>قبول</b> ليقوم البوت بصناعة سيريال التفعيل وإرساله للعميل تلقائياً:`;

        const sent = await tgApi("sendPhoto", {
          chat_id: db.settings.adminChatId,
          photo: fileId,
          parse_mode: "HTML",
          caption,
          reply_markup: {
            inline_keyboard: [
              [
                { text: "✅ قبول وإرسال السيريال تلقائياً", callback_data: `approve:${orderId}` },
                { text: "❌ رفض الطلب", callback_data: `reject:${orderId}` }
              ]
            ]
          }
        });
        if (sent && sent.ok && sent.result) {
          order.adminMsgId = sent.result.message_id;
          order.adminMsgIsPhoto = true;
          saveDb();
        }
      }
      return;
    }

    if (session && session.step === "AWAITING_PAYMENT_METHOD") {
      await sendPaymentMethodPicker(chatId, session.deviceId);
      return;
    }

    if (session && session.step === "AWAITING_SCREENSHOT") {
      await tgApi("sendMessage", {
        chat_id: chatId,
        parse_mode: "HTML",
        text: `📸 يرجى إرسال <b>صورة (اسكرين شوت)</b> لإيصال التحويل الخاص بالجهاز <code>${session.deviceId}</code> ليتم إرسالها للمراجعة.`
      });
      return;
    }

    await sendWelcomeScreen(chatId, firstName);
  } catch (err) {
    console.error("Update Handler Error:", err);
  }
}

async function pollTelegramLoop() {
  if (botRunning) return;
  botRunning = true;

  while (botRunning) {
    const token = db.settings.botToken ? db.settings.botToken.trim() : "";
    if (!token) {
      botInfo = { connected: false, username: "", firstName: "", error: "لم يتم إدخال توكن البوت بعد" };
      await new Promise((r) => setTimeout(r, 3000));
      continue;
    }

    if (token !== currentPollingToken) {
      currentPollingToken = token;
      botOffset = 0;
      const me = await tgApi("getMe");
      if (me && me.ok && me.result) {
        botInfo = {
          connected: true,
          username: me.result.username || "",
          firstName: me.result.first_name || "",
          error: ""
        };
        if (me.result.username && db.settings.botUsername !== me.result.username) {
          db.settings.botUsername = me.result.username;
          saveDb();
        }
      } else {
        botInfo = {
          connected: false,
          username: "",
          firstName: "",
          error: (me && me.description) || "توكن البوت غير صالح"
        };
        await new Promise((r) => setTimeout(r, 4000));
        continue;
      }
    }

    const res = await tgApi("getUpdates", {
      offset: botOffset,
      timeout: 20,
      allowed_updates: ["message", "callback_query"]
    });

    if (res && res.ok && Array.isArray(res.result)) {
      for (const upd of res.result) {
        botOffset = upd.update_id + 1;
        await handleTelegramUpdate(upd);
      }
    } else {
      await new Promise((r) => setTimeout(r, 2500));
    }
  }
}

pollTelegramLoop();

/* ======================== HTTP SERVER & REST API ======================== */
function sendJson(res, status, data) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type"
  });
  res.end(JSON.stringify(data));
}

function readJsonBody(req) {
  return new Promise((resolve) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 8 * 1024 * 1024) req.destroy();
    });
    req.on("end", () => {
      try {
        resolve(JSON.parse(body || "{}"));
      } catch (e) {
        resolve({});
      }
    });
  });
}

const server = http.createServer(async (req, res) => {
  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type"
    });
    return res.end();
  }

  const u = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  const pathname = u.pathname;

  if (pathname === "/api/public-config" && req.method === "GET") {
    return sendJson(res, 200, {
      ok: true,
      planPrice: db.settings.planPrice,
      botUsername: db.settings.botUsername,
      supportUsername: db.settings.supportUsername || "vvshiko",
      paymentMethods: getEnabledPaymentMethods()
    });
  }

  if (pathname === "/api/verify" && req.method === "GET") {
    const devId = extractAndNormalizeDeviceId(u.searchParams.get("deviceId") || "");
    const key = normalizeLicenseKey(u.searchParams.get("key") || "");

    if (!devId) {
      return sendJson(res, 400, { ok: false, status: "invalid", message: "Device ID غير صالح" });
    }

    const existing = db.licenses.find((x) => x.deviceId === devId);
    const isRevoked = Array.isArray(db.revokedDevices) && db.revokedDevices.includes(devId);

    if (isRevoked && !existing) {
      return sendJson(res, 200, {
        ok: false,
        status: "deleted",
        message: "🚫 تم حذف وإلغاء اشتراك هذا الجهاز نهائياً من الإدارة! تواصل مع @" + (db.settings.supportUsername || "vvshiko")
      });
    }

    if (existing && existing.status === "suspended") {
      existing.lastSeenAt = new Date().toISOString();
      saveDb();
      return sendJson(res, 200, {
        ok: false,
        status: "suspended",
        message: "⛔ تم قطع/إيقاف اشتراك هذا الجهاز من الإدارة. تواصل مع الدعم @" + (db.settings.supportUsername || "vvshiko")
      });
    }

    if (!key || !isLicenseValid(devId, key)) {
      return sendJson(res, 200, {
        ok: false,
        status: "unlicensed",
        planPrice: db.settings.planPrice,
        botUsername: db.settings.botUsername
      });
    }

    if (!existing) {
      const created = upsertLicense({
        deviceId: devId,
        customerName: "مشترك مفعّل",
        status: "active"
      });
      created.lastSeenAt = new Date().toISOString();
      saveDb();
    } else {
      existing.lastSeenAt = new Date().toISOString();
      saveDb();
    }

    return sendJson(res, 200, {
      ok: true,
      status: "active",
      deviceId: devId,
      planPrice: db.settings.planPrice,
      botUsername: db.settings.botUsername
    });
  }

  if (pathname === "/api/tg-photo" && req.method === "GET") {
    const fileId = u.searchParams.get("file_id");
    if (!fileId || !db.settings.botToken) {
      res.writeHead(404);
      return res.end("Not found");
    }
    const fInfo = await tgApi("getFile", { file_id: fileId });
    if (!fInfo || !fInfo.ok || !fInfo.result || !fInfo.result.file_path) {
      res.writeHead(404);
      return res.end("File not found");
    }
    const fileUrl = `https://api.telegram.org/file/bot${db.settings.botToken.trim()}/${fInfo.result.file_path}`;
    https
      .get(fileUrl, (tgRes) => {
        res.writeHead(200, { "Content-Type": tgRes.headers["content-type"] || "image/jpeg" });
        tgRes.pipe(res);
      })
      .on("error", () => {
        res.writeHead(500);
        res.end();
      });
    return;
  }

  if (pathname === "/api/admin/state" && req.method === "GET") {
    return sendJson(res, 200, {
      ok: true,
      settings: db.settings,
      botInfo,
      licenses: db.licenses,
      orders: db.orders,
      botUsersCount: db.botUsers.length
    });
  }

  if (pathname === "/api/admin/settings" && req.method === "POST") {
    const body = await readJsonBody(req);
    const fields = ["botToken", "adminChatId", "botUsername", "planPrice", "supportUsername", "serverUrl"];
    fields.forEach((f) => {
      if (typeof body[f] === "string") db.settings[f] = body[f].trim();
    });
    if (Array.isArray(body.paymentMethods)) {
      db.settings.paymentMethods = body.paymentMethods;
    }
    currentPollingToken = "";
    saveDb();
    return sendJson(res, 200, { ok: true, settings: db.settings });
  }

  // Re-obfuscate extension with custom server URL
  if (pathname === "/api/admin/rebuild-extension" && req.method === "POST") {
    const body = await readJsonBody(req);
    const targetUrl = (body.serverUrl || db.settings.serverUrl || `http://localhost:${PORT}`).trim().replace(/\/+$/, "");
    db.settings.serverUrl = targetUrl;
    saveDb();
    buildAll(targetUrl);
    return sendJson(res, 200, { ok: true, serverUrl: targetUrl });
  }

  if (pathname === "/api/admin/license/create" && req.method === "POST") {
    const body = await readJsonBody(req);
    const normId = extractAndNormalizeDeviceId(body.deviceId);
    if (!normId) {
      return sendJson(res, 400, { ok: false, error: "صيغة سيريال الجهاز غير صحيحة (ID-XXXX-XXXX-XXXX)" });
    }
    const lic = upsertLicense({
      deviceId: normId,
      customerName: body.customerName || "مشترك جديد",
      telegramUsername: body.telegramUsername || "",
      status: "active"
    });
    return sendJson(res, 200, { ok: true, license: lic });
  }

  if (pathname === "/api/admin/license/toggle" && req.method === "POST") {
    const body = await readJsonBody(req);
    const result = await toggleSubscriptionStatus(body.deviceId, body.status, true);
    return sendJson(res, result.ok ? 200 : 400, result);
  }

  if (pathname === "/api/admin/license/delete" && req.method === "POST") {
    const body = await readJsonBody(req);
    const result = await permanentlyDeleteSubscription(body.deviceId, true);
    return sendJson(res, result.ok ? 200 : 400, result);
  }

  if (pathname === "/api/admin/order/decision" && req.method === "POST") {
    const body = await readJsonBody(req);
    const result = await processOrderDecision(body.orderId, body.action);
    return sendJson(res, result.ok ? 200 : 400, result);
  }

  if (pathname === "/api/admin/broadcast" && req.method === "POST") {
    const body = await readJsonBody(req);
    const msgText = (body.message || "").trim();
    if (!msgText) return sendJson(res, 400, { ok: false, error: "أدخل نص الرسالة أولاً" });
    const targets = new Set();
    db.botUsers.forEach((u) => targets.add(String(u.chatId)));
    db.licenses.forEach((l) => {
      if (l.telegramId && !String(l.telegramId).startsWith("SIM-")) targets.add(String(l.telegramId));
    });
    let sentCount = 0;
    for (const tid of targets) {
      const r = await tgApi("sendMessage", {
        chat_id: tid,
        parse_mode: "HTML",
        text: `📢 <b>إشعار من إدارة SH12 Pro:</b>\n\n${msgText}`
      });
      if (r && r.ok) sentCount++;
    }
    return sendJson(res, 200, { ok: true, sentCount });
  }

  if (pathname === "/api/sim/order" && req.method === "POST") {
    const body = await readJsonBody(req);
    const normId = extractAndNormalizeDeviceId(body.deviceId);
    if (!normId) {
      return sendJson(res, 400, { ok: false, error: "صيغة سيريال الجهاز غير صحيحة" });
    }
    const orderId = "ORD-" + Math.random().toString(36).substring(2, 7).toUpperCase();
    const order = {
      orderId,
      telegramId: "SIM-" + Date.now(),
      telegramUsername: body.telegramUsername || "test_buyer",
      customerName: body.customerName || "عميل تجريبي",
      deviceId: normId,
      paymentMethodName: body.paymentMethodName || "🔴 فودافون كاش",
      price: db.settings.planPrice,
      photoFileId: "",
      photoDataUrl: body.photoDataUrl || "",
      status: "pending",
      licenseKey: "",
      createdAt: new Date().toISOString()
    };
    db.orders.unshift(order);
    saveDb();

    if (db.settings.botToken && db.settings.adminChatId) {
      const sent = await tgApi("sendMessage", {
        chat_id: db.settings.adminChatId,
        parse_mode: "HTML",
        text:
          `🔔 <b>طلب اشتراك جديد (من محاكي الاختبار)</b>\n` +
          `📋 الطلب: #${orderId}\n` +
          `👤 العميل: ${order.customerName}\n` +
          `💳 طريقة الدفع: ${order.paymentMethodName}\n` +
          `🖥 الجهاز: <code>${normId}</code>\n` +
          `💵 المبلغ: ${order.price}`,
        reply_markup: {
          inline_keyboard: [
            [
              { text: "✅ قبول وإرسال السيريال تلقائياً", callback_data: `approve:${orderId}` },
              { text: "❌ رفض الطلب", callback_data: `reject:${orderId}` }
            ]
          ]
        }
      });
      if (sent && sent.ok && sent.result) {
        order.adminMsgId = sent.result.message_id;
        order.adminMsgIsPhoto = false;
        saveDb();
      }
    }

    return sendJson(res, 200, { ok: true, order });
  }

  if (pathname.startsWith("/ext/")) {
    const rel = pathname.slice(5);
    const extPath = path.join(__dirname, "..", "SH12 Pro", rel);
    if (fs.existsSync(extPath) && fs.statSync(extPath).isFile()) {
      const ext = path.extname(extPath).toLowerCase();
      const mime =
        ext === ".html"
          ? "text/html; charset=utf-8"
          : ext === ".js"
          ? "application/javascript; charset=utf-8"
          : ext === ".png"
          ? "image/png"
          : "application/octet-stream";
      res.writeHead(200, { "Content-Type": mime });
      return fs.createReadStream(extPath).pipe(res);
    }
  }

  let filePath = path.join(PUBLIC_DIR, pathname === "/" ? "index.html" : pathname);
  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    const ext = path.extname(filePath).toLowerCase();
    const mime =
      ext === ".html"
        ? "text/html; charset=utf-8"
        : ext === ".js"
        ? "application/javascript; charset=utf-8"
        : ext === ".css"
        ? "text/css; charset=utf-8"
        : ext === ".png"
        ? "image/png"
        : ext === ".jpg" || ext === ".jpeg"
        ? "image/jpeg"
        : "text/plain; charset=utf-8";
    res.writeHead(200, { "Content-Type": mime });
    return fs.createReadStream(filePath).pipe(res);
  }

  res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
  res.end("404 Not Found");
});

server.listen(PORT, () => {
  console.log(`====================================================`);
  console.log(`🚀 SH12 Pro Ultra Subscription Server & Bot Running!`);
  console.log(`🌐 Admin Dashboard: http://localhost:${PORT}`);
  console.log(`====================================================`);
});

/* SH12 Pro | By @vvshiko — Hardware-Locked & Server-Verified Popup Engine */

const SERVER_API_BASE = "http://localhost:3000";
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function normalizeDeviceId(raw) {
  let s = String(raw || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (s.startsWith("ID")) s = s.slice(2);
  if (s.length !== 12) return null;
  return "ID-" + s.slice(0, 4) + "-" + s.slice(4, 8) + "-" + s.slice(8, 12);
}

/* ---------- Hardware Fingerprinting Engine (Persistent HWID across reinstalls) ---------- */
async function computeHardwareDeviceId() {
  const signals = [];

  // 1. CPU, Memory & Platform Hardware
  try {
    signals.push("PLAT:" + (navigator.platform || ""));
    signals.push("CORES:" + (navigator.hardwareConcurrency || 0));
    signals.push("MEM:" + (navigator.deviceMemory || 0));
    signals.push("TOUCH:" + (navigator.maxTouchPoints || 0));
  } catch (e) {}

  // 2. High-Entropy OS Architecture & Bitness (Independent of Chrome version updates)
  try {
    if (navigator.userAgentData && navigator.userAgentData.getHighEntropyValues) {
      const he = await navigator.userAgentData.getHighEntropyValues(["architecture", "bitness", "platform"]);
      signals.push("ARCH:" + (he.architecture || "") + "|" + (he.bitness || "") + "|" + (he.platform || ""));
    }
  } catch (e) {}

  // 3. Physical Monitor & Display Specs
  try {
    const sw = Math.max(screen.width || 0, screen.height || 0);
    const sh = Math.min(screen.width || 0, screen.height || 0);
    signals.push("SCR:" + sw + "x" + sh + "x" + (screen.colorDepth || 24) + "x" + (screen.pixelDepth || 24));
  } catch (e) {}

  // 4. WebGL Unmasked Physical GPU Vendor, Renderer & Hardware Limits
  try {
    const canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl") || canvas.getContext("experimental-webgl");
    if (gl) {
      const dbg = gl.getExtension("WEBGL_debug_renderer_info");
      if (dbg) {
        signals.push("GPU_V:" + (gl.getParameter(dbg.UNMASKED_VENDOR_WEBGL) || ""));
        signals.push("GPU_R:" + (gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) || ""));
      }
      const params = [
        gl.MAX_TEXTURE_SIZE,
        gl.MAX_CUBE_MAP_TEXTURE_SIZE,
        gl.MAX_RENDERBUFFER_SIZE,
        gl.MAX_VERTEX_ATTRIBS,
        gl.MAX_VERTEX_UNIFORM_VECTORS,
        gl.MAX_FRAGMENT_UNIFORM_VECTORS,
        gl.MAX_VARYING_VECTORS
      ];
      signals.push("GL_P:" + params.map((p) => gl.getParameter(p)).join(","));
      const vp = gl.getParameter(gl.MAX_VIEWPORT_DIMS);
      if (vp) signals.push("GL_VP:" + vp[0] + "x" + vp[1]);
    }
  } catch (e) {}

  // 5. Canvas 2D GPU Sub-pixel Raster Signature
  try {
    const c2d = document.createElement("canvas");
    c2d.width = 220;
    c2d.height = 45;
    const ctx = c2d.getContext("2d");
    if (ctx) {
      ctx.textBaseline = "alphabetic";
      ctx.fillStyle = "#f60";
      ctx.fillRect(10, 1, 62, 20);
      ctx.fillStyle = "#069";
      ctx.font = "14px Arial";
      ctx.fillText("SH12-HWID-@vvshiko", 2, 15);
      ctx.fillStyle = "rgba(102, 204, 0, 0.7)";
      ctx.font = "16px Georgia";
      ctx.fillText("SH12-PRO-LOCK", 4, 34);
      signals.push("C2D:" + c2d.toDataURL());
    }
  } catch (e) {}

  // 6. Audio Hardware Sample Rate & Channels
  try {
    const AudioCtx = window.OfflineAudioContext || window.AudioContext || window.webkitAudioContext;
    if (AudioCtx) {
      const actx = new (window.AudioContext || window.webkitAudioContext)();
      signals.push("AUD:" + actx.sampleRate + "|" + (actx.destination && actx.destination.maxChannelCount));
      if (actx.close) actx.close();
    }
  } catch (e) {}

  // 7. System Timezone
  try {
    signals.push("TZ:" + (Intl.DateTimeFormat().resolvedOptions().timeZone || ""));
  } catch (e) {}

  const rawFingerprint = signals.join("||");

  // 128-bit 64-round hardware hash -> ID-XXXX-XXXX-XXXX
  let s0 = 0x53483132 >>> 0;
  let s1 = 0x48574944 >>> 0;
  let s2 = 0x56565348 >>> 0;
  let s3 = 0x494b4f39 >>> 0;

  for (let i = 0; i < rawFingerprint.length; i++) {
    const ch = rawFingerprint.charCodeAt(i);
    s0 = Math.imul(s0 ^ ch, 0x85ebca6b) >>> 0;
    s1 = Math.imul(s1 ^ ((s0 << 13) | (s0 >>> 19)), 0xc2b2ae35) >>> 0;
    s2 = Math.imul(s2 ^ ((s1 << 15) | (s1 >>> 17)) ^ ch, 0x27d4eb2f) >>> 0;
    s3 = Math.imul(s3 ^ ((s2 << 11) | (s2 >>> 21)), 0x165667b1) >>> 0;
  }

  for (let r = 0; r < 32; r++) {
    const t = s0;
    s0 = (s1 + ((s3 << 7) | (s3 >>> 25))) >>> 0;
    s1 = (s2 ^ s0) >>> 0;
    s2 = (s3 + t) >>> 0;
    s3 = (t ^ s1 ^ Math.imul(r, 0x9e3779b9)) >>> 0;
  }

  const words = [s0, s1, s2];
  const blocks = [];
  for (let b = 0; b < 3; b++) {
    let w = words[b];
    let part = "";
    for (let c = 0; c < 4; c++) {
      part += ALPHABET[(w ^ (w >>> 16)) & 31];
      w = Math.imul(w >>> 5, 0x45d9f3b) >>> 0;
    }
    blocks.push(part);
  }
  return "ID-" + blocks.join("-");
}

function generateSimDeviceId() {
  const arr = new Uint8Array(12);
  crypto.getRandomValues(arr);
  let s = "";
  for (let i = 0; i < 12; i++) s += ALPHABET[arr[i] & 31];
  return "ID-" + s.slice(0, 4) + "-" + s.slice(4, 8) + "-" + s.slice(8, 12);
}

function computeLicenseKey(deviceId) {
  const norm = normalizeDeviceId(deviceId);
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

/* ---------- Anti-Tamper & Self-Defense Verification ---------- */
function verifyIntegrity() {
  try {
    const html = document.body ? document.body.innerHTML : "";
    if (!html.includes("vvshiko") || !html.includes("SH12")) return false;
    if (typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.getManifest) {
      const m = chrome.runtime.getManifest();
      if (!m || !String(m.name || "").includes("SH12") || !String(m.author || "").includes("vvshiko")) {
        return false;
      }
    }
    return true;
  } catch (e) {
    return true;
  }
}

document.addEventListener("contextmenu", (e) => e.preventDefault());
document.addEventListener("keydown", (e) => {
  if (
    e.key === "F12" ||
    (e.ctrlKey && e.shiftKey && ["I", "J", "C"].includes(e.key.toUpperCase())) ||
    (e.ctrlKey && e.key.toUpperCase() === "U")
  ) {
    e.preventDefault();
  }
});

/* Safe wrappers for Chrome Extension APIs + standalone browser preview fallback */
const hasChromeStorage = typeof chrome !== "undefined" && chrome.storage && chrome.storage.local;
const hasChromeTabs = typeof chrome !== "undefined" && chrome.tabs && chrome.tabs.query;

function storageGet(keys, cb) {
  if (hasChromeStorage) {
    chrome.storage.local.get(keys, cb);
  } else {
    const out = {};
    keys.forEach((k) => {
      const val = localStorage.getItem(k);
      if (val !== null) out[k] = val;
    });
    setTimeout(() => cb(out), 0);
  }
}

function storageSet(obj, cb) {
  if (hasChromeStorage) {
    chrome.storage.local.set(obj, () => {
      try {
        if (chrome.storage.sync && (obj.gapt_device_id !== undefined || obj.gapt_license !== undefined)) {
          const syncObj = {};
          if (obj.gapt_device_id !== undefined) syncObj.gapt_device_id = obj.gapt_device_id;
          if (obj.gapt_license !== undefined) syncObj.gapt_license = obj.gapt_license;
          chrome.storage.sync.set(syncObj);
        }
      } catch (e) {}
      if (cb) cb();
    });
  } else {
    Object.keys(obj).forEach((k) => localStorage.setItem(k, obj[k]));
    if (cb) setTimeout(cb, 0);
  }
}

function openExternalUrl(url) {
  if (hasChromeTabs) {
    chrome.tabs.create({ url });
  } else {
    window.open(url, "_blank", "noopener,noreferrer");
  }
}

/* Only 2 Languages: Egyptian Arabic (eg) & English (en) */
const I18N = {
  eg: {
    dir: "rtl",
    byText: "تطوير وبرمجة",
    planBadge: "💎 خطة دفع لمرة واحدة بس",
    planTag: "مدى الحياة · Lifetime",
    planTitle: "اشتراك SH12 Pro الدائم (تدفعه مرة واحدة بس)",
    planDesc: "امتلك الأداة مدى الحياة على جهازك من غير أي اشتراك شهري ولا مصاريف تجديد.",
    feat1: "فتح كل طبقات التفعيل (12 شهر + طبقات الـ 6 شهور التراكمية)",
    feat2: "دفع لمرة واحدة فقط — تفعيل مربوط ببصمة جهازك مدى الحياة",
    feat3: "نظام حماية ذكي بيفحص السعر ($0.00) قبل ما تدفع",
    feat4: "تفعيل أوتوماتيك عن طريق بوت التليجرام ودعم مباشر",
    lblDeviceId: "سيريال الهاردوير الثابت لجهازك (ابعته للبوت عشان تستلم كود التفعيل):",
    txtCopyDevice: "انسخ السيريال",
    txtDeviceCopied: "اتنسخ ✓",
    txtBuyTelegram: "اشترك دلوقتي عبر بوت التفعيل (@SH12Pro_Sub_bot)",
    txtSupportBtn: "الدعم الفني",
    txtPasteKey: "لصق",
    txtThemeDark: "🌙 دارك",
    txtThemeLight: "☀️ وايت",
    lblEnterKey: "🔑 معاك سيريال التفعيل؟ اكتبه أو دوس لصق لفتح الأداة مدى الحياة:",
    txtActivateBtn: "تفعيل دلوقتي",
    licErrInvalid: "❌ كود التفعيل ده مش مظبوط لبصمة جهازك، اتأكد منه أو كلم الدعم @vvshiko",
    licErrSuspended: "⛔ تم قطع / إيقاف اشتراك الجهاز ده من الإدارة! تواصل مع الدعم @vvshiko",
    licErrDeleted: "🚫 تم حذف وإلغاء اشتراك الجهاز ده نهائياً من الإدارة! تواصل مع @vvshiko",
    licOkSuccess: "✅ تم تفعيل اشتراك مدى الحياة بنجاح! جاري فتح الأداة...",
    txtLifetimeActive: "اشتراك مدى الحياة شغال",
    txtRelock: "قفل للتجربة",
    tgMsg: (devId) =>
      `/start ${devId}`,
    subBanner: "سجّل دخول بالحساب اللي عايز تفعّله (ريجون أمريكي U.S)، واختار الطبقة من تحت",
    txtOpenPlans: "افتح الخطط",
    txtRefresh: "ريفرش للصفحة",
    txtZip: "انسخ 97201",
    txtZipCopied: "اتنسخ خلاص ✓",
    lblLayers: "طبقة التفعيل (بتشتغل تلقائي؛ اعمل ريفرش للصفحة مرة واحدة بس)",
    optOff: "قفل التفعيل (مقفول)",
    tagOff: "مقفول",
    opt12m: "الطبقة الأولى · 12 شهر",
    tag12m: "أول مرة",
    opt6mss: "الطبقة التانية · 6 شهور (SS)",
    tag6mss: "تزويد مدة",
    opt6m: "الطبقة التالتة · 6 شهور",
    tag6m: "تزويد مدة",
    opt6m2: "طبقة احتياطية · 6 شهور",
    tag6m2: "بديل",
    guideTitle: "📌 الخلاصة وخطوات التشغيل بالترتيب",
    linkSubs: "إلغاء التجديد ↗",
    footRights: "كل الحقوق محفوظة ©",
    layerNames: {
      off: "مقفول",
      "12m": "12 شهر",
      "6m_ss": "6 شهور (SS)",
      "6m": "6 شهور",
      "6m_2": "6 شهور (بديل)"
    },
    stateActive: (lbl) => `الأداة شغالة تمام: ${lbl} — دوس دلوقتي على Get discount`,
    stateInactive: "مفيش تفعيل شغال في الصفحة دي (افتح one.google.com/plans واعمل ريفرش)",
    steps: [
      ["افتح صفحة ", "one.google.com/plans", " واتأكد إن الإيميل بتاعك هو اللي ظاهر فوق."],
      ["اختار الطبقة من فوق ← اعمل ", "ريفرش للصفحة", " ← اتأكد إن علامة SH12 Pro بقت خضراء تحت عاليمين."],
      ["دوس على زرار ", "Get discount", " في كارت AI Pro عشان تفتح شاشة الدفع."],
      ["بص على الشريط اللي هيظهرلك فوق: ", "أخضر = مجاني 100% وأمان", "؛ لو أحمر اوعى تكمل!"],
      ["ضيف الفيزا واكتب الرمز البريدي المعفي من الضرايب ", "97201", " ← اتأكد إن السعر $0.00 واشترك."],
      ["عشان تزود المدة (Stack): ارجع للأداة، اختار الطبقة اللي بعدها، اعمل ريفرش، ودوس تاني."],
      ["لما تخلص خالص، ادخل على ", "play.google.com", " والغي التجديد التلقائي عشان ميسحبش بعدين."]
    ]
  },

  en: {
    dir: "ltr",
    byText: "Developed by",
    planBadge: "💎 One-Time Payment Plan",
    planTag: "Lifetime Access",
    planTitle: "SH12 Pro Lifetime License (Single Payment)",
    planDesc: "Unlock the full tool forever on your PC with a single one-time payment — no monthly fees or renewals.",
    feat1: "Unlock all injection layers (12-Month + 6-Month Stacking layers)",
    feat2: "One-time payment only — permanently bound to your PC Hardware ID",
    feat3: "Smart checkout guard to verify $0.00 free trial terms before subscribing",
    feat4: "Automated Telegram Bot activation & direct support",
    lblDeviceId: "Your Hardware Device ID (Send this to the Bot to receive your license key):",
    txtCopyDevice: "Copy HWID",
    txtDeviceCopied: "Copied ✓",
    txtBuyTelegram: "Subscribe via Official Bot (@SH12Pro_Sub_bot)",
    txtSupportBtn: "Support",
    txtPasteKey: "Paste",
    txtThemeDark: "🌙 Dark",
    txtThemeLight: "☀️ White",
    lblEnterKey: "🔑 Have a License Key? Paste it below to unlock forever:",
    txtActivateBtn: "Activate Now",
    licErrInvalid: "❌ Invalid license key for this Hardware ID. Please verify or contact Support @vvshiko",
    licErrSuspended: "⛔ Your subscription has been suspended by Admin! Contact Support @vvshiko",
    licErrDeleted: "🚫 This device subscription has been permanently deleted by Admin! Contact @vvshiko",
    licOkSuccess: "✅ Lifetime subscription activated! Unlocking SH12 Pro...",
    txtLifetimeActive: "Lifetime Plan Active",
    txtRelock: "Lock (Test)",
    tgMsg: (devId) =>
      `/start ${devId}`,
    subBanner: "Sign in to the target account (U.S. region), then select an injection layer",
    txtOpenPlans: "Open Plans",
    txtRefresh: "Refresh Tab",
    txtZip: "Copy 97201",
    txtZipCopied: "Copied ✓",
    lblLayers: "Injection layer (takes effect automatically; refresh the page once)",
    optOff: "Disable injection (Off)",
    tagOff: "Off",
    opt12m: "Layer 1 · 12 Months",
    tag12m: "First-time",
    opt6mss: "Layer 2 · 6 Months (SS)",
    tag6mss: "Stack",
    opt6m: "Layer 3 · 6 Months",
    tag6m: "Stack",
    opt6m2: "Backup Layer · 6 Months",
    tag6m2: "Alternate",
    guideTitle: "📌 Quick Activation Guide",
    linkSubs: "Subscriptions ↗",
    footRights: "All Rights Reserved ©",
    layerNames: {
      off: "Disabled",
      "12m": "12 Months",
      "6m_ss": "6 Months (SS)",
      "6m": "6 Months",
      "6m_2": "6 Months (Backup)"
    },
    stateActive: (lbl) => `SH12 Pro Active: ${lbl} — You can now click Get discount`,
    stateInactive: "No active injection on this tab (open one.google.com/plans & refresh)",
    steps: [
      ["Open ", "one.google.com/plans", " and confirm the target email is shown at the top."],
      ["Select a layer above → click ", "Refresh Tab", " → confirm the active badge appears at the bottom right."],
      ["Click ", "Get discount", " on the AI Pro card to open the Play checkout window."],
      ["Check the top guard banner: ", "Green = Free Trial ($0.00)", "; do NOT proceed if it is red."],
      ["Add a card (U.S. tax-free ZIP code ", "97201", ") → verify the total is $0.00 → subscribe."],
      ["Stack the next layer: return here, switch layers, refresh the tab, and click again."],
      ["When finished, go to ", "play.google.com", " and turn off automatic renewal."]
    ]
  }
};

let currentLang = "eg";
let currentTheme = "dark";
let currentDeviceId = "";
let savedLicenseKey = "";
let isSuspendedByAdmin = false;
let isUnlocked = false;
let serverBotUsername = "SH12Pro_Sub_bot";
let serverPlanPrice = "";
let lastRespState = null;

const stateEl = document.getElementById("state");
const stateTextEl = document.getElementById("stateText");
const stepsListEl = document.getElementById("stepsList");
const themeBtn = document.getElementById("themeBtn");
const licenseGateEl = document.getElementById("licenseGate");
const appContentEl = document.getElementById("appContent");
const deviceIdTextEl = document.getElementById("deviceIdText");
const unlockedDeviceIdEl = document.getElementById("unlockedDeviceId");
const licenseInputEl = document.getElementById("licenseInput");
const licMsgEl = document.getElementById("licMsg");

function notifyParentTestbench() {
  try {
    if (window.parent && window.parent !== window) {
      window.parent.postMessage(
        { type: "sh12_status", deviceId: currentDeviceId, unlocked: isUnlocked, suspended: isSuspendedByAdmin },
        "*"
      );
    }
  } catch (e) {}
}

function updateLockView() {
  if (!verifyIntegrity()) {
    licenseGateEl.classList.add("active");
    appContentEl.classList.add("locked");
    return;
  }
  if (unlockedDeviceIdEl && currentDeviceId) {
    unlockedDeviceIdEl.textContent = currentDeviceId;
  }
  if (isUnlocked && !isSuspendedByAdmin) {
    licenseGateEl.classList.remove("active");
    appContentEl.classList.remove("locked");
  } else {
    licenseGateEl.classList.add("active");
    appContentEl.classList.add("locked");
    if (isSuspendedByAdmin) {
      const t = I18N[currentLang] || I18N.eg;
      licMsgEl.className = "lic-msg err";
      licMsgEl.textContent = t.licErrSuspended;
    }
  }
  notifyParentTestbench();
}

async function checkServerSubscription() {
  if (!currentDeviceId) return;
  try {
    const url = `${SERVER_API_BASE}/api/verify?deviceId=${encodeURIComponent(currentDeviceId)}&key=${encodeURIComponent(savedLicenseKey || "")}`;
    const res = await fetch(url, { cache: "no-store" });
    const data = await res.json();
    if (data.botUsername) serverBotUsername = data.botUsername;
    if (data.planPrice) serverPlanPrice = data.planPrice;

    if (data.status === "deleted") {
      isSuspendedByAdmin = true;
      isUnlocked = false;
      savedLicenseKey = "";
      if (licenseInputEl) licenseInputEl.value = "";
      storageSet({ gapt_license: "", gapt_suspended: "1", gapt_layer: "off" });
      updateLockView();
      const t = I18N[currentLang] || I18N.eg;
      licMsgEl.className = "lic-msg err";
      licMsgEl.textContent = t.licErrDeleted;
      if (hasChromeTabs) {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
          const tab = tabs && tabs[0];
          if (tab) {
            chrome.tabs.sendMessage(tab.id, { type: "setLayer", layer: "off", lang: currentLang }, () => {
              void chrome.runtime.lastError;
            });
          }
        });
      }
    } else if (data.status === "suspended") {
      isSuspendedByAdmin = true;
      isUnlocked = false;
      storageSet({ gapt_suspended: "1" });
      updateLockView();
      if (hasChromeTabs) {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
          const tab = tabs && tabs[0];
          if (tab) {
            chrome.tabs.sendMessage(tab.id, { type: "setLayer", layer: "off", lang: currentLang }, () => {
              void chrome.runtime.lastError;
            });
          }
        });
      }
    } else if (data.status === "active" && isLicenseValid(currentDeviceId, savedLicenseKey)) {
      const wasLocked = !isUnlocked || isSuspendedByAdmin;
      isSuspendedByAdmin = false;
      isUnlocked = true;
      storageSet({ gapt_suspended: "0" });
      if (wasLocked) {
        licMsgEl.className = "lic-msg";
        licMsgEl.textContent = "";
        updateLockView();
        queryTab();
      }
    }
  } catch (e) {}
}

function renderSteps(stepsArr) {
  stepsListEl.textContent = "";
  stepsArr.forEach((parts) => {
    const li = document.createElement("li");
    parts.forEach((part, idx) => {
      if (idx % 2 === 1) {
        const b = document.createElement("b");
        b.textContent = part;
        li.appendChild(b);
      } else {
        li.appendChild(document.createTextNode(part));
      }
    });
    stepsListEl.appendChild(li);
  });
}

function applyLanguage(lang) {
  if (!I18N[lang]) lang = "eg";
  currentLang = lang;
  const t = I18N[lang];

  document.documentElement.lang = lang === "eg" ? "ar-EG" : "en";
  document.documentElement.dir = t.dir;

  document.querySelectorAll(".lang-btn").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.lang === lang);
  });

  const ids = [
    "byText",
    "planBadge", "planTag", "planTitle", "planDesc",
    "feat1", "feat2", "feat3", "feat4",
    "lblDeviceId", "txtCopyDevice", "txtBuyTelegram", "txtSupportBtn", "txtPasteKey",
    "lblEnterKey", "txtActivateBtn", "txtLifetimeActive", "txtRelock",
    "subBanner", "txtOpenPlans", "txtRefresh", "txtZip",
    "lblLayers", "optOff", "tagOff", "opt12m", "tag12m",
    "opt6mss", "tag6mss", "opt6m", "tag6m", "opt6m2", "tag6m2",
    "guideTitle", "linkSubs", "footRights"
  ];
  ids.forEach((id) => {
    const el = document.getElementById(id);
    if (el && t[id]) el.textContent = t[id];
  });

  applyTheme(currentTheme);
  renderSteps(t.steps);
  paintState(lastRespState);
}

function applyTheme(theme) {
  currentTheme = theme === "light" ? "light" : "dark";
  document.documentElement.setAttribute("data-theme", currentTheme);
  const t = I18N[currentLang] || I18N.eg;
  if (themeBtn) {
    themeBtn.textContent = currentTheme === "dark" ? t.txtThemeLight : t.txtThemeDark;
  }
}

function paintState(st) {
  lastRespState = st;
  const t = I18N[currentLang] || I18N.eg;
  const layer = (st && st.layer) || "off";
  const mounted = !!(st && st.mounted) && layer !== "off";
  stateEl.className = mounted ? "ok" : "warn";
  const label = t.layerNames[layer] || layer;
  stateTextEl.textContent = mounted ? t.stateActive(label) : t.stateInactive;
}

function queryTab() {
  if (!isUnlocked || isSuspendedByAdmin) return;
  if (!hasChromeTabs) {
    const checkedEl = document.querySelector("input[name=layer]:checked");
    const selectedLayer = (checkedEl && checkedEl.value) || "12m";
    return paintState({ layer: selectedLayer, mounted: selectedLayer !== "off" });
  }
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const t = tabs && tabs[0];
    if (!t) return paintState(null);
    chrome.tabs.sendMessage(t.id, { type: "getState" }, (resp) => {
      if (chrome.runtime.lastError || !resp) return paintState(null);
      paintState(resp);
    });
  });
}

// Language switcher listeners
document.querySelectorAll(".lang-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    const lang = btn.dataset.lang;
    applyLanguage(lang);
    if (!isSuspendedByAdmin) {
      licMsgEl.className = "lic-msg";
      licMsgEl.textContent = "";
    } else {
      licMsgEl.textContent = (I18N[currentLang] || I18N.eg).licErrSuspended;
    }
    storageSet({ gapt_lang: lang });
    if (hasChromeTabs) {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        const t = tabs && tabs[0];
        if (t) {
          chrome.tabs.sendMessage(t.id, { type: "setLang", lang }, () => {
            void chrome.runtime.lastError;
          });
        }
      });
    }
  });
});

// Theme toggle listener
themeBtn.addEventListener("click", () => {
  const next = currentTheme === "dark" ? "light" : "dark";
  applyTheme(next);
  storageSet({ gapt_theme: next });
  try {
    if (window.parent && window.parent !== window) {
      window.parent.postMessage({ type: "sh12_theme_changed", theme: next }, "*");
    }
  } catch (e) {}
});

// Paste key button listener
const btnPasteKey = document.getElementById("btnPasteKey");
if (btnPasteKey) {
  btnPasteKey.addEventListener("click", async () => {
    try {
      const clip = await navigator.clipboard.readText();
      if (clip) {
        licenseInputEl.value = clip.trim();
        licenseInputEl.dispatchEvent(new Event("input"));
      }
    } catch (e) {
      licenseInputEl.focus();
    }
  });
}

// Subscription Gate Actions
document.getElementById("btnCopyDevice").addEventListener("click", () => {
  if (!currentDeviceId) return;
  navigator.clipboard.writeText(currentDeviceId).then(() => {
    const el = document.getElementById("txtCopyDevice");
    const t = I18N[currentLang] || I18N.eg;
    el.textContent = t.txtDeviceCopied;
    setTimeout(() => {
      el.textContent = (I18N[currentLang] || I18N.eg).txtCopyDevice;
    }, 1500);
  });
});

document.getElementById("btnBuyTelegram").addEventListener("click", () => {
  if (currentDeviceId) {
    navigator.clipboard.writeText(currentDeviceId).catch(() => {});
  }
  const botUser = (serverBotUsername || "SH12Pro_Sub_bot").replace(/^@/, "");
  openExternalUrl(`https://t.me/${botUser}?start=${encodeURIComponent(currentDeviceId || "")}`);
});

// Re-lock button for testing
const btnRelock = document.getElementById("btnRelock");
if (btnRelock) {
  btnRelock.addEventListener("click", () => {
    savedLicenseKey = "";
    isSuspendedByAdmin = false;
    storageSet({ gapt_license: "", gapt_suspended: "0", gapt_layer: "off" }, () => {
      isUnlocked = false;
      licenseInputEl.value = "";
      licMsgEl.className = "lic-msg";
      licMsgEl.textContent = "";
      updateLockView();
      if (hasChromeTabs) {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
          const tab = tabs && tabs[0];
          if (tab) {
            chrome.tabs.sendMessage(tab.id, { type: "setLayer", layer: "off", lang: currentLang }, () => {
              void chrome.runtime.lastError;
            });
          }
        });
      }
    });
  });
}

// Format license key input automatically
licenseInputEl.addEventListener("input", () => {
  let raw = licenseInputEl.value.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (raw.startsWith("SH12")) {
    raw = raw.slice(4);
  }
  raw = raw.slice(0, 16);
  const parts = [];
  for (let i = 0; i < raw.length; i += 4) {
    parts.push(raw.slice(i, i + 4));
  }
  licenseInputEl.value = raw.length > 0 ? "SH12-" + parts.join("-") : "";
  if (!isSuspendedByAdmin) {
    licMsgEl.className = "lic-msg";
    licMsgEl.textContent = "";
  }
});

async function handleActivate() {
  const t = I18N[currentLang] || I18N.eg;
  const candidate = normalizeLicenseKey(licenseInputEl.value);
  if (!isLicenseValid(currentDeviceId, candidate)) {
    licMsgEl.className = "lic-msg err";
    licMsgEl.textContent = t.licErrInvalid;
    return;
  }

  try {
    const res = await fetch(
      `${SERVER_API_BASE}/api/verify?deviceId=${encodeURIComponent(currentDeviceId)}&key=${encodeURIComponent(candidate)}`,
      { cache: "no-store" }
    );
    const data = await res.json();
    if (data.status === "deleted") {
      isSuspendedByAdmin = true;
      isUnlocked = false;
      savedLicenseKey = "";
      if (licenseInputEl) licenseInputEl.value = "";
      storageSet({ gapt_license: "", gapt_suspended: "1", gapt_layer: "off" });
      updateLockView();
      licMsgEl.className = "lic-msg err";
      licMsgEl.textContent = t.licErrDeleted;
      return;
    } else if (data.status === "suspended") {
      isSuspendedByAdmin = true;
      storageSet({ gapt_suspended: "1", gapt_license: candidate });
      licMsgEl.className = "lic-msg err";
      licMsgEl.textContent = t.licErrSuspended;
      return;
    }
  } catch (e) {}

  isSuspendedByAdmin = false;
  savedLicenseKey = candidate;
  licMsgEl.className = "lic-msg ok";
  licMsgEl.textContent = t.licOkSuccess;

  storageGet(["gapt_layer"], (r) => {
    const nextLayer = (r && r.gapt_layer && r.gapt_layer !== "off") ? r.gapt_layer : "12m";
    storageSet({ gapt_license: candidate, gapt_suspended: "0", gapt_layer: nextLayer }, () => {
      document.querySelectorAll("input[name=layer]").forEach((el) => {
        el.checked = el.value === nextLayer;
      });

      setTimeout(() => {
        isUnlocked = true;
        updateLockView();
        if (hasChromeTabs) {
          chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            const tab = tabs && tabs[0];
            if (tab) {
              chrome.tabs.sendMessage(tab.id, { type: "setLayer", layer: nextLayer, lang: currentLang }, () => {
                void chrome.runtime.lastError;
                setTimeout(queryTab, 250);
              });
            }
          });
        } else {
          queryTab();
        }
      }, 450);
    });
  });
}

document.getElementById("btnActivate").addEventListener("click", handleActivate);
licenseInputEl.addEventListener("keydown", (e) => {
  if (e.key === "Enter") handleActivate();
});

// Quick Actions
document.getElementById("btnOpenPlans").addEventListener("click", () => {
  openExternalUrl("https://one.google.com/plans");
});

document.getElementById("btnRefresh").addEventListener("click", () => {
  if (hasChromeTabs) {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const t = tabs && tabs[0];
      if (t) {
        chrome.tabs.reload(t.id);
        setTimeout(queryTab, 900);
      }
    });
  } else {
    queryTab();
  }
});

document.getElementById("btnZip").addEventListener("click", () => {
  navigator.clipboard.writeText("97201").then(() => {
    const zipEl = document.getElementById("txtZip");
    const t = I18N[currentLang] || I18N.eg;
    zipEl.textContent = t.txtZipCopied;
    setTimeout(() => {
      zipEl.textContent = (I18N[currentLang] || I18N.eg).txtZip;
    }, 1500);
  });
});

// Allow Live Testbench parent window to inject key, check server, or restore HWID
window.addEventListener("message", async (ev) => {
  const d = ev.data;
  if (!d) return;
  if (d.type === "sh12_fill_key" && d.key) {
    licenseInputEl.value = d.key;
    handleActivate();
  }
  if (d.type === "sh12_check_server") {
    checkServerSubscription();
  }
  if (d.type === "sh12_set_theme" && d.theme) {
    applyTheme(d.theme);
    storageSet({ gapt_theme: d.theme });
  }
  if (d.type === "sh12_new_device") {
    const newId = d.useRealHwid ? await computeHardwareDeviceId() : generateSimDeviceId();
    savedLicenseKey = "";
    isSuspendedByAdmin = false;
    storageSet({ gapt_device_id: newId, gapt_license: "", gapt_suspended: "0" }, () => {
      currentDeviceId = newId;
      deviceIdTextEl.textContent = newId;
      isUnlocked = false;
      licenseInputEl.value = "";
      licMsgEl.className = "lic-msg";
      licMsgEl.textContent = "";
      updateLockView();
    });
  }
});

// Initial load: ALWAYS compute deterministic Hardware Fingerprint ID!
storageGet(["gapt_layer", "gapt_lang", "gapt_theme", "gapt_license", "gapt_suspended"], async (r) => {
  const lang = r && r.gapt_lang === "en" ? "en" : "eg";
  const theme = (r && r.gapt_theme) || "dark";
  const layer = (r && r.gapt_layer) || "12m";

  applyTheme(theme);
  applyLanguage(lang);

  // Compute deterministic Hardware Fingerprint ID for this physical machine
  const hwid = await computeHardwareDeviceId();

  const finalizeInit = (devId, licKey, suspendedFlag) => {
    currentDeviceId = devId;
    savedLicenseKey = licKey || "";
    isSuspendedByAdmin = suspendedFlag === "1";
    deviceIdTextEl.textContent = devId;
    if (unlockedDeviceIdEl) unlockedDeviceIdEl.textContent = devId;
    isUnlocked = isLicenseValid(devId, licKey) && !isSuspendedByAdmin;
    updateLockView();

    document.querySelectorAll("input[name=layer]").forEach((el) => {
      el.checked = el.value === layer;
      el.addEventListener("change", () => {
        if (!el.checked || !isUnlocked || isSuspendedByAdmin) return;
        storageSet({ gapt_layer: el.value }, () => {
          if (hasChromeTabs) {
            chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
              const t = tabs && tabs[0];
              if (!t) return queryTab();
              chrome.tabs.sendMessage(t.id, { type: "setLayer", layer: el.value, lang: currentLang }, () => {
                void chrome.runtime.lastError;
                setTimeout(queryTab, 300);
              });
            });
          } else {
            queryTab();
          }
        });
      });
    });

    if (isUnlocked) {
      queryTab();
      setTimeout(queryTab, 800);
    }
    checkServerSubscription();
  };

  let localLic = r && r.gapt_license;
  let localSusp = (r && r.gapt_suspended) || "0";

  storageSet({ gapt_device_id: hwid });

  if (isLicenseValid(hwid, localLic)) {
    finalizeInit(hwid, localLic, localSusp);
  } else if (hasChromeStorage && chrome.storage.sync) {
    try {
      chrome.storage.sync.get(["gapt_license"], (sr) => {
        const syncLic = sr && sr.gapt_license;
        const finalLic = isLicenseValid(hwid, syncLic) ? syncLic : "";
        if (finalLic) storageSet({ gapt_license: finalLic });
        finalizeInit(hwid, finalLic, localSusp);
      });
    } catch (e) {
      finalizeInit(hwid, "", localSusp);
    }
  } else {
    finalizeInit(hwid, "", localSusp);
  }
});

setInterval(() => {
  queryTab();
  checkServerSubscription();
}, 2500);

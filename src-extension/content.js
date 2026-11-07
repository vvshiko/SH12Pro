/* SH12 Pro | By @vvshiko — Hardware-Locked Content Script */
(() => {
  const SERVER_API_BASE = "http://localhost:3000";
  const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

  function normalizeDeviceId(raw) {
    let s = String(raw || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (s.startsWith("ID")) s = s.slice(2);
    if (s.length !== 12) return null;
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

  let lastState = { layer: "off", mounted: false, lang: "eg", licensed: false };

  function push(layer, lang, licensed) {
    const effectiveLayer = licensed ? (layer || "off") : "off";
    const normLang = lang === "en" ? "en" : "eg";
    try {
      document.documentElement.setAttribute("data-gapt-layer", effectiveLayer);
      document.documentElement.setAttribute("data-gapt-licensed", licensed ? "1" : "0");
      document.documentElement.setAttribute("data-gapt-lang", normLang);
    } catch (e) {}
    window.postMessage(
      { __gapt: 1, type: "cfg", layer: effectiveLayer, lang: normLang, licensed: !!licensed },
      "*"
    );
  }

  function loadAndPush(overrideLayer, overrideLang) {
    try {
      chrome.storage.local.get(["gapt_layer", "gapt_lang", "gapt_device_id", "gapt_license", "gapt_suspended"], (r) => {
        const devId = r && r.gapt_device_id;
        const licKey = r && r.gapt_license;
        const isSusp = r && r.gapt_suspended === "1";
        const licensed = !isSusp && isLicenseValid(devId, licKey);
        const layer = overrideLayer || (r && r.gapt_layer ? r.gapt_layer : "12m");
        const lang = overrideLang || (r && r.gapt_lang === "en" ? "en" : "eg");
        push(layer, lang, licensed);

        if (devId && licKey) {
          fetch(`${SERVER_API_BASE}/api/verify?deviceId=${encodeURIComponent(devId)}&key=${encodeURIComponent(licKey)}`, {
            cache: "no-store"
          })
            .then((res) => res.json())
            .then((data) => {
              if (data.status === "deleted") {
                chrome.storage.local.set({ gapt_license: "", gapt_suspended: "1", gapt_layer: "off" });
                push("off", lang, false);
              } else if (data.status === "suspended" && !isSusp) {
                chrome.storage.local.set({ gapt_suspended: "1" });
                push("off", lang, false);
              } else if (data.status === "active" && isSusp) {
                chrome.storage.local.set({ gapt_suspended: "0" });
                push(layer, lang, true);
              }
            })
            .catch(() => {});
        }
      });
    } catch (e) {
      push("off", "eg", false);
    }
  }

  window.addEventListener("message", (ev) => {
    const d = ev.data;
    if (d && d.__gapt === 1 && d.type === "state" && d.state) lastState = d.state;
  });

  try {
    chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
      if (!msg) return;
      if (msg.type === "getState") {
        window.postMessage({ __gapt: 1, type: "ping" }, "*");
        setTimeout(() => sendResponse(lastState), 150);
        return true;
      }
      if (msg.type === "setLayer") {
        loadAndPush(msg.layer, msg.lang);
        setTimeout(() => sendResponse({ ok: true, state: lastState }), 150);
        return true;
      }
      if (msg.type === "setLang") {
        window.postMessage({ __gapt: 1, type: "lang", lang: msg.lang === "en" ? "en" : "eg" }, "*");
        setTimeout(() => sendResponse({ ok: true }), 100);
        return true;
      }
    });
    chrome.storage.onChanged.addListener(() => {
      loadAndPush();
    });
  } catch (e) {}

  loadAndPush();
  setTimeout(() => loadAndPush(), 800);
  setTimeout(() => loadAndPush(), 2500);
})();

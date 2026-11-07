/* SH12 Pro | By @vvshiko — MAIN world Injection Engine */
(() => {
  if (window.__GAPT_HOOKED) return;
  window.__GAPT_HOOKED = true;

  const PREFIX = "subs:com.google.android.apps.subscriptions.red:";

  const TOKENS = {
    "12m": "AVbCH/cspB8VdqKJ+ax/uPxUFAVuYRPX4iSjtg4Fu0PG9zUeURSM7y//LlQva1dCd/rbKVM6EJmyiG/C9BoQ95pMl8yDCHuiwCvM5CuGJME=",
    "6m_ss": "AVbCH/cgl4zvPT2Lqw95Gn+RYAJIVwFwi783i6uVprX7u3MCa5J4CcTXH5RABa5WjBrUoQnwf8vI10TNV7ktd26myIdxqIwGmNoJ5ofYNqpQ10RKoSvHs75wsfA=",
    "6m": "AVbCH/fUON3w8hpfeutprA3BMQwrBwYIB6Y8CSWi1isDCDswKUUhGQ3dluj5WXsNKOvr8K5UULBGrRsf4KlW1rHLz0fF3SvxQhBFRbBOHCA=",
    "6m_2": "AVbCH/cJ5SeHgkVRt+bdcrapx/aLSu2kbsBgMdI413zbllDNsNQoC/zVlG/Npbu55WlMzBwWPhUedIvZFDg7fw0CmCv/8DKj04IZ21pK7mrV/hh5"
  };
  const YT_FREE_TOK = "AVbCH/eW4Nfp8KBl0zlm7x9PhaiCvpnqwUuL2D8NFPBQgmM9+HuYS1h2xH5lLWU/BsBj775LK5GqK8UHKqoSzhDDz+PqP3paNesqLU0r9i6XCrYa";

  let currentTest = null;
  let subId = null;
  let currentLang = "eg";
  let isLicensed = false;

  const BADGE_I18N = {
    en: {
      locked: "SH12 Pro · License Required",
      disabled: "SH12 Pro · Disabled",
      active: "SH12 Pro · Active",
      stack: "Renewal stack",
      layers: { "12m": "12 Months", "6m_ss": "6 Months (SS)", "6m": "6 Months", "6m_2": "6 Months (Backup)" }
    },
    eg: {
      locked: "SH12 Pro · غير مفعّل (اشترك للتشغيل)",
      disabled: "SH12 Pro · مقفول",
      active: "SH12 Pro · شغال",
      stack: "تزويد مدة",
      layers: { "12m": "12 شهر", "6m_ss": "6 شهور (SS)", "6m": "6 شهور", "6m_2": "6 شهور (بديل)" }
    }
  };

  function makeCfg(layer) {
    if (!isLicensed || !layer || layer === "off" || !TOKENS[layer]) return null;
    return {
      name: "gapt_" + layer,
      full_items: [
        [[PREFIX + "g1.2tb.ai.subs_variant", 21], null, null, null, 1, [TOKENS[layer]]],
        [[PREFIX + "g1.youtube_premium_individual_add_on", 21], null, null, null, 1, [YT_FREE_TOK]]
      ],
      ear8: null
    };
  }

  let badge = null;
  function showBadge(text, active, locked) {
    try {
      if (!document.body) return;
      if (!badge) {
        badge = document.createElement("div");
        badge.style.cssText =
          "position:fixed;right:16px;bottom:16px;z-index:2147483647;" +
          "padding:9px 14px;border-radius:14px;font:700 12px/1.5 'Segoe UI',-apple-system,Roboto,Tahoma,sans-serif;" +
          "box-shadow:0 10px 30px rgba(0,0,0,.6);backdrop-filter:blur(14px);" +
          "display:flex;align-items:center;gap:9px;max-width:340px;transition:all .25s ease;";
        document.body.appendChild(badge);
      }
      const dotColor = active ? "#10b981" : locked ? "#f59e0b" : "#a1a1aa";
      const bg = active ? "linear-gradient(135deg, #050507, #141418)" : "rgba(9,9,11,0.95)";
      const border = active
        ? "1px solid rgba(255,255,255,0.45)"
        : locked
        ? "1px solid rgba(245,158,11,0.5)"
        : "1px solid rgba(255,255,255,0.2)";
      badge.style.background = bg;
      badge.style.border = border;
      badge.style.color = "#ffffff";
      badge.dir = currentLang === "en" ? "ltr" : "rtl";
      badge.textContent = "";
      const brandPill = document.createElement("span");
      brandPill.style.cssText =
        "display:inline-flex;align-items:center;gap:3px;font-style:italic;font-weight:900;font-size:11.5px;letter-spacing:-0.3px;color:#fff;flex-shrink:0;";
      brandPill.innerHTML =
        "SH12<span style='background:#fff;color:#000;border-radius:99px;padding:0 5px;font-size:9.5px;margin-inline-start:2px;'>Pro</span>";
      const dot = document.createElement("span");
      dot.style.cssText =
        "width:8px;height:8px;border-radius:50%;flex-shrink:0;background:" +
        dotColor +
        (active ? ";box-shadow:0 0 8px #10b981;" : locked ? ";box-shadow:0 0 8px #f59e0b;" : ";");
      const labelSpan = document.createElement("span");
      labelSpan.textContent = text;
      badge.appendChild(brandPill);
      badge.appendChild(dot);
      badge.appendChild(labelSpan);
    } catch (e) {}
  }

  function refreshBadge() {
    const dict = BADGE_I18N[currentLang] || BADGE_I18N.eg;
    if (!isLicensed) {
      showBadge("🔒 " + dict.locked, false, true);
    } else if (!currentTest) {
      showBadge(dict.disabled, false, false);
    } else {
      const label = dict.layers[currentTest.layer] || currentTest.layer;
      showBadge(dict.active + " · " + label + (subId ? " · " + dict.stack : ""), true, false);
    }
  }

  function patchNode(node) {
    if (!Array.isArray(node) || !currentTest || !Array.isArray(currentTest.full_items)) return false;
    let patched = false;
    if (node.length > 12 && Array.isArray(node[12])) {
      if (Array.isArray(node[7]) && Array.isArray(node[7][5]) && node[7][5].length > 0) subId = node[7][5][0];
      node[12] = currentTest.full_items;
      const mode = (currentTest.ear8 && currentTest.ear8[1]) || 5;
      if (currentTest.ear8) node[7] = currentTest.ear8;
      else if (Array.isArray(node[7]) && Array.isArray(node[7][5]) && node[7][5].length > 0) node[7][1] = mode;
      else if (subId) node[7] = [null, mode, null, null, null, [subId]];
      patched = true;
    }
    if (node.length > 10 && Array.isArray(node[10]) && Array.isArray(node[10][0])) {
      node[10] = [currentTest.full_items];
      if (Array.isArray(node[2]) && Array.isArray(node[2][2]) && Array.isArray(node[2][2][8])) {
        node[2][2][8] = [currentTest.full_items];
      }
      if (currentTest.ear8) node[6] = currentTest.ear8;
      patched = true;
    }
    return patched;
  }

  function rewriteFreq(bodyStr) {
    if (typeof bodyStr !== "string" || !bodyStr.includes("f.req=") || !currentTest) return bodyStr;
    try {
      const parts = bodyStr.split("&");
      for (let i = 0; i < parts.length; i++) {
        if (parts[i].startsWith("f.req=")) {
          const raw = decodeURIComponent(parts[i].slice(6).replace(/\+/g, " "));
          const outer = JSON.parse(raw);
          let changed = false;
          if (Array.isArray(outer)) {
            for (const group of outer) {
              if (!Array.isArray(group)) continue;
              for (const call of group) {
                if (Array.isArray(call) && call[0] === "Ngbm" && typeof call[1] === "string") {
                  const payload = JSON.parse(call[1]);
                  if (Array.isArray(payload)) {
                    if (patchNode(payload[0])) changed = true;
                    if (patchNode(payload[1])) changed = true;
                  }
                  if (changed) call[1] = JSON.stringify(payload);
                }
              }
            }
          }
          if (changed) {
            parts[i] = "f.req=" + encodeURIComponent(JSON.stringify(outer));
            return parts.join("&");
          }
        }
      }
    } catch (e) {}
    return bodyStr;
  }

  const origSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.send = function (body) {
    try {
      if (typeof body === "string" && body.includes("Ngbm")) body = rewriteFreq(body);
    } catch (e) {}
    return origSend.call(this, body);
  };

  function rewriteUrl(val) {
    const s = String(val || "");
    if (!s.includes("/eacquire/multiline") || !currentTest) return val;
    try {
      const u = new URL(s, location.origin);
      const earStr = u.searchParams.get("ear");
      if (!earStr) return val;
      const ear = JSON.parse(earStr);
      if (Array.isArray(ear[8]) && Array.isArray(ear[8][5]) && ear[8][5].length > 0) subId = ear[8][5][0];
      if (Array.isArray(ear[13]) && Array.isArray(currentTest.full_items)) ear[13][0] = currentTest.full_items;
      if (Array.isArray(ear[4]) && typeof ear[4][0] === "string" && Array.isArray(currentTest.full_items)) {
        try {
          const inner4 = JSON.parse(atob(ear[4][0]));
          if (Array.isArray(inner4) && inner4.length > 8) {
            inner4[8] = [currentTest.full_items];
            ear[4][0] = btoa(JSON.stringify(inner4));
          }
        } catch (e4) {}
      }
      const mode = (currentTest.ear8 && currentTest.ear8[1]) || 5;
      if (currentTest.ear8) ear[8] = currentTest.ear8;
      else if (Array.isArray(ear[8]) && Array.isArray(ear[8][5]) && ear[8][5].length > 0) ear[8][1] = mode;
      else if (subId) ear[8] = [null, mode, null, null, null, [subId]];
      ear[24] = null;
      u.searchParams.set("ear", JSON.stringify(ear));
      return u.toString();
    } catch (e) {
      return val;
    }
  }

  if (window.TrustedTypePolicy && TrustedTypePolicy.prototype.createScriptURL) {
    const origCreate = TrustedTypePolicy.prototype.createScriptURL;
    TrustedTypePolicy.prototype.createScriptURL = function (input, ...args) {
      return origCreate.call(this, rewriteUrl(input), ...args);
    };
  }

  const srcDesc = Object.getOwnPropertyDescriptor(HTMLIFrameElement.prototype, "src");
  if (srcDesc && srcDesc.set) {
    Object.defineProperty(HTMLIFrameElement.prototype, "src", {
      ...srcDesc,
      set(v) {
        if (typeof v === "string") v = rewriteUrl(v);
        return srcDesc.set.call(this, v);
      }
    });
  }
  const origSetAttr = Element.prototype.setAttribute;
  Element.prototype.setAttribute = function (name, val) {
    if (this instanceof HTMLIFrameElement && String(name).toLowerCase() === "src") val = rewriteUrl(String(val));
    return origSetAttr.call(this, name, val);
  };

  function applyLayer(layer, lang, licensed) {
    if (typeof licensed === "boolean") isLicensed = licensed;
    currentLang = lang === "en" ? "en" : "eg";
    const effectiveLayer = isLicensed ? (layer || "off") : "off";
    const cfg = makeCfg(effectiveLayer);
    currentTest = cfg ? Object.assign({ layer: effectiveLayer }, cfg) : null;
    window.__GAPT_READY = true;
    window.__GAPT_STATE = {
      layer: effectiveLayer,
      mounted: !!currentTest,
      lang: currentLang,
      licensed: isLicensed
    };
    refreshBadge();
    try {
      window.postMessage({ __gapt: 1, type: "state", state: window.__GAPT_STATE }, "*");
    } catch (e) {}
  }

  window.addEventListener("message", (ev) => {
    const d = ev.data;
    if (!d || d.__gapt !== 1) return;
    if (d.type === "cfg") applyLayer(d.layer, d.lang, !!d.licensed);
    if (d.type === "lang" && d.lang) {
      currentLang = d.lang === "en" ? "en" : "eg";
      refreshBadge();
    }
    if (d.type === "ping") {
      try {
        window.postMessage(
          {
            __gapt: 1,
            type: "state",
            state: window.__GAPT_STATE || { layer: "off", mounted: false, licensed: isLicensed }
          },
          "*"
        );
      } catch (e) {}
    }
  });

  const attrCfg = document.documentElement.getAttribute("data-gapt-layer");
  const attrLang = document.documentElement.getAttribute("data-gapt-lang");
  const attrLic = document.documentElement.getAttribute("data-gapt-licensed") === "1";
  applyLayer(attrCfg || "off", attrLang || "eg", attrLic);
  document.addEventListener("DOMContentLoaded", refreshBadge);
})();

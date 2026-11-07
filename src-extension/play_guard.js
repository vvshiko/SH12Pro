/* SH12 Pro | By @vvshiko — Checkout Price Guard */
(() => {
  if (window.__GAPT_GUARD || window.top === window) return;
  window.__GAPT_GUARD = true;

  const FREE_WORDS = [
    "free trial", "start your free trial", "\u514d\u8d39\u8bd5\u7528",
    "US$0.00", "$0.00", "0,00", "€0.00", "won't be charged",
    "\u4e0d\u4f1a\u5411\u60a8\u6536\u8d39", "\u4e0d\u4f1a\u6536\u8d39",
    "تجربة مجانية", "فترة تجريبية مجانية", "لن يتم تحصيل"
  ];
  const PAID_WORDS = [
    "/mo after", "/month after", "per month after",
    "\u7acb\u5373\u4ed8\u6b3e", "pay now", "\u4eca\u65e5\u6263\u6b3e", "charged today",
    "سيتم تحصيل الرسوم اليوم", "الدفع الآن"
  ];

  let bar = null;
  function paint(kind, text) {
    if (!document.body) return;
    if (!bar) {
      bar = document.createElement("div");
      bar.style.cssText =
        "position:fixed;left:0;right:0;top:0;z-index:2147483647;padding:10px 16px;" +
        "font:600 12.5px/1.5 'Segoe UI',-apple-system,Roboto,Tahoma,sans-serif;text-align:center;" +
        "box-shadow:0 4px 14px rgba(0,0,0,.25);letter-spacing:0.1px;";
      document.body.appendChild(bar);
    }
    bar.style.background =
      kind === "ok"
        ? "linear-gradient(90deg, #059669, #10b981)"
        : kind === "bad"
        ? "linear-gradient(90deg, #b91c1c, #ef4444)"
        : "linear-gradient(90deg, #334155, #475569)";
    bar.style.color = "#fff";
    bar.textContent = text;
  }

  function judge() {
    let t = "";
    try {
      t = ((document.body && document.body.innerText) || "").toLowerCase();
    } catch (e) {
      return;
    }
    if (!t || t.length < 5) return;
    const free = FREE_WORDS.some((w) => t.includes(w.toLowerCase()));
    const paid = PAID_WORDS.some((w) => t.includes(w.toLowerCase()));

    if (free && !paid) {
      paint("ok", "✅ [SH12 Pro] Free trial detected ($0.00) — تجربة مجانية آمنة 100%");
    } else if (paid && !free) {
      paint("bad", "❌ [SH12 Pro] Paid charge detected! Do NOT subscribe — تحذير: يوجد خصم فعلي، اوعى تشترك وغيّر الطبقة!");
    } else if (free && paid) {
      paint("warn", "⚠️ [SH12 Pro] Verify $0.00 total carefully — اتأكد إن الإجمالي $0.00 قبل ما تدوس اشتراك");
    } else {
      paint("warn", "⏳ [SH12 Pro] Checking price terms… — جاري فحص تفاصيل السعر…");
    }
  }

  setTimeout(judge, 1200);
  setTimeout(judge, 3000);
  setTimeout(judge, 6000);
  try {
    const mo = new MutationObserver(() => judge());
    document.addEventListener("DOMContentLoaded", () =>
      mo.observe(document.body, { childList: true, subtree: true, characterData: true })
    );
  } catch (e) {}
})();

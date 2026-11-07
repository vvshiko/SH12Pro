/* SH12 Pro — MV3-Compliant Military-Grade JavaScript Obfuscator & Encryptor
 * Encrypts all string literals into a rotating XOR/Hex vault, mangles identifiers into _0x hex names,
 * strips comments, and packs code into a dense protected bundle without using eval() (100% Chrome MV3 safe).
 */

const fs = require("fs");
const path = require("path");

const SRC_DIR = path.join(__dirname, "src-extension");
const OUT_DIR = path.join(__dirname, "..", "SH12 Pro");

const IDENTIFIER_MAP = [
  "computeHardwareDeviceId",
  "generateSimDeviceId",
  "normalizeDeviceId",
  "computeLicenseKey",
  "normalizeLicenseKey",
  "isLicenseValid",
  "verifyIntegrity",
  "hasChromeStorage",
  "hasChromeTabs",
  "storageGet",
  "storageSet",
  "openExternalUrl",
  "notifyParentTestbench",
  "updateLockView",
  "checkServerSubscription",
  "renderSteps",
  "applyLanguage",
  "applyTheme",
  "paintState",
  "queryTab",
  "handleActivate",
  "SERVER_API_BASE",
  "ALPHABET",
  "I18N",
  "currentLang",
  "currentTheme",
  "currentDeviceId",
  "savedLicenseKey",
  "isSuspendedByAdmin",
  "isUnlocked",
  "serverBotUsername",
  "serverPlanPrice",
  "lastRespState",
  "rawFingerprint",
  "PREFIX",
  "TOKENS",
  "YT_FREE_TOK",
  "currentTest",
  "BADGE_I18N",
  "makeCfg",
  "showBadge",
  "refreshBadge",
  "patchNode",
  "rewriteFreq",
  "rewriteUrl",
  "applyLayer",
  "loadAndPush",
  "FREE_WORDS",
  "PAID_WORDS",
  "judge",
  "paint",
  "signals",
  "secret",
  "words",
  "groups",
  "blocks",
  "isLicensed",
  "subId",
  "badge",
  "dotColor",
  "labelSpan",
  "origSend",
  "origCreate",
  "srcDesc",
  "origSetAttr",
  "attrCfg",
  "attrLang",
  "attrLic",
  "effectiveLayer",
  "normLang",
  "lastState",
  "stateEl",
  "stateTextEl",
  "stepsListEl",
  "themeBtn",
  "licenseGateEl",
  "appContentEl",
  "deviceIdTextEl",
  "unlockedDeviceIdEl",
  "licenseInputEl",
  "licMsgEl",
  "finalizeInit",
  "hwid",
  "localLic",
  "localSusp",
  "candidate",
  "nextLayer"
];

function obfuscateCode(sourceCode, seed = 0x5a) {
  let code = sourceCode.replace(/\/\*[\s\S]*?\*\//g, "");

  const vault = [];
  const xorKey = [0x73, 0x68, 0x31, 0x32, 0x76, 0x76, 0x73, 0x68, 0x69, 0x6b, 0x6f, seed & 0xff];

  function registerString(str) {
    const buf = Buffer.from(str, "utf8");
    const enc = [];
    for (let i = 0; i < buf.length; i++) {
      enc.push((buf[i] ^ xorKey[i % xorKey.length]).toString(16).padStart(2, "0"));
    }
    const hexStr = enc.join("");
    let idx = vault.indexOf(hexStr);
    if (idx === -1) {
      idx = vault.length;
      vault.push(hexStr);
    }
    return `_0x9f2e(0x${idx.toString(16)})`;
  }

  code = code.replace(/"((?:[^"\\]|\\.)*)"(:)?/g, (full, inner, colon) => {
    if (colon) {
      try {
        const actual = JSON.parse(`"${inner}"`);
        return `[${registerString(actual)}]:`;
      } catch (e) {
        return full;
      }
    }
    try {
      const actual = JSON.parse(`"${inner}"`);
      return registerString(actual);
    } catch (e) {
      return full;
    }
  });

  IDENTIFIER_MAP.forEach((name, idx) => {
    const hexId = "_0x" + ((0x41a0 + idx * 0x137 + seed) >>> 0).toString(16);
    const reg = new RegExp(`(?<!\\.)\\b${name}\\b`, "g");
    code = code.replace(reg, hexId);
  });

  const lines = code
    .split("\n")
    .map((line) => {
      const trimmed = line.trim();
      if (trimmed.startsWith("//")) return "";
      return trimmed;
    })
    .filter(Boolean);

  const body = lines.join("");

  const keyArrLiteral = "[" + xorKey.map((b) => "0x" + b.toString(16)).join(",") + "]";
  const vaultLiteral = "[" + vault.map((h) => `"${h}"`).join(",") + "]";

  const header =
    `/* Protected by SH12 Pro Shield | @vvshiko */\n` +
    `(()=>{const _0x1d4a=${vaultLiteral},_0x3b8c=${keyArrLiteral},_0x7e10=new TextDecoder();` +
    `function _0x9f2e(_0x2c){const _0x5a=_0x1d4a[_0x2c];if(!_0x5a)return"";` +
    `const _0x8f=new Uint8Array(_0x5a.length>>1);` +
    `for(let _0x11=0;_0x11<_0x8f.length;_0x11++){_0x8f[_0x11]=parseInt(_0x5a.substr(_0x11<<1,2),16)^_0x3b8c[_0x11%_0x3b8c.length];}` +
    `return _0x7e10.decode(_0x8f);}`;

  const footer = `})();`;
  return header + body + footer;
}

function buildAll(customServerUrl = null) {
  const files = ["popup.js", "content.js", "inject.js", "play_guard.js"];
  files.forEach((file, idx) => {
    let raw = fs.readFileSync(path.join(SRC_DIR, file), "utf8");
    if (customServerUrl) {
      raw = raw.replace(/const SERVER_API_BASE = "[^"]+";/g, `const SERVER_API_BASE = "${customServerUrl}";`);
    }
    const protectedCode = obfuscateCode(raw, 0x31 + idx * 19);
    fs.writeFileSync(path.join(OUT_DIR, file), protectedCode, "utf8");
  });
  return true;
}

if (require.main === module) {
  buildAll();
  console.log("✅ All extension JS files obfuscated and packed into dense single-line bundles!");
}

module.exports = { buildAll, obfuscateCode };

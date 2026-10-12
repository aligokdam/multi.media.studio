// Checks every locale against English: missing/extra keys and {placeholder} mismatches.
// Usage: node scripts/check-locales.mjs
import { readdirSync } from "node:fs";
import { pathToFileURL } from "node:url";
import path from "node:path";

const dir = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../locales");
const en = (await import(pathToFileURL(path.join(dir, "en.js")))).default;
const ph = (s) => (String(s).match(/\{\w+\}/g) || []).sort().join(",");
let problems = 0;
for (const f of readdirSync(dir).filter((f) => /^[a-z]{2,3}\.js$/.test(f) && f !== "en.js")) {
  const d = (await import(pathToFileURL(path.join(dir, f)))).default;
  const missing = Object.keys(en).filter((k) => !(k in d));
  const extra = Object.keys(d).filter((k) => !(k in en));
  const badPh = Object.keys(en).filter((k) => k in d && ph(en[k]) !== ph(d[k]));
  const same = Object.keys(en).filter((k) => d[k] === en[k] && /[a-z]{4,}/.test(en[k]) && !/^(VHS|Glitch|Lo-fi|Ambient|Chill|Video|Ken Burns|Pop|IndexedDB|Mono|Audio|Tint|Normal|Format|Status|Media|Studio|Sinema|Portrait)$/.test(en[k]));
  const n = missing.length + extra.length + badPh.length;
  problems += n;
  console.log(`${f}: ${Object.keys(d).length} keys` + (missing.length ? ` | missing ${missing.length}: ${missing.slice(0, 8).join(", ")}` : "") +
    (extra.length ? ` | extra: ${extra.join(", ")}` : "") + (badPh.length ? ` | placeholders: ${badPh.join(", ")}` : "") +
    (same.length ? ` | untranslated? ${same.length}: ${same.slice(0, 6).join(", ")}` : ""));
}
process.exit(problems ? 1 : 0);

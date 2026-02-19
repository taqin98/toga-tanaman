import fs from "node:fs";
import path from "node:path";

const root = process.cwd();

function read(file) {
  return fs.readFileSync(path.join(root, file), "utf8");
}

function assert(condition, message) {
  if (!condition) {
    console.error(`[SMOKE][FAIL] ${message}`);
    process.exitCode = 1;
    return;
  }
  console.log(`[SMOKE][OK] ${message}`);
}

const mustExist = [
  "index.html",
  "ar.html",
  "offline.html",
  "sw.js",
  "assets/app.js",
  "assets/ar.js",
  "assets/pwa.js",
  "assets/theme.js",
];

mustExist.forEach((file) => {
  assert(fs.existsSync(path.join(root, file)), `File tersedia: ${file}`);
});

const indexHtml = read("index.html");
const arHtml = read("ar.html");
const swJs = read("sw.js");
const appJs = read("assets/app.js");
const pwaJs = read("assets/pwa.js");

assert(indexHtml.includes('id="stateLoading"'), "Index punya state loading");
assert(indexHtml.includes('id="stateError"'), "Index punya state error");
assert(indexHtml.includes('id="stateList"'), "Index punya state list");
assert(indexHtml.includes('id="stateDetail"'), "Index punya state detail");

assert(arHtml.includes('src="assets/ar.js"'), "AR load script eksternal assets/ar.js");
assert(!arHtml.includes("Samakan dengan pola app.js"), "Inline script AR sudah dipindah");

assert(swJs.includes("./offline.html"), "SW punya offline fallback page");
assert(swJs.includes("SKIP_WAITING"), "SW support update flow skip waiting");

assert(appJs.includes("function sanitizeRichText"), "Sanitizer deskripsi tersedia");
assert(
  appJs.includes('$("deskripsi").innerHTML = sanitizeRichText('),
  "Render deskripsi memakai sanitizer"
);

assert(
  pwaJs.includes("promptServiceWorkerUpdate") && pwaJs.includes("controllerchange"),
  "PWA update prompt flow tersedia"
);

if (process.exitCode) {
  process.exit(process.exitCode);
}

console.log("[SMOKE] Semua cek dasar lulus.");

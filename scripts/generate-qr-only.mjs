#!/usr/bin/env node

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const DEFAULT_API_URL =
  "https://script.google.com/macros/s/AKfycbzNJ5nbk41yTxowEorHZendyeW-TvgzfdnnpyTMHGEayTW1KE7zQuk0GHe6fjAQmkukUg/exec";
const DEFAULT_DETAIL_BASE = "https://taqin98.github.io/toga-tanaman/";
const DEFAULT_OUT_DIR = "markers/qr";
const DEFAULT_SIZE = 600;
const DEFAULT_MARGIN = 0;
const DEFAULT_QZONE = 2;
const DEFAULT_BG_COLOR = "ffffff";

function parseArgs(argv) {
  const args = {
    apiUrl: DEFAULT_API_URL,
    detailBase: DEFAULT_DETAIL_BASE,
    outDir: DEFAULT_OUT_DIR,
    size: DEFAULT_SIZE,
    margin: DEFAULT_MARGIN,
    qzone: DEFAULT_QZONE,
    bgColor: DEFAULT_BG_COLOR,
    ids: [],
  };

  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i];
    const val = argv[i + 1];
    if (key === "--api-url" && val) {
      args.apiUrl = val;
      i += 1;
    } else if (key === "--detail-base" && val) {
      args.detailBase = val;
      i += 1;
    } else if (key === "--out-dir" && val) {
      args.outDir = val;
      i += 1;
    } else if (key === "--size" && val) {
      const n = Number(val);
      if (!Number.isFinite(n) || n < 100) {
        throw new Error("Nilai --size tidak valid (min 100).");
      }
      args.size = Math.floor(n);
      i += 1;
    } else if (key === "--margin" && val) {
      const n = Number(val);
      if (!Number.isInteger(n) || n < 0 || n > 50) {
        throw new Error("Nilai --margin tidak valid (0-50).");
      }
      args.margin = n;
      i += 1;
    } else if (key === "--qzone" && val) {
      const n = Number(val);
      if (!Number.isInteger(n) || n < 0 || n > 100) {
        throw new Error("Nilai --qzone tidak valid (0-100).");
      }
      args.qzone = n;
      i += 1;
    } else if (key === "--bgcolor" && val) {
      const color = normalizeQrColor(val);
      if (!color) {
        throw new Error("Nilai --bgcolor tidak valid (contoh: ffffff atau 255-255-255).");
      }
      args.bgColor = color;
      i += 1;
    } else if (key === "--ids" && val) {
      args.ids = val
        .split(",")
        .map((x) => x.trim())
        .filter(Boolean);
      i += 1;
    } else if (key === "--help" || key === "-h") {
      printHelpAndExit();
    }
  }

  return args;
}

function printHelpAndExit() {
  console.log(`
Generate QR PNG dari data tanaman (tanpa .patt)

Pemakaian:
  npm run qr:generate -- [opsi]

Opsi:
  --api-url <url>       Endpoint Apps Script
  --detail-base <url>   Base URL detail tanaman
  --out-dir <path>      Folder output (default: markers/qr)
  --size <number>       Ukuran QR PNG, default 600
  --margin <number>     Margin putih pixel API, default 1
  --qzone <number>      Quiet zone putih per modul, default 0
  --bgcolor <color>     Warna background QR, default ffffff
  --ids <a,b,c>         Filter id tertentu
`);
  process.exit(0);
}

function normalizeQrColor(input) {
  const value = String(input || "").trim();
  if (/^[0-9a-fA-F]{3}([0-9a-fA-F]{3})?$/.test(value)) {
    return value.toLowerCase();
  }
  if (
    /^\d{1,3}-\d{1,3}-\d{1,3}$/.test(value) &&
    value.split("-").every((part) => Number(part) >= 0 && Number(part) <= 255)
  ) {
    return value;
  }
  return null;
}

function buildDetailUrl(detailBase, id) {
  const base = detailBase.trim();
  if (base.includes("?")) {
    return `${base}&id=${encodeURIComponent(id)}`;
  }
  return `${base.replace(/\/?$/, "/")}?id=${encodeURIComponent(id)}`;
}

async function fetchJson(url) {
  const res = await fetch(url, { headers: { accept: "application/json" } });
  if (!res.ok) {
    throw new Error(`Request gagal (${res.status}) untuk ${url}`);
  }
  return res.json();
}

function normalizeItems(payload) {
  if (Array.isArray(payload)) return payload;
  if (payload && typeof payload === "object") {
    if (payload.data && Array.isArray(payload.data)) return payload.data;
    return Object.values(payload);
  }
  return [];
}

async function getPlantItems(apiUrl) {
  const listUrl = `${apiUrl}${apiUrl.includes("?") ? "&" : "?"}mode=list`;
  try {
    const payload = await fetchJson(listUrl);
    const items = normalizeItems(payload).filter(
      (x) => x && typeof x === "object" && String(x.id || "").trim()
    );
    if (items.length > 0) return items;
  } catch {
    // fallback ke endpoint utama
  }

  const fallbackPayload = await fetchJson(apiUrl);
  return normalizeItems(fallbackPayload).filter(
    (x) => x && typeof x === "object" && String(x.id || "").trim()
  );
}

async function fetchQrPng(url, size, options = {}) {
  const params = new URLSearchParams({
    size: `${size}x${size}`,
    data: url,
    margin: String(options.margin ?? DEFAULT_MARGIN),
    qzone: String(options.qzone ?? DEFAULT_QZONE),
    bgcolor: String(options.bgColor || DEFAULT_BG_COLOR),
  });
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?${params.toString()}`;
  const res = await fetch(qrUrl);
  if (!res.ok) {
    throw new Error(`QR request gagal (${res.status})`);
  }
  const arr = await res.arrayBuffer();
  return { buffer: Buffer.from(arr), qrApiUrl: qrUrl };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  console.log(`Mengambil data tanaman dari: ${args.apiUrl}`);

  const items = await getPlantItems(args.apiUrl);
  const selected = args.ids.length
    ? items.filter((x) => args.ids.includes(String(x.id).trim()))
    : items;

  if (selected.length === 0) {
    throw new Error("Tidak ada data tanaman yang bisa diproses.");
  }

  const outDirAbs = path.resolve(args.outDir);
  await mkdir(outDirAbs, { recursive: true });

  const report = [];
  console.log(`Total data diproses: ${selected.length}`);

  for (const item of selected) {
    const id = String(item.id).trim();
    const detailUrl =
      String(item.url_qr || item.url || "").trim() ||
      buildDetailUrl(args.detailBase, id);

    const { buffer, qrApiUrl } = await fetchQrPng(detailUrl, args.size, {
      margin: args.margin,
      qzone: args.qzone,
      bgColor: args.bgColor,
    });
    const outFile = path.join(outDirAbs, `${id}.png`);
    await writeFile(outFile, buffer);

    report.push({
      id,
      detail_url: detailUrl,
      qr_api_url: qrApiUrl,
      qr_file: path.join(args.outDir, `${id}.png`),
    });

    console.log(`- ${id}: generate QR`);
  }

  const reportFile = path.join(outDirAbs, "report.json");
  await writeFile(reportFile, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(`Selesai. Report: ${path.join(args.outDir, "report.json")}`);
}

main().catch((err) => {
  console.error("Gagal generate QR:", err.message);
  process.exit(1);
});

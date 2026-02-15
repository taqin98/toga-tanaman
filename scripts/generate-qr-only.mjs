#!/usr/bin/env node

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const DEFAULT_API_URL =
  "https://script.google.com/macros/s/AKfycbzNJ5nbk41yTxowEorHZendyeW-TvgzfdnnpyTMHGEayTW1KE7zQuk0GHe6fjAQmkukUg/exec";
const DEFAULT_DETAIL_BASE = "https://taqin98.github.io/toga-tanaman/";
const DEFAULT_OUT_DIR = "markers/qr";
const DEFAULT_SIZE = 600;

function parseArgs(argv) {
  const args = {
    apiUrl: DEFAULT_API_URL,
    detailBase: DEFAULT_DETAIL_BASE,
    outDir: DEFAULT_OUT_DIR,
    size: DEFAULT_SIZE,
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
  --ids <a,b,c>         Filter id tertentu
`);
  process.exit(0);
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

async function fetchQrPng(url, size) {
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(
    url
  )}`;
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

    const { buffer, qrApiUrl } = await fetchQrPng(detailUrl, args.size);
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

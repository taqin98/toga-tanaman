#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import { PNG } from "pngjs";

const DEFAULT_API_URL =
  "https://script.google.com/macros/s/AKfycbzNJ5nbk41yTxowEorHZendyeW-TvgzfdnnpyTMHGEayTW1KE7zQuk0GHe6fjAQmkukUg/exec";
const DEFAULT_DETAIL_BASE = "https://taqin98.github.io/toga-tanaman/";
const DEFAULT_MARKER_DIR = "markers";
const DEFAULT_QR_DIR = path.join(DEFAULT_MARKER_DIR, "qr");
const DEFAULT_QR_SIZE = 512;
const QR_ENDPOINT = "https://api.qrserver.com/v1/create-qr-code/";

function parseArgs(argv) {
  const out = {
    apiUrl: DEFAULT_API_URL,
    detailBase: DEFAULT_DETAIL_BASE,
    markerDir: DEFAULT_MARKER_DIR,
    qrDir: DEFAULT_QR_DIR,
    qrSize: DEFAULT_QR_SIZE,
    ids: null,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i];
    const next = argv[i + 1];

    if (key === "--api-url" && next) {
      out.apiUrl = next;
      i += 1;
      continue;
    }
    if (key === "--detail-base" && next) {
      out.detailBase = next;
      i += 1;
      continue;
    }
    if (key === "--marker-dir" && next) {
      out.markerDir = next;
      i += 1;
      continue;
    }
    if (key === "--qr-dir" && next) {
      out.qrDir = next;
      i += 1;
      continue;
    }
    if (key === "--qr-size" && next) {
      const parsed = Number(next);
      if (!Number.isFinite(parsed) || parsed <= 0) {
        throw new Error(`Nilai --qr-size tidak valid: ${next}`);
      }
      out.qrSize = parsed;
      i += 1;
      continue;
    }
    if (key === "--ids" && next) {
      out.ids = new Set(
        next
          .split(",")
          .map((v) => v.trim())
          .filter(Boolean)
      );
      i += 1;
      continue;
    }
    if (key === "--help") {
      printHelp();
      process.exit(0);
    }
  }

  return out;
}

function printHelp() {
  console.log(`
Generate marker .patt + QR PNG otomatis dari Google Apps Script.

Usage:
  npm run markers:generate -- [options]

Options:
  --api-url <url>         Endpoint Apps Script (default: ${DEFAULT_API_URL})
  --detail-base <url>     Base URL detail (?id=...) (default: ${DEFAULT_DETAIL_BASE})
  --marker-dir <dir>      Folder output .patt (default: ${DEFAULT_MARKER_DIR})
  --qr-dir <dir>          Folder output QR PNG (default: ${DEFAULT_QR_DIR})
  --qr-size <number>      Ukuran QR PNG (default: ${DEFAULT_QR_SIZE})
  --ids <id1,id2,...>     Generate hanya id tertentu
  --help                  Tampilkan bantuan
`);
}

async function fetchJson(url, timeoutMs = 15000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: "application/json" },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} (${url})`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

function normalizePlants(payload) {
  const rows = Array.isArray(payload) ? payload : Object.values(payload || {});

  return rows
    .map((row) => ({
      id: String(row?.id || "").trim(),
      url_qr: String(row?.url_qr || "").trim(),
    }))
    .filter((row) => row.id);
}

function buildDetailUrl(baseUrl, id) {
  const url = new URL(baseUrl);
  url.searchParams.set("id", id);
  return url.toString();
}

async function downloadQrPng(targetUrl, size) {
  const qrUrl = new URL(QR_ENDPOINT);
  qrUrl.searchParams.set("format", "png");
  qrUrl.searchParams.set("size", `${size}x${size}`);
  qrUrl.searchParams.set("data", targetUrl);

  const res = await fetch(qrUrl, { headers: { Accept: "image/png" } });
  if (!res.ok) throw new Error(`Gagal generate QR: HTTP ${res.status}`);
  const arrayBuffer = await res.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

function sampleChannel(png, rotatedX, rotatedY, channel) {
  const x = Math.max(
    0,
    Math.min(png.width - 1, Math.floor(((rotatedX + 0.5) * png.width) / 16))
  );
  const y = Math.max(
    0,
    Math.min(png.height - 1, Math.floor(((rotatedY + 0.5) * png.height) / 16))
  );

  const idx = (y * png.width + x) * 4 + channel;
  return png.data[idx];
}

function mapRotation(rotation, x, y) {
  if (rotation === 0) return [x, y];
  if (rotation === 1) return [15 - y, x];
  if (rotation === 2) return [15 - x, 15 - y];
  return [y, 15 - x];
}

function generatePattFromPng(pngBuffer) {
  const png = PNG.sync.read(pngBuffer);
  let out = "";

  for (const channel of [2, 1, 0]) {
    for (let rotation = 0; rotation < 4; rotation += 1) {
      for (let y = 0; y < 16; y += 1) {
        const row = [];
        for (let x = 0; x < 16; x += 1) {
          const [rx, ry] = mapRotation(rotation, x, y);
          const value = sampleChannel(png, rx, ry, channel);
          row.push(String(value).padStart(3, " "));
        }
        out += `${row.join(" ")}\n`;
      }
    }
  }

  return out;
}

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  await ensureDir(args.markerDir);
  await ensureDir(args.qrDir);

  console.log(`Mengambil data tanaman dari: ${args.apiUrl}`);
  const payload = await fetchJson(args.apiUrl);
  let plants = normalizePlants(payload);

  if (args.ids) {
    plants = plants.filter((row) => args.ids.has(row.id));
  }

  if (plants.length === 0) {
    throw new Error("Tidak ada data tanaman yang bisa diproses.");
  }

  console.log(`Total data diproses: ${plants.length}`);
  const report = [];

  for (const plant of plants) {
    const id = plant.id;
    const detailUrl = plant.url_qr || buildDetailUrl(args.detailBase, id);

    console.log(`- ${id}: generate QR + .patt`);
    const pngBuffer = await downloadQrPng(detailUrl, args.qrSize);
    const pattText = generatePattFromPng(pngBuffer);

    const qrPath = path.join(args.qrDir, `${id}.png`);
    const pattPath = path.join(args.markerDir, `${id}_v2.patt`);

    await fs.writeFile(qrPath, pngBuffer);
    await fs.writeFile(pattPath, pattText, "utf8");

    report.push({
      id,
      detail_url: detailUrl,
      qr_file: qrPath,
      patt_file: pattPath,
    });
  }

  const reportPath = path.join(args.qrDir, "report.json");
  await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

  console.log(`Selesai. Report: ${reportPath}`);
}

main().catch((error) => {
  console.error("Gagal generate marker:", error.message);
  process.exit(1);
});

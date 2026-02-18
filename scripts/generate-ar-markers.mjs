#!/usr/bin/env node

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { PNG } from "pngjs";

const DEFAULT_API_URL =
  "https://script.google.com/macros/s/AKfycbzNJ5nbk41yTxowEorHZendyeW-TvgzfdnnpyTMHGEayTW1KE7zQuk0GHe6fjAQmkukUg/exec";
const DEFAULT_DETAIL_BASE = "https://taqin98.github.io/toga-tanaman/";
const DEFAULT_MARKER_DIR = "markers";
const DEFAULT_QR_DIR = "markers/qr";
const DEFAULT_QR_SIZE = 600;
const DEFAULT_MARKER_IMAGE_SIZE = 600;
const DEFAULT_PATTERN_RATIO = 0.52;
const DEFAULT_BORDER_COLOR = "#000000";

function printHelpAndExit() {
  console.log(`
Generate QR, marker PNG, dan file .patt via command line

Pemakaian:
  npm run markers:generate -- [opsi]

Opsi:
  --api-url <url>          Endpoint Apps Script (default: ${DEFAULT_API_URL})
  --detail-base <url>      Base URL detail tanaman
  --marker-dir <path>      Folder output .patt (default: ${DEFAULT_MARKER_DIR})
  --qr-dir <path>          Folder output png (default: ${DEFAULT_QR_DIR})
  --qr-size <number>       Ukuran QR png (default: ${DEFAULT_QR_SIZE})
  --marker-image-size <n>  Ukuran marker png (default: ${DEFAULT_MARKER_IMAGE_SIZE})
  --pattern-ratio <n>      Rasio inner image (default: ${DEFAULT_PATTERN_RATIO})
  --border-color <hex>     Warna border marker, contoh #000000
  --ids <a,b,c>            Filter id tertentu
`);
  process.exit(0);
}

function parseArgs(argv) {
  const args = {
    apiUrl: DEFAULT_API_URL,
    detailBase: DEFAULT_DETAIL_BASE,
    markerDir: DEFAULT_MARKER_DIR,
    qrDir: DEFAULT_QR_DIR,
    qrSize: DEFAULT_QR_SIZE,
    markerImageSize: DEFAULT_MARKER_IMAGE_SIZE,
    patternRatio: DEFAULT_PATTERN_RATIO,
    borderColor: DEFAULT_BORDER_COLOR,
    ids: [],
  };

  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i];
    const val = argv[i + 1];
    if (key === "--help" || key === "-h") printHelpAndExit();
    if (key === "--api-url" && val) {
      args.apiUrl = val;
      i += 1;
      continue;
    }
    if (key === "--detail-base" && val) {
      args.detailBase = val;
      i += 1;
      continue;
    }
    if (key === "--marker-dir" && val) {
      args.markerDir = val;
      i += 1;
      continue;
    }
    if (key === "--qr-dir" && val) {
      args.qrDir = val;
      i += 1;
      continue;
    }
    if (key === "--qr-size" && val) {
      const n = Number(val);
      if (!Number.isFinite(n) || n < 100) throw new Error("Nilai --qr-size tidak valid.");
      args.qrSize = Math.floor(n);
      i += 1;
      continue;
    }
    if (key === "--marker-image-size" && val) {
      const n = Number(val);
      if (!Number.isFinite(n) || n < 200) throw new Error("Nilai --marker-image-size tidak valid.");
      args.markerImageSize = Math.floor(n);
      i += 1;
      continue;
    }
    if (key === "--pattern-ratio" && val) {
      const n = Number(val);
      if (!Number.isFinite(n) || n <= 0 || n >= 1) throw new Error("Nilai --pattern-ratio harus 0..1.");
      args.patternRatio = n;
      i += 1;
      continue;
    }
    if (key === "--border-color" && val) {
      if (!/^#[0-9a-fA-F]{6}$/.test(val)) throw new Error("Format --border-color harus hex, contoh #000000");
      args.borderColor = val;
      i += 1;
      continue;
    }
    if (key === "--ids" && val) {
      args.ids = val.split(",").map((x) => x.trim()).filter(Boolean);
      i += 1;
      continue;
    }
  }

  return args;
}

function hexToRgb(hex) {
  return {
    r: parseInt(hex.slice(1, 3), 16),
    g: parseInt(hex.slice(3, 5), 16),
    b: parseInt(hex.slice(5, 7), 16),
  };
}

function buildDetailUrl(detailBase, id) {
  const base = detailBase.trim();
  if (base.includes("?")) return `${base}&id=${encodeURIComponent(id)}`;
  return `${base.replace(/\/?$/, "/")}?id=${encodeURIComponent(id)}`;
}

async function fetchJson(url) {
  const res = await fetch(url, { headers: { accept: "application/json" } });
  if (!res.ok) throw new Error(`Request gagal (${res.status}) untuk ${url}`);
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
  if (!res.ok) throw new Error(`QR request gagal (${res.status})`);
  const arr = await res.arrayBuffer();
  return { buffer: Buffer.from(arr), qrApiUrl: qrUrl };
}

function blendOnWhite(channel, alpha) {
  return Math.max(0, Math.min(255, Math.round((channel * alpha + 255 * (255 - alpha)) / 255)));
}

function copyResizeNearest(srcPng, dstPng, dstX, dstY, dstW, dstH) {
  for (let y = 0; y < dstH; y += 1) {
    for (let x = 0; x < dstW; x += 1) {
      const sx = Math.min(srcPng.width - 1, Math.floor((x / Math.max(1, dstW)) * srcPng.width));
      const sy = Math.min(srcPng.height - 1, Math.floor((y / Math.max(1, dstH)) * srcPng.height));
      const sIdx = (sy * srcPng.width + sx) * 4;
      const dIdx = ((dstY + y) * dstPng.width + (dstX + x)) * 4;
      const sa = srcPng.data[sIdx + 3];
      dstPng.data[dIdx] = blendOnWhite(srcPng.data[sIdx], sa);
      dstPng.data[dIdx + 1] = blendOnWhite(srcPng.data[sIdx + 1], sa);
      dstPng.data[dIdx + 2] = blendOnWhite(srcPng.data[sIdx + 2], sa);
      dstPng.data[dIdx + 3] = 255;
    }
  }
}

function fillRect(png, x0, y0, w, h, r, g, b, a = 255) {
  const x1 = Math.max(0, Math.min(png.width, x0 + w));
  const y1 = Math.max(0, Math.min(png.height, y0 + h));
  const sx = Math.max(0, x0);
  const sy = Math.max(0, y0);
  for (let y = sy; y < y1; y += 1) {
    for (let x = sx; x < x1; x += 1) {
      const idx = (y * png.width + x) * 4;
      png.data[idx] = r;
      png.data[idx + 1] = g;
      png.data[idx + 2] = b;
      png.data[idx + 3] = a;
    }
  }
}

function buildMarkerPng(qrPngBuffer, markerImageSize, patternRatio, borderHex) {
  const qr = PNG.sync.read(qrPngBuffer);
  const png = new PNG({ width: markerImageSize, height: markerImageSize });
  const { r, g, b } = hexToRgb(borderHex);
  fillRect(png, 0, 0, markerImageSize, markerImageSize, r, g, b, 255);

  const innerSize = Math.max(1, Math.floor(markerImageSize * patternRatio));
  const innerX = Math.floor((markerImageSize - innerSize) / 2);
  const innerY = Math.floor((markerImageSize - innerSize) / 2);
  fillRect(png, innerX, innerY, innerSize, innerSize, 255, 255, 255, 255);
  copyResizeNearest(qr, png, innerX, innerY, innerSize, innerSize);
  return PNG.sync.write(png);
}

function mapRotation(rotation, x, y) {
  if (rotation === 0) return [x, y];
  if (rotation === 1) return [15 - y, x];
  if (rotation === 2) return [15 - x, 15 - y];
  return [y, 15 - x];
}

function sampleChannel(png, rotatedX, rotatedY, channel) {
  const x = Math.max(0, Math.min(png.width - 1, Math.floor(((rotatedX + 0.5) * png.width) / 16)));
  const y = Math.max(0, Math.min(png.height - 1, Math.floor(((rotatedY + 0.5) * png.height) / 16)));
  const idx = (y * png.width + x) * 4 + channel;
  return png.data[idx];
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
          row.push(String(sampleChannel(png, rx, ry, channel)).padStart(3, " "));
        }
        out += `${row.join(" ")}\n`;
      }
    }
  }
  return out;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  console.log(`Mengambil data tanaman dari: ${args.apiUrl}`);

  const items = await getPlantItems(args.apiUrl);
  const selected = args.ids.length
    ? items.filter((x) => args.ids.includes(String(x.id).trim()))
    : items;

  if (selected.length === 0) throw new Error("Tidak ada data tanaman yang bisa diproses.");

  await mkdir(path.resolve(args.markerDir), { recursive: true });
  await mkdir(path.resolve(args.qrDir), { recursive: true });

  const report = [];
  console.log(`Total data diproses: ${selected.length}`);

  for (const item of selected) {
    const id = String(item.id).trim();
    const detailUrl =
      String(item.url_qr || item.url || "").trim() || buildDetailUrl(args.detailBase, id);

    const { buffer: qrBuffer, qrApiUrl } = await fetchQrPng(detailUrl, args.qrSize);
    const markerBuffer = buildMarkerPng(
      qrBuffer,
      args.markerImageSize,
      args.patternRatio,
      args.borderColor
    );
    const pattText = generatePattFromPng(markerBuffer);

    const qrPath = path.join(args.qrDir, `${id}.png`);
    const markerPath = path.join(args.qrDir, `${id}-marker.png`);
    const pattPath = path.join(args.markerDir, `${id}.patt`);

    await writeFile(path.resolve(qrPath), qrBuffer);
    await writeFile(path.resolve(markerPath), markerBuffer);
    await writeFile(path.resolve(pattPath), pattText, "utf8");

    report.push({
      id,
      detail_url: detailUrl,
      qr_api_url: qrApiUrl,
      qr_file: qrPath,
      marker_file: markerPath,
      patt_file: pattPath,
      marker_image_size: args.markerImageSize,
      pattern_ratio: args.patternRatio,
      border_color: args.borderColor,
    });

    console.log(`- ${id}: QR + marker + .patt`);
  }

  const reportPath = path.resolve(args.qrDir, "report.json");
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(`Selesai. Report: ${path.join(args.qrDir, "report.json")}`);
}

main().catch((err) => {
  console.error("Gagal generate marker:", err.message);
  process.exit(1);
});

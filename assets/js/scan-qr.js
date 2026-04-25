const qrCanvas = document.getElementById("qrCanvas");
const hud = document.getElementById("hud");
const arInstruction = document.getElementById("arInstruction");
const arInstructionTitle = document.getElementById("arInstructionTitle");
const arInstructionDesc = document.getElementById("arInstructionDesc");
const arToast = document.getElementById("arToast");
const btnBack = document.getElementById("btnBack");

let video;
let scanFrameId = 0;
let lastScanAt = 0;
let qrScanActive = false;
let toastTimer = 0;
let jsQrStrategy = 0;

let qrWorker;
try {
  qrWorker = new window.Worker("assets/js/qr-worker.js");
} catch (e) {
  console.warn("Web Worker failed to initialize", e);
}
let isWorkerBusy = false;

if (qrWorker) {
  qrWorker.onmessage = function (e) {
    isWorkerBusy = false;
    if (!qrScanActive) return;
    if (e.data.result) {
      processScanResult(e.data.result);
    }
  };
}

function processScanResult(qrText) {
  const scannedId = normalizeTargetId(qrText);
  if (!scannedId) {
    showToast("Kode belum dikenali");
    return;
  }

  qrScanActive = false;
  
  if (hud) hud.textContent = "Kode berhasil dibaca";
  if (arInstruction) {
    arInstruction.classList.remove("is-hidden");
    arInstruction.classList.add("is-success");
    if (arInstructionTitle) arInstructionTitle.textContent = "Kode berhasil dibaca";
    if (arInstructionDesc) arInstructionDesc.textContent = "Membuka AR...";
  }

  window.setTimeout(() => {
    window.location.href = `ar.html?id=${encodeURIComponent(scannedId)}`;
  }, 300);
}

function showToast(message) {
  if (!arToast) return;
  window.clearTimeout(toastTimer);
  arToast.textContent = message;
  arToast.classList.add("is-visible");
  toastTimer = window.setTimeout(() => {
    arToast.classList.remove("is-visible");
  }, 1400);
}

function normalizeTargetId(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";

  const looksLikeUrl =
    /^[a-z][a-z\d+.-]*:\/\//i.test(raw) || raw.includes("?") || raw.includes("/");
  if (!looksLikeUrl) return raw;

  try {
    const url = new URL(raw, window.location.href);
    return String(url.searchParams.get("id") || raw).trim();
  } catch (_) {
    return raw;
  }
}

async function startCamera() {
  video = document.createElement("video");
  video.style.position = "absolute";
  video.style.top = "0";
  video.style.left = "0";
  video.style.width = "100%";
  video.style.height = "100%";
  video.style.objectFit = "cover";
  video.style.zIndex = "-1";
  video.setAttribute("playsinline", "true");
  video.setAttribute("webkit-playsinline", "true");
  video.setAttribute("autoplay", "true");
  video.setAttribute("muted", "true");
  video.muted = true;
  document.body.appendChild(video);

  const startStream = async (constraints) => {
    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    
    // Attempt to apply advanced constraints for continuous focus if supported
    try {
      const track = stream.getVideoTracks()[0];
      if (track && typeof track.getCapabilities === 'function') {
        const caps = track.getCapabilities();
        if (caps.focusMode && caps.focusMode.includes('continuous')) {
          await track.applyConstraints({
            advanced: [{ focusMode: 'continuous' }]
          });
        }
      }
    } catch (e) {
      console.warn("Failed to apply advanced focus constraint", e);
    }

    video.srcObject = stream;
    await video.play();
    qrScanActive = true;
    requestAnimationFrame(scanQrFrame);
    
    if (hud) hud.textContent = "Scan kartu";
    if (arInstruction) arInstruction.classList.add("is-hidden");
  };

  try {
    // Request highest possible resolution to make QR readable from distance
    await startStream({
      video: {
        facingMode: "environment",
        width: { ideal: 1920 },
        height: { ideal: 1080 },
      }
    });
  } catch (err) {
    console.error("High-res camera error:", err);
    // Fallback if high res fails
    try {
      await startStream({
        video: { facingMode: "environment" }
      });
    } catch (fallbackErr) {
      console.error("Fallback camera error:", fallbackErr);
      if (hud) hud.textContent = "Kamera tidak tersedia";
      showToast("Gagal mengakses kamera");
    }
  }
}

async function scanQrFrame(now) {
  if (!qrScanActive) return;

  // Faster frame loop since worker handles heavy lifting
  if (now - lastScanAt < 100) {
    scanFrameId = window.requestAnimationFrame(scanQrFrame);
    return;
  }
  lastScanAt = now;

  if (!video || video.readyState < 2 || !video.videoWidth) {
    scanFrameId = window.requestAnimationFrame(scanQrFrame);
    return;
  }

  const canvas = qrCanvas;
  let width = Math.max(2, Math.round(video.videoWidth));
  let height = Math.max(2, Math.round(video.videoHeight));
  
  // Lowered maxSize to 800 for significantly faster imageData processing on old devices
  const maxSize = 800;
  if (width > maxSize || height > maxSize) {
    const ratio = Math.min(maxSize / width, maxSize / height);
    width = Math.round(width * ratio);
    height = Math.round(height * ratio);
  }

  if (canvas.width !== width) canvas.width = width;
  if (canvas.height !== height) canvas.height = height;

  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) {
    scanFrameId = window.requestAnimationFrame(scanQrFrame);
    return;
  }

  ctx.drawImage(video, 0, 0, width, height);

  let qrText = null;

  // 1. Try Native BarcodeDetector (Extremely fast, handles borders well)
  if ("BarcodeDetector" in window) {
    try {
      if (!window.qrDetector) {
        window.qrDetector = new window.BarcodeDetector({ formats: ["qr_code"] });
      }
      const barcodes = await window.qrDetector.detect(canvas);
      if (barcodes && barcodes.length > 0) {
        qrText = barcodes[0].rawValue;
      }
    } catch (e) {
      console.warn("BarcodeDetector error", e);
    }
  }

  if (qrText) {
    processScanResult(qrText);
    return;
  }

  // 2. Offload jsQR to Web Worker if native failed
  if (qrWorker && !isWorkerBusy) {
    const imageData = ctx.getImageData(0, 0, width, height);
    isWorkerBusy = true;
    qrWorker.postMessage(
      { buffer: imageData.data.buffer, width, height },
      [imageData.data.buffer] // Zero-copy transfer for max performance
    );
  } else if (!qrWorker) {
    // Fallback if worker completely failed to load
    const imageData = ctx.getImageData(0, 0, width, height);
    const result = window.jsQR && window.jsQR(imageData.data, width, height, { inversionAttempts: "dontInvert" });
    if (result && result.data) {
      processScanResult(result.data);
      return;
    }
  }

  // Continue scanning loop immediately (UI never freezes)
  scanFrameId = window.requestAnimationFrame(scanQrFrame);
}

document.addEventListener("DOMContentLoaded", () => {
  if (btnBack) btnBack.style.display = "flex";
  startCamera();
});

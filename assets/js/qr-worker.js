importScripts("https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.js");

self.onmessage = function (e) {
  const { buffer, width, height } = e.data;
  const data = new Uint8ClampedArray(buffer);
  
  if (!self.jsQR) {
    self.postMessage({ result: null });
    return;
  }

  // Helper to extract a center crop (to strip AR marker borders)
  function getCropped(srcData, srcW, srcH, cropRatio) {
    const cropW = Math.floor(srcW * cropRatio);
    const cropH = Math.floor(srcH * cropRatio);
    const cropX = Math.floor((srcW - cropW) / 2);
    const cropY = Math.floor((srcH - cropH) / 2);
    
    const croppedData = new Uint8ClampedArray(cropW * cropH * 4);
    
    for (let y = 0; y < cropH; y++) {
      const srcIdx = ((cropY + y) * srcW + cropX) * 4;
      const dstIdx = y * cropW * 4;
      croppedData.set(srcData.subarray(srcIdx, srcIdx + cropW * 4), dstIdx);
    }
    return { data: croppedData, width: cropW, height: cropH };
  }

  // 1. Fast check full image
  let result = self.jsQR(data, width, height, { inversionAttempts: "dontInvert" });

  // 2. Fast check 60% center crop
  if (!result) {
    const c = getCropped(data, width, height, 0.6);
    result = self.jsQR(c.data, c.width, c.height, { inversionAttempts: "dontInvert" });
  }

  // 3. Deep check 40% center crop
  if (!result) {
    const c = getCropped(data, width, height, 0.4);
    result = self.jsQR(c.data, c.width, c.height, { inversionAttempts: "attemptBoth" });
  }

  // 4. Deep check full image
  if (!result) {
    result = self.jsQR(data, width, height, { inversionAttempts: "attemptBoth" });
  }

  self.postMessage({ result: result ? result.data : null });
};

function seededRandom(seed) {
  return () => {
    seed = (Math.imul(1664525, seed) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

function moisture(x, y) {
  return 0.5 + 0.22 * Math.sin(13 * x + 3 * Math.sin(8 * y)) +
    0.16 * Math.cos(21 * x - 15 * y) + 0.1 * Math.sin(39 * x + 27 * y);
}

export function makeCondensationHaze() {
  const canvas = document.createElement('canvas');
  canvas.width = 160;
  canvas.height = 106;
  const ctx = canvas.getContext('2d');
  const grain = ctx.createImageData(canvas.width, canvas.height);
  const random = seededRandom(13471);
  for (let y = 0; y < canvas.height; y++) {
    for (let x = 0; x < canvas.width; x++) {
      const i = (y * canvas.width + x) * 4;
      grain.data[i] = grain.data[i + 1] = grain.data[i + 2] = 255;
      grain.data[i + 3] = 145 + 89 * moisture(x / canvas.width, y / canvas.height) + 21 * random();
    }
  }
  ctx.putImageData(grain, 0, 0);
  return canvas;
}

export function makeWaterBeads(width, height, seed) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  const scale = Math.sqrt(width * height / (960 * 640));
  const random = seededRandom(seed);
  for (let i = 0; i < 3400; i++) {
    const x = random();
    const y = random();
    const density = moisture(x, y);
    if (random() > 0.27 + density * 0.73) continue;
    const radius = (0.6 + random() ** 4.2 * (2.2 + density * 3.7)) * scale;
    ctx.save();
    ctx.translate(x * width, y * height);
    ctx.rotate((random() - 0.5) * 1.7);
    ctx.scale(0.75 + 0.25 * random(), 0.82 + random() * 0.55);
    ctx.globalAlpha = 0.33 + 0.67 * random();

    const glass = ctx.createLinearGradient(-radius * 0.5, -radius, radius * 0.5, radius);
    glass.addColorStop(0, 'rgba(255,255,255,0.78)');
    glass.addColorStop(0.30, 'rgba(255,255,255,0.12)');
    glass.addColorStop(0.58, 'rgba(118,110,103,0.14)');
    glass.addColorStop(0.84, 'rgba(65,61,58,0.61)');
    glass.addColorStop(1, 'rgba(96,91,85,0.24)');
    const shoulder = radius * (0.55 + 0.42 * random());
    ctx.fillStyle = glass;
    ctx.beginPath();
    ctx.moveTo(0, -radius);
    ctx.bezierCurveTo(shoulder, -radius, radius * 1.15, radius * 0.08, radius * 0.63, radius * 0.68);
    ctx.bezierCurveTo(0, radius * 1.25, -radius * 1.15, radius * 0.71, -radius * 0.88, 0);
    ctx.quadraticCurveTo(-shoulder, -radius * 0.98, 0, -radius);
    ctx.fill();

    ctx.restore();
  }
  return canvas;
}

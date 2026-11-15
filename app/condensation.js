export function makeWaterBeads(width, height) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  const scale = Math.sqrt(width * height / (960 * 640));
  let seed = 71327;
  const random = () => {
    seed = (Math.imul(1664525, seed) + 1013904223) >>> 0;
    return seed / 4294967296;
  };

  for (let i = 0; i < 2250; i++) {
    const radius = (0.75 + random() ** 4 * 5.2) * scale;
    ctx.save();
    ctx.translate(random() * width, random() * height);
    ctx.rotate((random() - 0.5) * 0.85);
    ctx.scale(1, 0.88 + random() * 0.46);

    const glass = ctx.createRadialGradient(-radius * 0.28, -radius * 0.31, 0, 0, 0, radius);
    glass.addColorStop(0, 'rgba(255,255,255,0.58)');
    glass.addColorStop(0.45, 'rgba(255,255,255,0.10)');
    glass.addColorStop(0.76, 'rgba(95,95,95,0.22)');
    glass.addColorStop(0.92, 'rgba(65,65,65,0.67)');
    glass.addColorStop(1, 'rgba(80,80,80,0.25)');
    ctx.fillStyle = glass;
    ctx.beginPath();
    ctx.arc(0, 0, radius, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = 'rgba(255,255,255,0.8)';
    ctx.lineWidth = Math.max(0.4, radius * 0.14);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(0, 0, radius * 0.71, 3.55, 4.68);
    ctx.stroke();
    ctx.restore();
  }
  return canvas;
}

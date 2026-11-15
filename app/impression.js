import { distance } from './gestures.js';

const digits = [[1, 2, 3, 4], [5, 6, 7, 8], [9, 10, 11, 12], [13, 14, 15, 16], [17, 18, 19, 20]];
const knuckles = [5, 9, 13, 17];

function interpolate(a, b, amount) {
  return { x: a.x + (b.x - a.x) * amount, y: a.y + (b.y - a.y) * amount };
}

function direction(a, b) {
  const length = Math.max(distance(a, b), 1);
  return { x: (b.x - a.x) / length, y: (b.y - a.y) / length };
}

function disk(ctx, point, radius) {
  ctx.beginPath();
  ctx.arc(point.x, point.y, radius, 0, Math.PI * 2);
  ctx.fill();
}

function capsule(ctx, a, b, first, last) {
  const axis = direction(a, b);
  ctx.beginPath();
  ctx.moveTo(a.x - axis.y * first, a.y + axis.x * first);
  ctx.lineTo(b.x - axis.y * last, b.y + axis.x * last);
  ctx.lineTo(b.x + axis.y * last, b.y - axis.x * last);
  ctx.lineTo(a.x + axis.y * first, a.y - axis.x * first);
  ctx.closePath();
  ctx.fill();
  disk(ctx, a, first);
  disk(ctx, b, last);
}

function palmOutline(points, span) {
  const [wrist, thumbBase, thumbKnuckle, index, middle, ring, pinky] =
    [0, 1, 2, 5, 9, 13, 17].map(i => points[i]);
  const across = direction(index, pinky);
  const forward = direction(wrist, middle);
  function offset(p, sideways, lengthwise = 0) {
    return {
      x: p.x + span * (across.x * sideways + forward.x * lengthwise),
      y: p.y + span * (across.y * sideways + forward.y * lengthwise),
    };
  }
  return [
    offset(wrist, -0.32, -0.12),
    offset(wrist, 0.32, -0.12),
    offset(interpolate(wrist, pinky, 0.47), 0.17),
    offset(pinky, 0.16, 0.05),
    offset(ring, 0, 0.075),
    offset(middle, 0, 0.075),
    offset(index, -0.08, 0.06),
    interpolate(index, thumbKnuckle, 0.54),
    offset(interpolate(thumbBase, thumbKnuckle, 0.64), -0.13, -0.04),
    offset(interpolate(wrist, thumbBase, 0.60), -0.12),
  ];
}

function roundedPalm(ctx, outline) {
  const start = interpolate(outline.at(-1), outline[0], 0.77);
  ctx.beginPath();
  ctx.moveTo(start.x, start.y);
  outline.forEach((point, i) => {
    const next = outline[(i + 1) % outline.length];
    const previous = outline[(i + outline.length - 1) % outline.length];
    const entry = interpolate(previous, point, 0.77);
    const exit = interpolate(point, next, 0.23);
    ctx.lineTo(entry.x, entry.y);
    ctx.quadraticCurveTo(point.x, point.y, exit.x, exit.y);
  });
  ctx.closePath();
  ctx.fill();
}

function fingerShape(points, span, joints, finger) {
  const thumb = finger === 0;
  const base = finger - 1;
  const spacing = thumb ? span * 0.36 : Math.min(
    base > 0 ? distance(points[knuckles[base]], points[knuckles[base - 1]]) : Infinity,
    base < 3 ? distance(points[knuckles[base]], points[knuckles[base + 1]]) : Infinity,
  );
  const radius = Math.max(span * 0.109, Math.min(span * 0.205, spacing * 0.49));
  const profile = thumb ? [1.17, 1.08, 0.93, 0.80] : [1.13, 0.97, 0.86, 0.76];
  const centers = joints.map(i => points[i]);
  const endRadius = radius * profile[3];
  const endLength = Math.max(distance(centers[2], centers[3]), 1);
  centers[3] = interpolate(centers[3], centers[2], Math.min(0.3, endRadius * 0.42 / endLength));
  return centers.map((p, i) => ({ ...p, radius: radius * profile[i] }));
}

function canvasLayer(width, height) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

export function makeImpression(points, canvasWidth, canvasHeight) {
  const span = Math.max(distance(points[5], points[17]), distance(points[0], points[9]) * 0.68);
  if (span < 8) return null;
  const palm = palmOutline(points, span);
  const fingers = digits.map((joints, i) => fingerShape(points, span, joints, i));
  const bounds = [...palm, ...fingers.flat()];
  const left = Math.min(...bounds.map(p => p.x - (p.radius ?? 0)));
  const top = Math.min(...bounds.map(p => p.y - (p.radius ?? 0)));
  const right = Math.max(...bounds.map(p => p.x + (p.radius ?? 0)));
  const bottom = Math.max(...bounds.map(p => p.y + (p.radius ?? 0)));
  if (left < 0 || top < 0 || right > canvasWidth || bottom > canvasHeight) return null;

  const feather = Math.max(0.65, Math.min(4.2, span * 0.036));
  const margin = Math.ceil(feather * 3);
  const x = Math.max(0, Math.floor(left) - margin);
  const y = Math.max(0, Math.floor(top) - margin);
  const width = Math.min(canvasWidth, Math.ceil(right) + margin) - x;
  const height = Math.min(canvasHeight, Math.ceil(bottom) + margin) - y;

  const shape = canvasLayer(width, height);
  const shapeCtx = shape.getContext('2d');
  shapeCtx.translate(-x, -y);
  roundedPalm(shapeCtx, palm);
  for (const finger of fingers) {
    for (let i = 1; i < finger.length; i++) {
      const a = finger[i - 1];
      const b = finger[i];
      capsule(shapeCtx, a, b, a.radius, b.radius);
    }
  }

  const image = canvasLayer(width, height);
  const ctx = image.getContext('2d');
  // Feather the complete shape once to avoid seams between the palm and finger strokes.
  ctx.filter = `blur(${feather}px)`;
  ctx.drawImage(shape, 0, 0);
  ctx.filter = 'none';
  return { image, x, y };
}

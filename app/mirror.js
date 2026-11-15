import { makeImpression } from './impression.js';
import { makeCondensationHaze, makeWaterBeads } from './condensation.js?v=bead-density';

const MARK_LIFETIME = 60;
const MARK_FADE_START = 45;
const BEAD_LAYERS = [
  { start: 0.10, full: 0.48, seed: 71327 },
  { start: 0.42, full: 0.76, seed: 95143 },
  { start: 0.67, full: 1.00, seed: 58183 },
];

function markOpacity(age) {
  const progress = Math.min(1, Math.max(0, (age - MARK_FADE_START) / (MARK_LIFETIME - MARK_FADE_START)));
  return 1 - progress * progress * (3 - 2 * progress);
}

function layer(width, height, options) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas.getContext('2d', options);
}

function mist(ctx, x, y, radius, opacity) {
  const cloud = ctx.createRadialGradient(x, y, 0, x, y, radius);
  cloud.addColorStop(0, `rgba(255,255,255,${opacity})`);
  cloud.addColorStop(0.25, `rgba(255,255,255,${opacity * 0.7})`);
  cloud.addColorStop(0.52, `rgba(255,255,255,${opacity * 0.32})`);
  cloud.addColorStop(0.76, `rgba(255,255,255,${opacity * 0.08})`);
  cloud.addColorStop(0.92, `rgba(255,255,255,${opacity * 0.012})`);
  cloud.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = cloud;
  ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
}

function erase(ctx, { from, to, width, control }) {
  ctx.save();
  ctx.globalCompositeOperation = 'destination-out';
  ctx.strokeStyle = 'white';
  ctx.fillStyle = 'white';
  ctx.lineWidth = width;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(from.x, from.y);
  if (control) ctx.quadraticCurveTo(control.x, control.y, to.x, to.y);
  else ctx.lineTo(to.x, to.y);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(to.x, to.y, width / 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

export class Mirror {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.width = canvas.width;
    this.height = canvas.height;
    this.canvasBounds = { x: 0, y: 0, width: this.width, height: this.height };
    this.fog = layer(this.width, this.height);
    this.sample = layer(this.width / 2, this.height / 2);
    this.wetness = 0;
    this.clear();
  }

  drawCamera(ctx, video, mirrored = false) {
    if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return;
    const { width, height } = ctx.canvas;
    const scale = Math.max(width / video.videoWidth, height / video.videoHeight);
    const sourceWidth = width / scale;
    const sourceHeight = height / scale;
    ctx.save();
    if (mirrored) {
      ctx.translate(width, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(video, (video.videoWidth - sourceWidth) / 2, (video.videoHeight - sourceHeight) / 2,
      sourceWidth, sourceHeight, 0, 0, width, height);
    ctx.restore();
  }

  captureFrame(video) {
    this.drawCamera(this.sample, video);
    return this.sample.canvas;
  }

  toMirror(point) {
    return { x: this.width * (1 - point.x), y: this.height * point.y, z: point.z * this.width };
  }

  inDrawingArea({ x, y }, view) {
    const { x: left, y: top, width, height } = view ?? this.canvasBounds;
    const margin = Math.min(width, height) * 0.08;
    return x >= left + margin && x <= left + width - margin &&
      y >= top + margin && y <= top + height - margin;
  }

  fade(seconds) {
    this.sinceFog += seconds;
    if (this.sinceFog !== Infinity && this.sinceFog >= MARK_LIFETIME) {
      this.fog.clearRect(0, 0, this.width, this.height);
      this.sinceFog = Infinity;
      this.surfaceDirty = true;
    }
  }

  get fogOpacity() {
    return markOpacity(this.sinceFog);
  }

  reduceOpacity(ctx, amount) {
    ctx.save();
    ctx.globalCompositeOperation = 'destination-out';
    ctx.fillStyle = 'white';
    ctx.globalAlpha = amount;
    ctx.fillRect(0, 0, this.width, this.height);
    ctx.restore();
  }

  fogAt({ center, radius, strength }, seconds) {
    const opacity = Math.min(0.26, strength * seconds * 6);
    if (opacity <= 0) return;
    if (this.sinceFog > MARK_FADE_START && this.sinceFog < MARK_LIFETIME) {
      this.reduceOpacity(this.fog, 1 - this.fogOpacity);
    }
    this.sinceFog = 0;
    this.surfaceDirty = true;
    const { x, y } = center;
    // Vary the overlapping plumes to soften bands from repeatedly painting the same gradient.
    const phase = ++this.fogDeposit * 2.399963;
    const driftX = Math.cos(phase) * radius;
    const driftY = Math.sin(phase) * radius;
    mist(this.fog, x + driftX * 0.09, y + driftY * 0.08,
      radius * (1.04 + Math.sin(phase * 1.7) * 0.12), opacity * 0.83);
    mist(this.fog, x - radius * 0.24 + driftX * 0.14, y + radius * 0.17 + driftY * 0.10,
      radius * 0.84, opacity * 0.36);
    mist(this.fog, x + radius * 0.32 + driftY * 0.12, y + radius * 0.27 + driftX * 0.11,
      radius * 0.77, opacity * 0.27);
  }

  wipe(stroke) {
    erase(this.fog, stroke);
    this.surfaceDirty = true;
  }

  stamp(points, view) {
    const { x, y, width, height } = view ?? this.canvasBounds;
    const local = view ? points.map(point => ({ x: point.x - x, y: point.y - y })) : points;
    const print = makeImpression(local, width, height);
    if (!print) return false;
    const ctx = this.fog;
    ctx.save();
    ctx.globalCompositeOperation = 'destination-out';
    ctx.drawImage(print.image, print.x + x, print.y + y);
    ctx.restore();
    this.surfaceDirty = true;
    return true;
  }

  setWetness(value) {
    this.wetness = Math.max(0, Math.min(1, value));
    this.appearanceDirty = true;
    this.surfaceDirty = true;
  }

  fogSurface() {
    if (!this.wetness) return this.fog.canvas;
    this.wetSurface ??= layer(this.width, this.height);
    if (!this.surfaceDirty) return this.wetSurface.canvas;

    this.wetAppearance ??= layer(this.width, this.height);
    if (this.appearanceDirty) {
      const appearance = this.wetAppearance;
      appearance.clearRect(0, 0, this.width, this.height);
      this.haze ??= makeCondensationHaze();
      appearance.globalAlpha = 1 - this.wetness * 0.62;
      appearance.drawImage(this.haze, 0, 0, this.width, this.height);
      this.beads ??= [];
      for (const [i, { start, full, seed }] of BEAD_LAYERS.entries()) {
        if (this.wetness <= start) break;
        this.beads[i] ??= makeWaterBeads(this.width, this.height, seed);
        appearance.globalAlpha = Math.min(1, (this.wetness - start) / (full - start));
        appearance.drawImage(this.beads[i], 0, 0);
      }
      appearance.globalAlpha = 1;
      this.appearanceDirty = false;
    }

    const surface = this.wetSurface;
    surface.clearRect(0, 0, this.width, this.height);
    surface.drawImage(this.wetAppearance.canvas, 0, 0);
    surface.globalCompositeOperation = 'destination-in';
    surface.drawImage(this.fog.canvas, 0, 0);
    surface.globalCompositeOperation = 'source-over';
    this.surfaceDirty = false;
    return surface.canvas;
  }

  draw(video) {
    this.drawCamera(this.ctx, video, true);
    if (this.sinceFog === Infinity) return;
    this.ctx.globalAlpha = this.fogOpacity;
    this.ctx.drawImage(this.fogSurface(), 0, 0);
    this.ctx.globalAlpha = 1;
  }

  clear() {
    this.sinceFog = Infinity;
    this.fogDeposit = 0;
    this.surfaceDirty = true;
    for (const ctx of [this.fog, this.sample]) {
      ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    }
    this.ctx.fillStyle = 'white';
    this.ctx.fillRect(0, 0, this.width, this.height);
  }
}

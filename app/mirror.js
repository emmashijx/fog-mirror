import { makeImpression } from './impression.js';
import { makeWaterBeads } from './condensation.js?v=beads';

const MARK_LIFETIME = 60;
const MARK_FADE_START = 45;

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

function depositCloud(ctx, x, y, radius, opacity) {
  const cloud = ctx.createRadialGradient(x, y, radius * 0.09, x, y, radius);
  cloud.addColorStop(0, `rgba(255,255,255,${opacity})`);
  cloud.addColorStop(0.48, `rgba(255,255,255,${opacity * 0.63})`);
  cloud.addColorStop(0.80, `rgba(255,255,255,${opacity * 0.19})`);
  cloud.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = cloud;
  ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
}

function erase(ctx, { from, to, width, control, footprintAngle }) {
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
  if (footprintAngle === undefined) ctx.arc(to.x, to.y, width / 2, 0, Math.PI * 2);
  else ctx.ellipse(to.x, to.y, width * 0.65, width / 2, footprintAngle, 0, Math.PI * 2);
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
    const opacity = this.legacyFog ? Math.min(0.26, strength * seconds * 6) :
      -Math.expm1(-strength * Math.max(0, seconds) * 6);
    if (opacity <= 0) return;
    if (this.sinceFog > MARK_FADE_START && this.sinceFog < MARK_LIFETIME) {
      this.reduceOpacity(this.fog, 1 - this.fogOpacity);
    }
    this.sinceFog = 0;
    this.surfaceDirty = true;
    const { x, y } = center;
    depositCloud(this.fog, x, y, radius, opacity);
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
      appearance.fillStyle = 'white';
      appearance.globalAlpha = 1 - this.wetness * 0.57;
      appearance.fillRect(0, 0, this.width, this.height);
      this.beads ??= makeWaterBeads(this.width, this.height);
      appearance.globalAlpha = Math.max(0, (this.wetness - 0.15) / 0.85);
      appearance.drawImage(this.beads, 0, 0);
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
    this.surfaceDirty = true;
    for (const ctx of [this.fog, this.sample]) {
      ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    }
    this.ctx.fillStyle = 'white';
    this.ctx.fillRect(0, 0, this.width, this.height);
  }
}

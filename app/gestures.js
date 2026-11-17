import { handDepth, calibrateIndex, updateIndex } from './index-pressure.js?v=fah-stroke';

const HAND_SAMPLE_GAP = 320;
export const FAH_STROKE_GAP = 520;

const fingers = [
  [5, 6, 7, 8], [9, 10, 11, 12], [13, 14, 15, 16], [17, 18, 19, 20],
];

export const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
export const midpoint = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
const mix = (a, b, amount) => ({
  x: a.x + (b.x - a.x) * amount,
  y: a.y + (b.y - a.y) * amount,
});
const distance3D = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, (a.z ?? 0) - (b.z ?? 0));

function extension(points, joints, measure = distance3D) {
  const [base, middle, end, tip] = joints.map(index => points[index]);
  const length = measure(base, middle) + measure(middle, end) + measure(end, tip);
  return length ? measure(base, tip) / length : 0;
}

export function isSpreadHand(points) {
  if (!points) return false;
  const span = distance3D(points[5], points[17]);
  return span > 0 &&
    distance3D(points[8], points[20]) > span * 1.12 &&
    [[8, 12], [12, 16], [16, 20]].every(([first, second]) =>
      distance3D(points[first], points[second]) > span * 0.20) &&
    extension(points, [1, 2, 3, 4]) > 0.65 &&
    distance3D(points[4], points[5]) > span * 0.45;
}

export function classifyHand(points, drawing = false) {
  const [index, middle, ring, pinky] = fingers.map(joints => extension(points, joints));
  const spread = distance3D(points[8], points[20]) > distance3D(points[5], points[17]) * 1.12;
  const open = index > 0.80 && middle > 0.80 && ring > 0.77 && pinky > 0.73;
  const spreadOpen = spread && index > 0.78 && middle > 0.76 && ring > 0.70 && pinky > 0.59;
  if (open) return 'open';
  const curled = Number(middle < 0.82) + Number(ring < 0.82) + Number(pinky < 0.85);
  if (spreadOpen) return 'open';
  if (index > (drawing ? 0.73 : 0.83) && curled >= 2) return 'point';
  return 'other';
}

export function isProjectedIndex(points, drawing = false) {
  if (!points || extension(points, fingers[0], distance) <= (drawing ? 0.73 : 0.83)) return false;
  const wrist = points[0];
  // A pointing tip extends past its knuckle while curled tips stay near or inside theirs.
  const [index, ...others] = fingers.map(([base, , , tip]) =>
    distance(wrist, points[tip]) / distance(wrist, points[base]));
  return index > 1.3 && others.filter(reach => reach < 1.1).length >= 2;
}

const fingertipWidth = size => Math.max(7, Math.min(18, size * 0.105));

function followsFastPoint(previous, palmMotion, tip, size, elapsed, interrupted) {
  const handSize = Math.min(previous.size, size);
  const palmTravel = Math.hypot(palmMotion.x, palmMotion.y);
  const travelLimit = handSize * Math.min(3.7, 1.5 + elapsed / 110);
  const tipDrift = Math.hypot(tip.x - previous.rawTip.x - palmMotion.x,
    tip.y - previous.rawTip.y - palmMotion.y);
  if (Math.max(previous.size, size) > handSize * 1.35 ||
      palmTravel > travelLimit || tipDrift > handSize * 0.45) return false;
  if (!interrupted) return true;
  // After a gap, only a large move in the same direction can extend the old line.
  const lastMotion = previous.palmMotion;
  if (!lastMotion) return false;
  const lastTravel = Math.hypot(lastMotion.x, lastMotion.y);
  const alignment = lastMotion.x * palmMotion.x + lastMotion.y * palmMotion.y;
  return lastTravel >= handSize * 0.22 && alignment >= 0.6 * lastTravel * palmTravel;
}

export class MouthGesture {
  update(points, timestamp) {
    if (!points?.[291]) {
      this.reset();
      return null;
    }
    const center = midpoint(points[13], points[14]);
    const mouthWidth = Math.max(distance(points[61], points[291]), 6);
    const opening = distance(points[13], points[14]) / mouthWidth;
    const previous = this.sample;
    const elapsed = previous ? timestamp - previous.timestamp : 0;
    const gap = !previous || elapsed > 320;
    const smoothing = 1 - Math.exp(-elapsed / 70);
    const smooth = gap ? opening : previous.opening + (opening - previous.opening) * smoothing;
    const motion = gap ? 0 : Math.min(1, Math.abs(opening - previous.raw) * 250 / Math.max(1, elapsed));
    this.sample = {
      center: gap ? center : mix(previous.center, center, 1 - Math.exp(-elapsed / 52)),
      opening: smooth,
      raw: opening,
      timestamp,
    };
    this.open = this.open ? opening > 0.085 && smooth > 0.11 : smooth > 0.17;
    if (!this.open) return null;
    return {
      center: this.sample.center,
      radius: Math.min(235, Math.max(46, mouthWidth * 2.6)),
      strength: Math.min(1, 0.12 + smooth * 0.95 + motion * 0.28),
    };
  }

  reset() {
    this.sample = null;
    this.open = false;
  }
}

export class ExpressionMouthGesture extends MouthGesture {
  update(points, timestamp, expressions) {
    if (!this.sample || timestamp - this.sample.timestamp > 320) {
      this.expressionOpen = false;
      this.pendingSince = null;
    }
    super.update(points, timestamp);
    if (!this.sample || !Number.isFinite(expressions?.jawOpen) ||
        !Number.isFinite(expressions?.mouthPucker) || !Number.isFinite(expressions?.mouthFunnel)) {
      this.reset();
      return null;
    }
    const expression = Math.max(expressions.jawOpen, expressions.mouthPucker * 0.65,
      expressions.mouthFunnel * 0.8) * (1 - (expressions.mouthClose ?? 0) * 0.5);
    const opening = this.sample.opening;
    const active = opening > (this.expressionOpen ? 0.085 : 0.13) &&
      expression > (this.expressionOpen ? 0.10 : 0.16);
    if (!active) {
      this.expressionOpen = false;
      this.pendingSince = null;
      return null;
    }
    this.pendingSince ??= timestamp;
    if (!this.expressionOpen && timestamp - this.pendingSince < 120) return null;
    this.expressionOpen = true;
    const mouthWidth = Math.max(distance(points[61], points[291]), 6);
    return {
      center: this.sample.center,
      radius: Math.min(235, Math.max(46, mouthWidth * 2.6)),
      strength: Math.min(1, 0.1 + opening * 0.5 + expression * 0.5),
    };
  }

  reset() {
    super.reset();
    this.expressionOpen = false;
    this.pendingSince = null;
  }
}

export class HandGesture {
  constructor({ sparseSamples = false } = {}) {
    this.sparseSamples = sparseSamples;
  }

  update(pose, points, timestamp, allowPrint = isSpreadHand(points), { predicted = false } = {}) {
    if (!points) {
      this.reset();
      return null;
    }
    const previous = this.sample;
    const elapsed = previous ? Math.max(1, timestamp - previous.timestamp) : Infinity;
    const sparseStroke = this.sparseSamples && this.pointPressed;
    const maxGap = sparseStroke ? FAH_STROKE_GAP : HAND_SAMPLE_GAP;
    // Keep a short hold during pose uncertainty or FAH's prediction-only frames.
    if (pose === 'other' && previous?.pose === 'open' && elapsed <= 125) return null;
    if (pose === 'other' && this.pointPressed &&
        (sparseStroke ? (predicted || !this.pointInterrupted) && elapsed <= maxGap : elapsed <= 135)) {
      this.pointInterrupted = true;
      return null;
    }
    if (pose === 'other') {
      this.reset();
      return null;
    }
    const palm = midpoint(points[0], points[9]);
    const size = Math.max(22, distance(points[5], points[17]) * 1.3, distance(points[0], points[9]));
    const rawTip = points[8];
    const movement = previous ? distance(previous.rawTip, rawTip) : 0;
    const interrupted = this.pointInterrupted || elapsed > HAND_SAMPLE_GAP;
    const palmJump = previous && distance(palm, previous.palm) > size * 1.55;
    const tipJump = movement > size * 1.6 || (sparseStroke && interrupted ?
      movement > size * 0.85 : this.pointInterrupted && (movement > size * 0.6 || elapsed > 165));
    const palmMotion = previous && { x: palm.x - previous.rawPalm.x, y: palm.y - previous.rawPalm.y };
    const fastPoint = sparseStroke && pose === 'point' && elapsed <= maxGap && (palmJump || tipJump) &&
      followsFastPoint(previous, palmMotion, rawTip, size, elapsed, interrupted);
    if (!previous || previous.pose !== pose || elapsed > maxGap || (palmJump && !fastPoint)) {
      this.reset();
      this.sample = { pose, palm, rawPalm: palm, size, tip: rawTip, rawTip, timestamp };
      this.anchor = palm;
      this.sweepStart = palm;
      this.steadySince = timestamp;
      if (pose === 'point') this.setNeutralDepth(points, timestamp);
      else this.openScale = handDepth(points)?.scale;
      return null;
    }

    const center = mix(previous.palm, palm, 0.72);
    const rate = 4 + 20 * Math.min(1, movement / elapsed / (size / 75));
    const tip = mix(previous.tip, rawTip, 1 - Math.exp(-rate * elapsed / 1000));
    this.sample = { pose, palm: center, rawPalm: palm, palmMotion, size, tip, rawTip, timestamp };

    if (pose === 'point') {
      if (tipJump && !fastPoint) {
        this.stroke = null;
        this.setNeutralDepth(points, timestamp);
        this.sample.tip = rawTip;
        this.sample.palmMotion = null;
        return null;
      }
      this.pointInterrupted = false;
      const wasPressed = this.pointPressed;
      const contact = this.indexPressed(points, timestamp);
      if (contact === null) {
        this.pointInterrupted = true;
        this.sample = previous;
        return null;
      }
      if (!contact) {
        this.stroke = null;
        this.sample.tip = rawTip;
        return null;
      }
      if (!wasPressed) {
        this.sample.tip = rawTip;
        this.stroke = null;
        const angle = Math.atan2(rawTip.y - points[7].y, rawTip.x - points[7].x);
        return { type: 'line', from: rawTip, to: rawTip, width: fingertipWidth(size), footprintAngle: angle };
      }
      return this.pointStroke(previous.tip, tip, size);
    }

    return this.openHand(points, previous.palm, center, size, timestamp, allowPrint);
  }

  setNeutralDepth(points, timestamp) {
    calibrateIndex(this, points, timestamp);
  }

  indexPressed(points, timestamp) {
    return updateIndex(this, points, timestamp, { quickResponse: this.sparseSamples });
  }

  openHand(points, previous, center, size, timestamp, allowPrint) {
    const scale = handDepth(points)?.scale;
    this.openScale ??= scale;
    const approach = scale === undefined ? 0 : scale - this.openScale;
    const near = approach >= (this.openNear ? 0.09 : 0.18);
    if (near !== this.openNear) {
      this.openNear = near;
      this.clearing = false;
      this.anchor = center;
      this.sweepStart = center;
      this.steadySince = timestamp;
      if (near) this.printed = false;
      return null;
    }

    // Let the hand move away from a fresh print before recognizing another hold.
    if (this.printed) {
      const travel = distance(this.anchor, center);
      if (near && travel >= size * 0.4) {
        const from = this.anchor;
        this.printed = false;
        this.clearing = true;
        this.anchor = center;
        this.steadySince = timestamp;
        return { type: 'wave', from, to: center, width: size * 1.42 };
      }
      if (travel >= this.printSize * 1.6) {
        this.printed = false;
        this.anchor = center;
        this.sweepStart = center;
        this.steadySince = timestamp;
      }
      return null;
    }

    const rest = timestamp - this.steadySince;
    const moving = distance(this.anchor, center) >= size * 0.12;
    if (moving) {
      this.anchor = center;
      this.steadySince = timestamp;
    }
    const wave = from => ({ type: 'wave', from, to: center, width: size * 1.42 });
    if (this.clearing && (moving || rest < 540)) {
      return distance(previous, center) >= 1.25 ? wave(previous) : null;
    }
    if (this.clearing) {
      this.clearing = false;
      this.sweepStart = center;
    } else if (near && distance(this.sweepStart, center) >= size * 0.28) {
      this.clearing = true;
      return wave(this.sweepStart);
    }

    if (allowPrint && !moving && rest >= (near ? 440 : 330)) {
      this.anchor = center;
      this.printSize = size;
      return { type: 'print', points };
    }
    return null;
  }

  pointStroke(previousTip, tip, size) {
    const previous = this.stroke;
    const control = previous?.control ?? previousTip;
    const from = previous?.end ?? control;
    if (distance(control, tip) < 1.6) {
      if (!previous) this.stroke = { control, end: from };
      return null;
    }
    // A join on the line between adjacent controls keeps both tangents aligned.
    const to = mix(control, tip, this.sparseSamples ? 0.68 : 0.5);
    const brush = fingertipWidth(size);
    const width = previous?.width ? previous.width * 0.88 + brush * 0.12 : brush;
    this.stroke = { control: tip, end: to, width };
    return { type: 'line', from, control, to, width };
  }

  reset() {
    this.pressMetrics = null;
    this.sample = null;
    this.stroke = null;
    this.pointPressed = false;
    this.pressSamples = 0;
    this.releaseSamples = 0;
    this.pointInterrupted = false;
    this.neutralDepth = null;
    this.anchor = null;
    this.steadySince = 0;
    this.sweepStart = null;
    this.openScale = undefined;
    this.openNear = false;
    this.clearing = false;
    this.printed = false;
  }
}

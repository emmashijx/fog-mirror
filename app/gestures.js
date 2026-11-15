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

function extension(points, joints) {
  const [base, middle, end, tip] = joints.map(index => points[index]);
  const length = distance3D(base, middle) + distance3D(middle, end) + distance3D(end, tip);
  return length ? distance3D(base, tip) / length : 0;
}

export function classifyHand(points, drawing = false) {
  const [index, middle, ring, pinky] = fingers.map(joints => extension(points, joints));
  const spread = distance3D(points[8], points[20]) > distance3D(points[5], points[17]) * 1.12;
  const open = index > 0.80 && middle > 0.80 && ring > 0.77 && pinky > 0.73;
  const spreadOpen = spread && index > 0.78 && middle > 0.76 && ring > 0.70 && pinky > 0.59;
  if (open) return 'open';
  const curled = Number(middle < 0.82) + Number(ring < 0.82) + Number(pinky < 0.85);
  if (index > (drawing ? 0.73 : 0.83) && curled >= 2) return 'point';
  if (spreadOpen) return 'open';
  return 'other';
}

function handDepth(points) {
  const [wrist, index, middle, pinky, tip] = [0, 5, 9, 17, 8].map(i => points[i]);
  if (![wrist, index, middle, pinky, tip].every(point => Number.isFinite(point.z))) return null;
  const palmScale = (distance3D(wrist, index) + distance3D(wrist, pinky) +
    distance3D(wrist, middle) + distance3D(index, pinky)) / 4;
  if (palmScale < 12) return null;
  const palmDepth = (wrist.z + index.z + middle.z + pinky.z) / 4;
  return { reach: (palmDepth - tip.z) / palmScale, scale: Math.log(palmScale) };
}

const fingertipWidth = size => Math.max(7, Math.min(18, size * 0.105));

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
    const smooth = gap ? opening : previous.opening * 0.55 + opening * 0.45;
    const motion = gap ? 0 : Math.min(1, Math.abs(opening - previous.raw) * 6);
    this.sample = {
      center: gap ? center : mix(previous.center, center, 0.55),
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

export class HandGesture {
  update(pose, points, timestamp) {
    const previous = this.sample;
    // Keep a hold through one or two uncertain pose readings when the hand is still tracked.
    if (pose === 'other' && points && previous?.pose === 'open' && timestamp - previous.timestamp <= 125) return null;
    if (pose === 'other' && this.pointPressed && timestamp - previous.timestamp <= 135) {
      this.pointInterrupted = true;
      return null;
    }
    if (!points || pose === 'other') {
      this.reset();
      return null;
    }
    const palm = midpoint(points[0], points[9]);
    const size = Math.max(22, distance(points[5], points[17]) * 1.3, distance(points[0], points[9]));
    if (!previous || previous.pose !== pose || timestamp - previous.timestamp > 320 ||
        distance(palm, previous.palm) > size * 1.55) {
      this.reset();
      this.sample = { pose, palm, tip: points[8], rawTip: points[8], timestamp };
      this.anchor = palm;
      this.sweepStart = palm;
      this.steadySince = timestamp;
      if (pose === 'point') this.setNeutralDepth(points, timestamp);
      else this.openScale = handDepth(points)?.scale;
      return null;
    }

    const center = mix(previous.palm, palm, 0.72);
    const elapsed = Math.max(1, timestamp - previous.timestamp);
    const rawTip = points[8];
    const movement = distance(previous.rawTip, rawTip);
    const rate = 4 + 20 * Math.min(1, movement / elapsed / (size / 75));
    const tip = mix(previous.tip, rawTip, 1 - Math.exp(-rate * elapsed / 1000));
    this.sample = { pose, palm: center, tip, rawTip, timestamp };

    if (pose === 'point') {
      if (movement > size * 1.6 ||
          (this.pointInterrupted && (movement > size * 0.6 || elapsed > 165))) {
        this.stroke = null;
        this.setNeutralDepth(points, timestamp);
        this.sample.tip = rawTip;
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

    return this.openHand(points, previous.palm, center, size, timestamp);
  }

  setNeutralDepth(points, timestamp) {
    this.neutralDepth = handDepth(points);
    this.neutralSince = timestamp;
    this.pointPressed = false;
    this.pressSource = null;
    this.pressSamples = 0;
    this.releaseSamples = 0;
    this.pointInterrupted = false;
  }

  indexPressed(points, timestamp) {
    const depth = handDepth(points);
    if (!depth && this.pointPressed && ++this.releaseSamples < 2) return null;
    if (!depth || !this.neutralDepth) {
      this.setNeutralDepth(points, timestamp);
      return false;
    }
    const reach = depth.reach - this.neutralDepth.reach;
    const scale = depth.scale - this.neutralDepth.scale;
    const pressure = Math.max(reach, scale);
    if (this.pointPressed) {
      const held = this.pressSource === 'reach' ? reach : scale;
      if (held >= 0.07) {
        this.releaseSamples = 0;
        return true;
      }
      if (++this.releaseSamples < 2) return null;
      this.pointPressed = false;
      this.pressSamples = 0;
      return false;
    }
    // Calibrate at the starting depth before a forward movement can make a mark.
    if (timestamp - this.neutralSince >= 100 && pressure >= 0.145) {
      this.pressSamples++;
      this.pointPressed = this.pressSamples >= 2;
      if (this.pointPressed) {
        this.pressSource = reach >= scale ? 'reach' : 'scale';
        this.releaseSamples = 0;
      }
    } else {
      this.pressSamples = 0;
      if (pressure < 0.08) {
        this.neutralDepth.reach += reach * 0.05;
        this.neutralDepth.scale += scale * 0.05;
      }
    }
    return this.pointPressed;
  }

  openHand(points, previous, center, size, timestamp) {
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
    if (!near && scale !== undefined) this.openScale += approach * 0.04;

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

    if (!moving && rest >= (near ? 440 : 330)) {
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
    // Midpoints make the incoming and outgoing tangents match at every join.
    const to = midpoint(control, tip);
    const brush = fingertipWidth(size);
    const width = previous?.width ? previous.width * 0.88 + brush * 0.12 : brush;
    this.stroke = { control: tip, end: to, width };
    return { type: 'line', from, control, to, width };
  }

  reset() {
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

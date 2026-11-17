const distance3D = (first, second) =>
  Math.hypot(first.x - second.x, first.y - second.y, first.z - second.z);

export function handDepth(points) {
  const [wrist, index, middle, pinky, tip] = [0, 5, 9, 17, 8].map(index => points?.[index]);
  if (![wrist, index, middle, pinky, tip].every(point =>
    [point?.x, point?.y, point?.z].every(Number.isFinite))) return null;
  const palmScale = (distance3D(wrist, index) + distance3D(wrist, pinky) +
    distance3D(wrist, middle) + distance3D(index, pinky)) / 4;
  if (palmScale < 12) return null;
  const palmDepth = (wrist.z + index.z + middle.z + pinky.z) / 4;
  return { reach: (palmDepth - tip.z) / palmScale, scale: Math.log(palmScale) };
}

export function indexThresholds(sensitivity = 1) {
  const value = Number.isFinite(sensitivity) ? Math.max(0.5, Math.min(2, sensitivity)) : 1;
  return { sensitivity: value, press: 0.145 / value, release: 0.07 / value, adapt: 0.08 / value };
}

export function calibrateIndex(state, points, timestamp) {
  state.neutralDepth = handDepth(points);
  state.neutralSince = timestamp;
  state.pointPressed = false;
  state.pressSource = null;
  state.pressSamples = 0;
  state.releaseSamples = 0;
  state.pointInterrupted = false;
  if (!import.meta.release) {
    state.pressMetrics = state.neutralDepth ?
      { timestamp, reach: 0, scale: 0, value: 0, source: null, status: '校准中 · 保持起始距离 100 ms' } : null;
  }
}

export function updateIndex(state, points, timestamp, { adaptive = false, quickResponse = false } = {}) {
  const depth = handDepth(points);
  if (!import.meta.release) state.pressMetrics = null;
  if (!depth && state.pointPressed && ++state.releaseSamples < 2) return null;
  if (!depth || !state.neutralDepth) {
    calibrateIndex(state, points, timestamp);
    return false;
  }
  const thresholds = indexThresholds(state.sensitivity);
  const reach = depth.reach - state.neutralDepth.reach;
  const scale = depth.scale - state.neutralDepth.scale;
  const pressure = Math.max(reach, scale);
  const wasPressed = state.pointPressed;
  const source = wasPressed ? state.pressSource : reach >= scale ? 'reach' : 'scale';
  const held = source === 'reach' ? reach : scale;
  const metrics = !import.meta.release && { timestamp, reach, scale, value: wasPressed ? held : pressure, source };
  if (!import.meta.release) state.pressMetrics = metrics;
  if (wasPressed) {
    if (held >= thresholds.release) {
      state.releaseSamples = 0;
      if (!import.meta.release) metrics.status = '按下 · 保持中';
      return true;
    }
    const returnedToNeutral = quickResponse && held <= thresholds.release * 0.5 &&
      pressure < thresholds.release;
    if (!returnedToNeutral && ++state.releaseSamples < 2) {
      if (!import.meta.release) metrics.status = '抬起确认 1/2';
      return null;
    }
    state.pointPressed = false;
    state.pressSamples = 0;
    if (!import.meta.release) metrics.status = '已抬起';
    return false;
  }
  if (timestamp - state.neutralSince >= 100 && pressure >= thresholds.press) {
    state.pressSamples++;
    state.pointPressed = state.pressSamples >= 2 || (quickResponse && pressure >= thresholds.press * 1.5);
    if (state.pointPressed) {
      state.pressSource = source;
      state.releaseSamples = 0;
    }
    if (!import.meta.release) metrics.status = state.pointPressed ? '按下 · 保持中' : '按下确认 1/2';
  } else {
    state.pressSamples = 0;
    const calibrating = timestamp - state.neutralSince < 100;
    if (!import.meta.release) metrics.status = calibrating ? '校准中 · 保持起始距离 100 ms' : '抬起 · 等待前推';
    if (pressure < thresholds.adapt && (adaptive || calibrating)) {
      state.neutralDepth.reach += reach * 0.05;
      state.neutralDepth.scale += scale * 0.05;
    }
  }
  return state.pointPressed;
}

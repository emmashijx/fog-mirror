export const LIMIT_MS = 120000;
const MP4 = 'video/mp4';
const FORMATS = [MP4 + ';codecs=avc1', MP4];

export function mirrorCrop(canvas, aspect) {
  const width = Math.min(canvas.width, canvas.height * aspect);
  const height = Math.min(canvas.height, canvas.width / aspect);
  return { x: (canvas.width - width) / 2, y: (canvas.height - height) / 2, width, height };
}

export function captureCanvas(crop) {
  const canvas = document.createElement('canvas');
  // H.264 encoders can require even dimensions.
  canvas.width = Math.max(2, Math.floor(crop.width / 2) * 2);
  canvas.height = Math.max(2, Math.floor(crop.height / 2) * 2);
  return canvas;
}

export function drawCapture(target, source, crop) {
  target.getContext('2d', { alpha: false }).drawImage(source, crop.x, crop.y, crop.width, crop.height,
    0, 0, target.width, target.height);
}

export class MirrorRecorder {
  constructor(canvas, onChange, maxDuration = LIMIT_MS) {
    this.canvas = canvas;
    this.onChange = onChange;
    this.maxDuration = maxDuration;
    this.mime = typeof canvas.captureStream === 'function' && typeof MediaRecorder === 'function'
      ? FORMATS.find(type => MediaRecorder.isTypeSupported(type))
      : undefined;
    this.state = 'idle';
  }

  start({ duration = this.maxDuration, canvas = this.canvas } = {}) {
    if (!this.mime || this.session) return false;
    duration = Math.max(1, Math.min(this.maxDuration, duration));
    let stream;
    try {
      stream = canvas.captureStream(30);
      const recorder = new MediaRecorder(stream, { mimeType: this.mime, videoBitsPerSecond: 3500000 });
      const session = {
        recorder, stream, chunks: [], started: performance.now(), duration, error: null, reason: '',
      };
      recorder.ondataavailable = event => {
        if (event.data.size) session.chunks.push(event.data);
      };
      recorder.onstop = () => this.finish(session);
      recorder.onerror = () => {
        session.error = 'Recording could not be saved. Try recording again.';
        this.stop();
      };
      recorder.start(500);
      this.session = session;
      this.state = 'recording';
      this.message = '';
      session.limit = setTimeout(() => this.stop('Recording reached the selected time limit.'), duration);
      this.onChange();
      return true;
    } catch {
      stream?.getTracks().forEach(track => track.stop());
      this.message = 'Recording could not start. Try again.';
      this.onChange();
      return false;
    }
  }

  stop(reason = '') {
    const session = this.session;
    if (!session || this.state === 'stopping') return;
    session.reason = reason;
    this.state = 'stopping';
    clearTimeout(session.limit);
    session.watchdog = setTimeout(() => {
      session.error = 'Recording could not be saved. Try recording again.';
      this.finish(session);
    }, 3500);
    try {
      if (session.recorder.state !== 'inactive') session.recorder.stop();
    } catch {
      session.error = 'Recording could not be saved. Try recording again.';
      this.finish(session);
      return;
    }
    this.onChange();
  }

  finish(session) {
    if (this.session !== session) return;
    clearTimeout(session.limit);
    clearTimeout(session.watchdog);
    session.stream.getTracks().forEach(track => track.stop());
    this.state = 'idle';
    this.session = null;
    const isMp4 = session.chunks.every(chunk =>
      (chunk.type || session.recorder.mimeType || this.mime).split(';')[0] === MP4);
    if (!session.error && session.chunks.length && isMp4) {
      this.revokeClip();
      this.clip = { url: URL.createObjectURL(new Blob(session.chunks, { type: MP4 })) };
      this.message = session.reason || 'Clip ready to download.';
    } else if (!session.error && !isMp4) {
      this.message = 'This browser did not produce an MP4 video. Try another browser.';
    } else {
      this.message = session.error || 'No video was captured. Try recording a longer clip.';
    }
    this.onChange();
  }

  revokeClip() {
    if (this.clip) URL.revokeObjectURL(this.clip.url);
    this.clip = null;
  }

  dispose() {
    const session = this.session;
    this.session = null;
    this.state = 'idle';
    if (session) {
      clearTimeout(session.limit);
      clearTimeout(session.watchdog);
      if (session.recorder.state !== 'inactive') session.recorder.stop();
      session.stream.getTracks().forEach(track => track.stop());
    }
    this.revokeClip();
  }
}

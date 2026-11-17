const FINGER_CHAINS = [
  { indices: [0, 1, 2, 3, 4], color: '#ffb86b' },
  { indices: [0, 5, 6, 7, 8], color: '#68e7ff' },
  { indices: [0, 9, 10, 11, 12], color: '#c5a0ff' },
  { indices: [0, 13, 14, 15, 16], color: '#ff8ec9' },
  { indices: [0, 17, 18, 19, 20], color: '#7cf0bb' },
];

const validPoint = point => Number.isFinite(point?.x) && Number.isFinite(point?.y);
const coordinates = point => validPoint(point) ? Math.round(point.x) + ', ' + Math.round(point.y) : '未检测';

export class DebugOverlay {
  constructor(canvas, panel) {
    this.canvas = canvas;
    this.context = canvas.getContext('2d');
    this.panel = panel;
    this.fields = Object.fromEntries([...panel.querySelectorAll('[data-debug]')]
      .map(field => [field.dataset.debug, field]));
    this.enabled = false;
    this.clear('等待摄像头', '模型增强版');
  }

  setEnabled(enabled) {
    this.enabled = enabled;
    this.canvas.hidden = !enabled;
    this.panel.hidden = !enabled;
    if (enabled) this.paint();
    else this.context.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }

  update(frame) {
    this.frame = frame;
    this.mode = frame.mode;
    if (this.enabled) this.paint();
  }

  setThresholds(thresholds) {
    this.thresholds = thresholds;
    if (this.enabled) this.paint();
  }

  clear(message, mode = this.mode) {
    this.frame = null;
    this.message = message;
    this.mode = mode;
    if (this.enabled) this.paint();
  }

  expire(timestamp, maxAge) {
    if (this.frame && timestamp - this.frame.timestamp >= maxAge) {
      this.clear('追踪结果已过期，等待新画面');
    }
  }

  paint() {
    const context = this.context;
    const frame = this.frame;
    context.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.fields.mode.textContent = this.mode + ' · 调试';
    this.fields.action.textContent = '动作：' + (frame?.action ?? this.message);
    this.fields.recognition.textContent = '识别：' + (frame?.recognition ?? '等待识别结果');
    const tip = frame?.points?.[8];
    this.fields.position.textContent = '食指 #8：' + coordinates(tip) +
      (frame ? ' · ' + (frame.pressed ? '按下' : '抬起') : '');
    this.fields.tracking.textContent = frame ?
      '起雾：' + (frame.fog ? '是' : '否') + ' · ' + Math.round(frame.elapsed) + ' ms' :
      '坐标为镜面画布像素';
    const pressure = frame?.pressure;
    const format = value => Number.isFinite(value) ? value.toFixed(3) : '—';
    const threshold = value => Number.isFinite(value) ? value.toFixed(4) : '—';
    this.fields.pressure.textContent = pressure ?
      '前推：指尖 ' + format(pressure.reach) + ' · 手掌 ' + format(pressure.scale) :
      '前推：—';
    const source = pressure?.source === 'reach' ? '指尖深度' :
      pressure?.source === 'scale' ? '手掌放大' : null;
    this.fields.contact.textContent = [
      '判定值 ' + format(pressure?.value), source, pressure?.status ?? frame?.pressureHint,
    ].filter(Boolean).join(' · ');
    const confirmation = frame ? (frame.quickResponse ? ' · 强信号单帧，临界两帧' : ' · 连续 2 帧确认') : '';
    this.fields.thresholds.textContent = '按下 ≥ ' + threshold(this.thresholds?.press) +
      ' · 抬起 < ' + threshold(this.thresholds?.release) + confirmation;
    this.fields.performance.hidden = !frame?.performance;
    this.fields.performance.textContent = frame?.performance ?? '';
    this.fields.depth.hidden = !frame?.performance;
    this.fields.depth.textContent = frame?.tipCamera ?
      'FAH 指尖估计 Z：' + Math.round(frame.tipCamera.z * 1000) + ' mm（未经相机标定）' : 'FAH 指尖估计 Z：—';
    if (!frame?.points) return;

    context.save();
    context.lineWidth = 3;
    context.lineCap = 'round';
    context.lineJoin = 'round';
    context.shadowColor = '#071b24';
    context.shadowBlur = 3;
    for (const { indices, color } of FINGER_CHAINS) {
      context.strokeStyle = color;
      for (let index = 1; index < indices.length; index++) {
        this.segment(frame.points[indices[index - 1]], frame.points[indices[index]]);
      }
    }
    context.strokeStyle = '#bceef4';
    for (const [first, second] of [[5, 9], [9, 13], [13, 17]]) {
      this.segment(frame.points[first], frame.points[second]);
    }
    context.font = '600 12px system-ui, sans-serif';
    for (const [index, point] of frame.points.entries()) {
      if (!validPoint(point)) continue;
      context.fillStyle = '#ffffff';
      context.beginPath();
      context.arc(point.x, point.y, 3.5, 0, Math.PI * 2);
      context.fill();
      if (index === 8) continue;
      context.strokeStyle = '#071b24';
      context.lineWidth = 3;
      context.strokeText(String(index), point.x + 6, point.y - 6);
      context.fillText(String(index), point.x + 6, point.y - 6);
    }
    if (validPoint(tip)) {
      context.strokeStyle = '#ffe66c';
      context.lineWidth = 2;
      context.beginPath();
      context.arc(tip.x, tip.y, 12, 0, Math.PI * 2);
      context.stroke();
      this.segment({ x: tip.x - 18, y: tip.y }, { x: tip.x + 18, y: tip.y });
      this.segment({ x: tip.x, y: tip.y - 18 }, { x: tip.x, y: tip.y + 18 });
      context.fillStyle = '#ffe66c';
      context.strokeStyle = '#071b24';
      context.strokeText('#8', tip.x + 16, tip.y - 12);
      context.fillText('#8', tip.x + 16, tip.y - 12);
    }
    if (frame.pressed && validPoint(frame.brush)) {
      context.strokeStyle = '#53ff96';
      context.setLineDash([4, 4]);
      this.segment(tip, frame.brush);
      context.setLineDash([]);
      context.beginPath();
      context.arc(frame.brush.x, frame.brush.y, 6, 0, Math.PI * 2);
      context.stroke();
      context.fillStyle = '#53ff96';
      context.beginPath();
      context.arc(frame.brush.x, frame.brush.y, 3, 0, Math.PI * 2);
      context.fill();
    }
    context.restore();
  }

  segment(from, to) {
    if (!validPoint(from) || !validPoint(to)) return;
    const context = this.context;
    context.beginPath();
    context.moveTo(from.x, from.y);
    context.lineTo(to.x, to.y);
    context.stroke();
  }
}

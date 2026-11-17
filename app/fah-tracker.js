const HEALTH_PATH = '/api/fah/health';

async function request(url, signal, options = {}) {
  const response = await fetch(url, {
    ...options,
    signal: AbortSignal.any([signal, AbortSignal.timeout(15000)]),
  });
  const body = await response.json().catch(() => null);
  if (!response.ok || !body) {
    signal.throwIfAborted();
    if (url === HEALTH_PATH && (response.status === 404 || (response.ok && !body))) {
      throw new Error('当前页面没有 FAH-S 服务。请在终端运行 tools/fah 启动脚本，并打开终端显示的地址。');
    }
    throw new Error(body?.error ?? 'FAH-S 请求失败（HTTP ' + response.status + '）');
  }
  return body;
}

export async function fetchFahHealth(signal) {
  const health = await request(HEALTH_PATH, signal);
  if (typeof health.state !== 'string' || typeof health.message !== 'string') {
    throw new Error('当前页面没有可用的 FAH-S 健康接口。请打开终端显示的地址。');
  }
  return health;
}

export async function createFahTracker(signal, createFaceTracker) {
  let health = await fetchFahHealth(signal);
  const deadline = performance.now() + 90000;
  while (health.state === 'loading' && performance.now() < deadline) {
    await new Promise(resolve => setTimeout(resolve, 500));
    signal.throwIfAborted();
    health = await fetchFahHealth(signal);
  }
  if (health.state !== 'ready') throw new Error(health.message);
  const face = await createFaceTracker();
  const client = crypto.randomUUID();
  let closed = false;
  return {
    async detect(canvas, timestamp) {
      signal.throwIfAborted();
      const image = new Promise((resolve, reject) => {
        canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('无法编码摄像头画面')),
          'image/jpeg', 0.9);
      });
      const [faceResult, handResult] = await Promise.all([
        face.detect(canvas, timestamp),
        image.then(body => request('/api/fah/frame?client=' + client, signal, {
          method: 'POST',
          headers: { 'Content-Type': 'image/jpeg' },
          body,
        })),
      ]);
      signal.throwIfAborted();
      return { ...faceResult, ...handResult, gesture: null };
    },
    close() {
      if (closed) return;
      closed = true;
      face.close();
      fetch('/api/fah/reset?client=' + client, { method: 'POST', keepalive: true }).catch(() => {});
    },
  };
}

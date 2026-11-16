async function request(url, signal, options = {}) {
  const response = await fetch(url, {
    ...options,
    signal: AbortSignal.any([signal, AbortSignal.timeout(15000)]),
  });
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(body?.error ?? '请从本地 FAH 验证入口 http://127.0.0.1:8766/ 打开');
  }
  return response.json();
}

export async function createFahTracker(signal, createFaceTracker) {
  let health = await request('/api/fah/health', signal);
  const deadline = performance.now() + 90000;
  while (health.state === 'loading' && performance.now() < deadline) {
    await new Promise(resolve => setTimeout(resolve, 500));
    signal.throwIfAborted();
    health = await request('/api/fah/health', signal);
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

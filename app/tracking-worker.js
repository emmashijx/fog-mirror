// A classic worker lets MediaPipe's WebAssembly loader use importScripts.
let vision;
self.onmessage = async ({ data }) => {
  if (data.type === 'init') {
    try {
      const { createVision } = await import('./vision.js?v=fah-v1');
      vision = await createVision(data.mode);
      self.postMessage({ type: 'ready' });
    } catch (error) {
      self.postMessage({ type: 'error', message: String(error) });
    }
    return;
  }

  const { frame, timestamp } = data;
  try {
    self.postMessage({ type: 'result', timestamp, result: vision.detect(frame, timestamp) });
  } catch (error) {
    self.postMessage({ type: 'error', message: String(error) });
  } finally {
    frame.close();
  }
};

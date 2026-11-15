const WORKER_TIMEOUT_MS = 18000;

function startWorker(worker, signal) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => finish(false, new Error('Tracking took too long to start')), WORKER_TIMEOUT_MS);
    const abort = () => finish(false, signal.reason);
    function finish(ok, error) {
      clearTimeout(timer);
      worker.onmessage = null;
      worker.onerror = null;
      signal.removeEventListener('abort', abort);
      if (ok) resolve();
      else reject(error);
    }
    signal.addEventListener('abort', abort, { once: true });
    worker.onerror = event => {
      event.preventDefault();
      finish(false, new Error(event.message || 'Tracking worker failed'));
    };
    worker.onmessage = ({ data }) => finish(data.type === 'ready', new Error(data.message));
    worker.postMessage({ type: 'init' });
  });
}

export async function createTracker(signal) {
  signal.throwIfAborted();
  let worker;
  try {
    worker = new Worker(new URL('./tracking-worker.js?v=palm', import.meta.url));
    await startWorker(worker, signal);
    signal.throwIfAborted();
  } catch (error) {
    worker?.terminate();
    signal.throwIfAborted();
    const { createVision } = await import('./vision.js?v=palm');
    const vision = await createVision();
    if (signal.aborted) {
      vision.close();
      signal.throwIfAborted();
    }
    return {
      async detect(canvas, timestamp) { return vision.detect(canvas, timestamp); },
      close() { vision.close(); },
    };
  }

  const terminate = () => worker.terminate();
  signal.addEventListener('abort', terminate, { once: true });

  return {
    async detect(canvas, timestamp) {
      const frame = await createImageBitmap(canvas);
      if (signal.aborted) {
        frame.close();
        signal.throwIfAborted();
      }
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => finish(reject, new Error('Tracking timed out')), 4000);
        function finish(callback, value) {
          clearTimeout(timer);
          worker.onmessage = null;
          worker.onerror = null;
          signal.removeEventListener('abort', abort);
          callback(value);
        }
        const abort = () => finish(reject, signal.reason);
        signal.addEventListener('abort', abort, { once: true });
        worker.onmessage = ({ data }) => {
          if (data.type === 'result') finish(resolve, data.result);
          else finish(reject, new Error(data.message));
        };
        worker.onerror = event => finish(reject, new Error(event.message));
        try {
          worker.postMessage({ type: 'frame', frame, timestamp }, [frame]);
        } catch (error) {
          frame.close();
          finish(reject, error);
        }
      });
    },
    close() {
      signal.removeEventListener('abort', terminate);
      terminate();
    },
  };
}

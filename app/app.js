import { HandGesture, MouthGesture, classifyHand } from './gestures.js';
import { Mirror } from './mirror.js?v=photo-timer';
import { MirrorRecorder, captureCanvas, drawCapture, mirrorCrop } from './recording.js?v=mp4';
import { createTracker } from './tracker.js';

const INFERENCE_INTERVAL = 42;
const STALE_LANDMARKS = 320;
const PHOTO_DELAY = 3000;
const PHOTO_TYPE = 'image/jpeg';
const MP4_UNAVAILABLE = 'MP4 recording is unavailable in this browser.';
const element = id => document.getElementById(id);
const video = element('video');
const start = element('start-camera');
const startLabel = start.textContent;
const stop = element('stop-camera');
const idle = element('idle');
const live = element('live');
const liveState = element('live-state');
const status = element('status');
const record = element('record-button');
const recordLabel = record.querySelector('span');
const recording = element('recording');
const recordElapsed = element('elapsed');
const recordMessage = element('record-message');
const download = element('download');
const wetness = element('wetness');
const mirrorView = element('mirror-view');
const fullscreen = element('fullscreen');
const fullscreenMessage = element('fullscreen-message');
const cameraMenuButton = element('camera-menu-button');
const cameraMenu = element('camera-menu');
const cameraChoices = element('camera-choices');
const photoButton = element('take-photo');
const photoCountdown = element('photo-countdown');
const chooseVideo = element('choose-video');
const videoOptions = element('video-options');
const videoLength = element('video-length');
const startVideo = element('start-video');
const stopVideo = element('stop-video');
const downloadPhoto = element('download-photo');
const downloadFullscreen = element('download-fullscreen');
const cameraMessage = element('camera-message');
const mirror = new Mirror(element('mirror'));
const recorder = new MirrorRecorder(mirror.canvas, updateRecording);
let camera;
let photoUrl;
let photoMessage = '';
let photoJob;
let recordingView;
let lastRecordingState = 'idle';
let captureView = 'choices';
let captureTrigger;
let expanded = false;
let wasNativeFullscreen = false;

function isFullscreen() {
  return expanded || document.fullscreenElement === mirrorView;
}

function visibleCrop() {
  if (!isFullscreen() || !mirrorView.clientHeight) return null;
  return mirrorCrop(mirror.canvas, mirrorView.clientWidth / mirrorView.clientHeight);
}

function updateFullscreen() {
  const active = isFullscreen();
  fullscreen.setAttribute('aria-pressed', String(active));
  fullscreen.setAttribute('aria-label', active ? 'Exit fullscreen' : 'Enter fullscreen');
  fullscreen.title = active ? 'Exit fullscreen' : 'Enter fullscreen';
  fullscreenMessage.textContent = '';
  camera?.hand.reset();
}

function expandMirror(active) {
  expanded = active;
  mirrorView.classList.toggle('is-expanded', active);
  document.body.classList.toggle('mirror-expanded', active);
  updateFullscreen();
}

function setCaptureView(view, trigger) {
  captureView = view;
  if (trigger) captureTrigger = trigger;
  cameraMenu.hidden = view === 'closed';
  updateCaptureMenu();
  if (trigger) {
    const target = view === 'video' ? videoLength : recorder.state === 'recording' ? stopVideo :
      camera?.playing ? photoButton : photoUrl ? downloadPhoto : downloadFullscreen;
    target.focus({ preventScroll: true });
  }
}

function updateCaptureMenu() {
  const active = recorder.state === 'recording';
  const stopping = recorder.state === 'stopping';
  const canCapture = Boolean(camera?.playing);
  cameraMenuButton.disabled = !canCapture && !photoUrl && !recorder.clip && !active && !stopping;
  cameraMenuButton.setAttribute('aria-expanded', String(!cameraMenu.hidden));
  cameraChoices.hidden = captureView !== 'choices' || active || stopping || !canCapture;
  videoOptions.hidden = captureView !== 'video' || active || stopping || !canCapture;
  photoButton.disabled = Boolean(photoJob);
  chooseVideo.disabled = !recorder.mime;
  startVideo.disabled = !recorder.mime;
  stopVideo.hidden = !active;
  downloadPhoto.hidden = !photoUrl || active || stopping || captureView === 'video';
  setVideoDownload(downloadFullscreen, active || stopping || captureView === 'video');
  cameraMessage.textContent = stopping ? 'Saving clip…' : (photoMessage || recorder.message ||
    (!recorder.mime ? MP4_UNAVAILABLE : ''));
}

function setVideoDownload(link, busy) {
  link.hidden = !recorder.clip || busy;
  if (recorder.clip) {
    link.href = recorder.clip.url;
    link.download = 'fog-mirror.mp4';
  } else {
    link.removeAttribute('href');
  }
}

function setStatus(message, state) {
  status.textContent = message;
  status.dataset.state = state;
}

function updateCamera() {
  idle.hidden = Boolean(camera?.playing);
  live.hidden = !camera?.playing;
  if (!camera) liveState.textContent = 'Live mirror';
  start.disabled = Boolean(camera);
  stop.hidden = !camera?.stream;
  updateRecording();
}

function updateRecording() {
  const active = recorder.state === 'recording';
  const stopping = recorder.state === 'stopping';
  const finished = recorder.state === 'idle' && lastRecordingState !== 'idle';
  lastRecordingState = recorder.state;
  if (finished) recordingView = null;
  record.disabled = stopping || (!active && (!camera?.playing || !recorder.mime));
  recordLabel.textContent = active ? 'Stop recording' : stopping ? 'Saving clip…' : 'Record mirror';
  recording.hidden = !active;
  record.classList.toggle('is-recording', active);
  recordMessage.textContent = recorder.message || (!recorder.mime ? MP4_UNAVAILABLE : '');
  updateElapsed();
  setVideoDownload(download, active || stopping);
  if (finished && isFullscreen()) setCaptureView('choices');
  else updateCaptureMenu();
}

function clock(seconds) {
  return Math.floor(seconds / 60) + ':' + String(seconds % 60).padStart(2, '0');
}

function updateElapsed() {
  if (recorder.state !== 'recording') return;
  const duration = recorder.session.duration / 1000;
  const elapsed = Math.min(duration, Math.floor((performance.now() - recorder.session.started) / 1000));
  recordElapsed.textContent = clock(elapsed) + ' / ' + clock(duration);
}

function finishCamera(message = 'Camera off', state = 'idle') {
  const session = camera;
  if (!session) return;
  cancelPhoto();
  recorder.stop(state === 'error' ? 'Camera disconnected. Clip ready to download.' : '');
  camera = null;
  session.controller.abort();
  session.tracker?.close();
  cancelAnimationFrame(session.animation);
  session.stream?.getTracks().forEach(track => track.stop());
  video.srcObject = null;
  mirror.clear();
  start.textContent = state === 'error' ? 'Retry camera' : startLabel;
  setStatus(message, state);
  updateCamera();
}

function cameraError(error) {
  if (error.name === 'NotAllowedError' || error.name === 'SecurityError') {
    return 'Camera access was denied. Allow camera access in Chrome, then retry.';
  }
  if (error.name === 'NotFoundError') return 'No camera found. Connect a camera and try again.';
  if (error.name === 'NotReadableError') return 'The camera is busy or unavailable. Close other camera apps and retry.';
  return 'The camera could not start. Try again.';
}

async function startCamera() {
  if (camera) return;
  if (!navigator.mediaDevices?.getUserMedia) {
    setStatus('Camera access requires localhost or HTTPS.', 'error');
    return;
  }
  const session = {
    controller: new AbortController(),
    mouth: new MouthGesture(),
    hand: new HandGesture(),
    lastResult: -Infinity,
    lastInference: -Infinity,
    lastVideoTime: -1,
  };
  camera = session;
  start.textContent = 'Waiting for camera…';
  setStatus('Waiting for camera access…', 'loading');
  updateCamera();

  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' },
      audio: false,
    });
    if (camera !== session) {
      stream.getTracks().forEach(track => track.stop());
      return;
    }
    session.stream = stream;
    const track = stream.getVideoTracks()[0];
    track.addEventListener('ended', () => {
      if (camera === session) finishCamera('Camera disconnected. Check the connection and retry.', 'error');
    }, { once: true, signal: session.controller.signal });
    if (track.readyState === 'ended') {
      finishCamera('Camera disconnected. Check the connection and retry.', 'error');
      return;
    }
    video.srcObject = stream;
    updateCamera();
    await video.play();
    if (camera !== session) return;
  } catch (error) {
    if (camera === session) finishCamera(cameraError(error), 'error');
    return;
  }

  session.playing = true;
  setStatus('Starting face and hand tracking…', 'loading');
  updateCamera();
  session.animation = requestAnimationFrame(timestamp => render(session, timestamp));

  try {
    session.tracker = await createTracker(session.controller.signal);
    if (camera !== session) {
      session.tracker.close();
      return;
    }
    setStatus('Camera ready', 'live');
  } catch (error) {
    if (camera === session) trackingError(error);
  }
}

function trackingError(error) {
  console.error('Fog Mirror tracking:', error);
  liveState.textContent = 'Live mirror';
  setStatus('Tracking could not start or stopped. Turn the camera off and back on to retry.', 'error');
}

function render(session, timestamp) {
  if (camera !== session) return;
  const seconds = Math.max(0, (timestamp - (session.lastFrame ?? timestamp)) / 1000);
  session.lastFrame = timestamp;
  mirror.fade(seconds);
  if (session.fog && timestamp - session.lastResult < STALE_LANDMARKS) mirror.fogAt(session.fog, Math.min(seconds, 0.1));
  mirror.draw(video);
  if (recordingView && recorder.state === 'recording') {
    drawCapture(recordingView.canvas, mirror.canvas, recordingView.crop);
  }
  updateElapsed();

  if (session.tracker && !session.busy && timestamp - session.lastInference >= INFERENCE_INTERVAL &&
      video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && video.currentTime !== session.lastVideoTime) {
    session.lastInference = timestamp;
    session.lastVideoTime = video.currentTime;
    infer(session, timestamp);
  }
  session.animation = requestAnimationFrame(next => render(session, next));
}

async function infer(session, timestamp) {
  session.busy = true;
  try {
    const { face, hand, handWorld } = await session.tracker.detect(mirror.captureFrame(video), timestamp);
    if (camera !== session || performance.now() - timestamp > STALE_LANDMARKS) return;
    const points = face && Object.fromEntries(Object.entries(face).map(([i, point]) => [i, mirror.toMirror(point)]));
    session.fog = session.mouth.update(points, timestamp);
    session.lastResult = timestamp;
    const pointsInMirror = hand?.map(point => mirror.toMirror(point));
    const pose = hand ? classifyHand(handWorld ?? hand, session.hand.pointPressed) : 'other';
    const view = visibleCrop();
    const outside = pointsInMirror && (pose === 'point' || session.hand.pointPressed) &&
      !mirror.inDrawingArea(pointsInMirror[8], view);
    if (outside) session.hand.reset();
    const action = outside ? null : session.hand.update(pose, pointsInMirror, timestamp);
    const label = session.hand.pointPressed ? 'Drawing' : 'Live mirror';
    if (liveState.textContent !== label) liveState.textContent = label;
    if (action?.type === 'print') session.hand.printed = mirror.stamp(action.points, view);
    else if (action) mirror.wipe(action);
  } catch (error) {
    if (camera !== session) return;
    session.tracker.close();
    session.tracker = null;
    trackingError(error);
  } finally {
    session.busy = false;
  }
}

start.addEventListener('click', startCamera);
stop.addEventListener('click', () => finishCamera());
function updateWetness() {
  const value = wetness.valueAsNumber;
  mirror.setWetness(value / 100);
  wetness.setAttribute('aria-valuetext', value === 0 ? 'Dry fog' : value === 100 ? 'Wet fog' : value + '% wet');
}
wetness.addEventListener('input', updateWetness);
updateWetness();

fullscreen.addEventListener('click', async () => {
  if (isFullscreen()) {
    expandMirror(false);
    if (document.fullscreenElement === mirrorView) {
      try {
        await document.exitFullscreen();
      } catch {
        fullscreenMessage.textContent = 'Press Escape to leave fullscreen.';
      }
    }
    return;
  }
  expandMirror(true);
  if (document.fullscreenEnabled) {
    try {
      await mirrorView.requestFullscreen();
    } catch {
      // The expanded mirror still fills the browser viewport.
    }
  }
});
document.addEventListener('fullscreenchange', () => {
  if (document.fullscreenElement === mirrorView) {
    wasNativeFullscreen = true;
    updateFullscreen();
  } else if (wasNativeFullscreen) {
    wasNativeFullscreen = false;
    expandMirror(false);
  }
});
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && expanded && !document.fullscreenElement) expandMirror(false);
});

cameraMenuButton.addEventListener('click', () => {
  if (cameraMenu.hidden) setCaptureView('choices', cameraMenuButton);
  else setCaptureView('closed');
});
document.addEventListener('click', event => {
  if (!cameraMenu.hidden && !cameraMenu.contains(event.target) &&
      !cameraMenuButton.contains(event.target) && !record.contains(event.target)) {
    setCaptureView('closed');
  }
});
cameraMenu.addEventListener('keydown', event => {
  if (event.key !== 'Escape') return;
  setCaptureView('closed');
  captureTrigger?.focus();
});
chooseVideo.addEventListener('click', () => {
  photoMessage = '';
  setCaptureView('video');
  videoLength.focus();
});
element('camera-back').addEventListener('click', () => {
  setCaptureView('choices');
  chooseVideo.focus();
});
function cancelPhoto() {
  if (!photoJob) return;
  clearTimeout(photoJob.timer);
  photoJob = null;
  photoCountdown.hidden = true;
  photoMessage = '';
}

function capturePhoto(job) {
  photoCountdown.hidden = true;
  mirror.draw(video);
  const crop = visibleCrop();
  const source = crop ? captureCanvas(crop) : mirror.canvas;
  if (crop) drawCapture(source, mirror.canvas, crop);
  source.toBlob(blob => {
    if (photoJob !== job) return;
    photoJob = null;
    const saved = blob?.type === PHOTO_TYPE;
    if (saved) {
      if (photoUrl) URL.revokeObjectURL(photoUrl);
      photoUrl = URL.createObjectURL(blob);
      downloadPhoto.href = photoUrl;
      downloadPhoto.download = 'fog-mirror.jpg';
    }
    photoMessage = saved ? 'Photo ready to download.' : 'Photo could not be saved as a JPG. Try again.';
    setCaptureView('choices');
    if (saved) downloadPhoto.focus({ preventScroll: true });
  }, PHOTO_TYPE, 0.94);
}

photoButton.addEventListener('click', () => {
  if (!camera?.playing || photoJob) return;
  const job = { ends: performance.now() + PHOTO_DELAY };
  photoJob = job;
  photoMessage = '';
  setCaptureView('closed');
  captureTrigger?.focus({ preventScroll: true });
  function tick() {
    if (photoJob !== job) return;
    const remaining = job.ends - performance.now();
    if (remaining <= 0) {
      capturePhoto(job);
      return;
    }
    const seconds = Math.ceil(remaining / 1000);
    photoCountdown.textContent = String(seconds);
    photoCountdown.setAttribute('aria-label', 'Taking photo in ' + seconds + (seconds === 1 ? ' second' : ' seconds'));
    photoCountdown.hidden = false;
    job.timer = setTimeout(tick, Math.max(1, remaining - (seconds - 1) * 1000));
  }
  tick();
});
videoOptions.addEventListener('submit', event => {
  event.preventDefault();
  if (!camera?.playing || recorder.state !== 'idle') return;
  photoMessage = '';
  const crop = visibleCrop();
  recordingView = crop ? { crop, canvas: captureCanvas(crop) } : null;
  if (recordingView) drawCapture(recordingView.canvas, mirror.canvas, crop);
  if (recorder.start({ duration: Number(videoLength.value) * 1000, canvas: recordingView?.canvas ?? mirror.canvas })) {
    setCaptureView('closed');
    captureTrigger?.focus({ preventScroll: true });
  } else {
    recordingView = null;
  }
});
stopVideo.addEventListener('click', () => recorder.stop());
record.addEventListener('click', () => {
  if (recorder.state === 'recording') recorder.stop();
  else if (camera?.playing) {
    photoMessage = '';
    setCaptureView('video', record);
  }
});
window.addEventListener('pagehide', () => {
  recorder.dispose();
  if (photoUrl) URL.revokeObjectURL(photoUrl);
  finishCamera();
});
updateFullscreen();
updateCamera();

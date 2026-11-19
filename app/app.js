import { FAH_STROKE_GAP, isSpreadHand } from './gestures.js?v=fah-fast-stroke';
import { createInteraction, RECOGNITION_MODES } from './recognition.js?v=fah-fast-stroke';
import { formatFahMemory } from './fah-metrics.js?v=fah-v3';
import { fetchFahHealth } from './fah-tracker.js?v=fah-entry';
import { Mirror } from './mirror.js?v=recognition-v1';
import { MirrorRecorder, captureCanvas, drawCapture, mirrorCrop } from './recording.js?v=mp4';
import { createTracker } from './tracker.js?v=fah-entry';
import { DebugOverlay } from './debug-overlay.js?v=fah-stroke';
import { indexThresholds } from './index-pressure.js?v=fah-stroke';

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
const resetInteraction = element('reset-interaction');
const recognitionMode = !import.meta.release && element('recognition-mode');
const recognitionDescription = !import.meta.release && element('recognition-description');
const handReading = !import.meta.release && element('hand-reading');
const mouthReading = !import.meta.release && element('mouth-reading');
const trackingReading = !import.meta.release && element('tracking-reading');
const debugEnabled = !import.meta.release && element('debug-enabled');
const debugToggle = !import.meta.release && element('debug-toggle');
const indexSensitivity = !import.meta.release && element('index-sensitivity');
const indexSensitivityValue = !import.meta.release && element('index-sensitivity-value');
const resetSensitivity = !import.meta.release && element('reset-sensitivity');
const fahDetails = !import.meta.release && element('fah-details');
const fahHealth = !import.meta.release && element('fah-health');
const fahPerformance = !import.meta.release && element('fah-performance');
const fahReport = !import.meta.release && element('fah-report');
let fahHealthRequest;
const mirror = new Mirror(element('mirror'));
const debug = !import.meta.release && new DebugOverlay(element('debug-overlay'), element('debug-status'));
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
  camera?.hand?.reset();
  if (!import.meta.release) debug.clear(camera?.playing ? '视图已切换，等待新手势' : '等待摄像头');
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
  resetInteraction.disabled = !camera?.playing;
  if (!import.meta.release) {
    debugToggle.hidden = !camera?.playing;
    if (!camera) {
      handReading.textContent = '等待摄像头';
      mouthReading.textContent = '等待摄像头';
      trackingReading.textContent = '尚未启动';
    }
  }
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
  session.trackingController?.abort();
  session.tracker?.close();
  cancelAnimationFrame(session.animation);
  session.stream?.getTracks().forEach(track => track.stop());
  video.srcObject = null;
  mirror.clear();
  if (!import.meta.release) debug.clear('等待摄像头');
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

  await loadTracking(session);
}

async function loadTracking(session) {
  session.trackingController?.abort();
  session.tracker?.close();
  session.tracker = null;
  session.busy = false;
  session.fog = null;
  session.lastResult = -Infinity;
  session.lastResultReceived = -Infinity;
  session.lastInference = -Infinity;
  session.stale = false;
  session.dropped = 0;
  session.mode = !import.meta.release ? recognitionMode.value : 'enhanced';
  Object.assign(session, createInteraction(session.mode, !import.meta.release ? indexSensitivity.valueAsNumber : 1));
  const controller = new AbortController();
  session.trackingController = controller;
  mirror.legacyFog = !import.meta.release && session.mode === 'original';
  mirror.clear();
  liveState.textContent = 'Live mirror';
  if (!import.meta.release) {
    session.acceptedTimes = [];
    debug.clear('正在加载模型', RECOGNITION_MODES[session.mode].label);
    handReading.textContent = '正在加载';
    mouthReading.textContent = '正在加载';
    trackingReading.textContent = '正在加载模型';
    fahPerformance.textContent = '尚无实测数据';
  }
  setStatus('Starting face and hand tracking…', 'loading');
  try {
    const tracker = await createTracker(controller.signal, session.mode);
    if (camera !== session || controller.signal.aborted) {
      tracker.close();
      return;
    }
    session.tracker = tracker;
    setStatus('Camera ready', 'live');
    if (!import.meta.release) {
      trackingReading.textContent = '已加载，等待画面';
      if (session.mode === 'fah') refreshFahHealth();
    }
  } catch (error) {
    if (camera === session && !controller.signal.aborted) trackingError(error);
  }
}

function trackingError(error) {
  liveState.textContent = 'Live mirror';
  if (!import.meta.release) {
    console.error('Fog Mirror tracking:', error);
    debug.clear('追踪已停止，可切换方案重试');
    handReading.textContent = '追踪已停止';
    mouthReading.textContent = '追踪已停止';
    trackingReading.textContent = camera?.mode === 'fah' ? error.message : '加载或识别失败，可切换方案重试';
    if (camera?.mode === 'fah') fahPerformance.textContent = '尚无实测数据：' + error.message;
  }
  setStatus('Tracking could not start or stopped. Turn the camera off and back on to retry.', 'error');
}

function render(session, timestamp) {
  if (camera !== session) return;
  const seconds = Math.max(0, (timestamp - (session.lastFrame ?? timestamp)) / 1000);
  session.lastFrame = timestamp;
  mirror.fade(seconds);
  const fah = !import.meta.release && session.mode === 'fah';
  const lastUpdate = fah ? session.lastResultReceived : session.lastResult;
  const resultAge = timestamp - lastUpdate;
  if (Number.isFinite(lastUpdate) && resultAge >= STALE_LANDMARKS && !session.stale) {
    session.stale = true;
    session.fog = null;
    if (!fah || !session.hand.pointPressed) session.hand.reset();
    session.mouth.reset();
    liveState.textContent = 'Live mirror';
    if (!import.meta.release) {
      debug.clear(session.dropped ? '识别结果超时，等待新画面' : '追踪结果已过期，等待新画面');
      handReading.textContent = '等待新画面';
      mouthReading.textContent = '等待新画面';
      trackingReading.textContent = '画面已过期，已暂停交互';
    }
    setStatus('Tracking paused. Waiting for a fresh frame…', 'loading');
  }
  if (fah && session.hand.pointPressed && resultAge >= FAH_STROKE_GAP) session.hand.reset();
  if (session.fog && timestamp - session.lastResult < STALE_LANDMARKS) {
    mirror.fogAt(session.fog, !import.meta.release && session.mode === 'original' ? Math.min(seconds, 0.1) : seconds);
  }
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

function fahMeasurementLabel(metrics, fps) {
  const model = metrics.modelFps?.toFixed(1) ?? '预热中';
  return '有效追踪 ' + (fps?.toFixed(1) ?? '—') + ' FPS · 模型 ' + model +
    ' FPS · ' + formatFahMemory(metrics);
}

async function infer(session, timestamp) {
  const controller = session.trackingController;
  session.busy = true;
  try {
    const { face, hand, handWorld, handPredicted, gesture, expressions, metrics, tipCamera } =
      await session.tracker.detect(mirror.captureFrame(video), timestamp);
    if (camera !== session || controller.signal.aborted) return;
    const received = performance.now();
    const elapsed = received - timestamp;
    if (elapsed > STALE_LANDMARKS) {
      session.dropped++;
      if (!import.meta.release) {
        trackingReading.textContent = Math.round(elapsed) + ' ms · 已丢弃过期结果';
        if (session.stale || !Number.isFinite(session.lastResult)) {
          debug.clear('识别结果超时（' + Math.round(elapsed) + ' ms），等待新画面');
        }
        if (metrics) {
          fahPerformance.textContent = fahMeasurementLabel(metrics, null) +
            ' · 样本 ' + metrics.sampleCount + ' · 本帧超过 ' + STALE_LANDMARKS + ' ms，未用于绘画';
        }
      }
      if (session.dropped >= 3) {
        setStatus(!import.meta.release
          ? session.mode === 'fah'
            ? 'FAH-S 已返回结果，但连续超时，镜面交互已暂停。可切换到仅修复版。'
            : 'Tracking is too slow. Try the landmark rules mode.'
          : 'Tracking paused. Waiting for a fresh frame…', 'loading');
      }
      return;
    }
    session.dropped = 0;
    session.stale = false;
    setStatus('Camera ready', 'live');
    const points = face && Object.fromEntries(Object.entries(face).map(([i, point]) => [i, mirror.toMirror(point)]));
    session.fog = session.mouth.update(points, timestamp, expressions);
    session.lastResult = timestamp;
    session.lastResultReceived = received;
    const pointsInMirror = hand?.map(point => mirror.toMirror(point));
    const { pose, source } = !import.meta.release && handPredicted ? { pose: 'other', source: 'none' } :
      session.classify(handWorld ?? hand, gesture, session.hand.pointPressed, pointsInMirror);
    const view = visibleCrop();
    const outside = pointsInMirror && (import.meta.release || !handPredicted) && (pose === 'point' || session.hand.pointPressed) &&
      !mirror.inDrawingArea(pointsInMirror[8], view);
    if (outside) session.hand.reset();
    const action = outside ? null : session.hand.update(pose, pointsInMirror, timestamp,
      isSpreadHand(handWorld ?? hand), { predicted: !import.meta.release && handPredicted });
    const pausedStroke = !import.meta.release && session.mode === 'fah' && session.hand.pointInterrupted;
    const label = session.hand.pointPressed && !pausedStroke ? 'Drawing' : 'Live mirror';
    if (liveState.textContent !== label) liveState.textContent = label;
    if (action?.type === 'print') session.hand.printed = mirror.stamp(action.points, view);
    else if (action) mirror.wipe(action);
    if (!import.meta.release) updateTrackingReadout(session, {
      hand, face, handPredicted, gesture, expressions, metrics, tipCamera, received, elapsed,
      timestamp, pointsInMirror, pose, source, outside, action, pausedStroke,
    });
  } catch (error) {
    if (camera !== session || controller.signal.aborted) return;
    session.fog = null;
    session.hand.reset();
    session.mouth.reset();
    session.tracker?.close();
    session.tracker = null;
    trackingError(error);
  } finally {
    if (session.trackingController === controller) session.busy = false;
  }
}

function updateTrackingReadout(session, {
  hand, face, handPredicted, gesture, expressions, metrics, tipCamera, received, elapsed,
  timestamp, pointsInMirror, pose, source, outside, action, pausedStroke,
}) {
  const names = {
    Open_Palm: '张手', Pointing_Up: '食指向上', Closed_Fist: '握拳', Thumb_Up: '点赞',
    Thumb_Down: '拇指向下', Victory: '胜利手势', ILoveYou: '爱你手势', None: '未确认',
  };
  const state = outside ? '移入镜面中央' : pausedStroke ? '笔画暂停 · 等待下一帧' :
    handPredicted ? '暂未检测到手' :
    session.hand.pointPressed ? '正在画线' :
    session.hand.clearing ? '挥擦中' : session.hand.printed ? '已留手印' :
    pose === 'point' ? '食指前推可画线' : pose === 'open' ? '张手' : '其他姿势';
  const modelLabel = gesture ? (names[gesture.name] ?? gesture.name) + ' ' + Math.round(gesture.score * 100) + '%' : '';
  handReading.textContent = !hand ? '未检测到手' :
    [modelLabel, state, source === 'rules' && session.mode === 'enhanced' ? '规则辅助' : ''].filter(Boolean).join(' · ');
  mouthReading.textContent = !face ? '未检测到人脸' : session.fog ? '正在起雾' : '闭合或等待确认';
  if ((session.mode === 'enhanced' || session.mode === 'fah') && face) {
    mouthReading.textContent += Number.isFinite(expressions?.jawOpen) ?
      ' · 张嘴 ' + Math.round(expressions.jawOpen * 100) + '%' : ' · 表情数据缺失';
  }
  session.acceptedTimes.push(timestamp);
  if (session.acceptedTimes.length > 60) session.acceptedTimes.shift();
  const span = timestamp - session.acceptedTimes[0];
  const fps = span > 0 ? (session.acceptedTimes.length - 1) * 1000 / span : null;
  trackingReading.textContent = Math.round(elapsed) + ' ms · ' + (fps?.toFixed(1) ?? '—') + ' FPS';
  let performanceLabel = null;
  if (metrics) {
    performanceLabel = fahMeasurementLabel(metrics, fps);
    fahPerformance.textContent = performanceLabel + ' · 样本 ' + metrics.sampleCount;
  }
  debug.update({
    timestamp: session.mode === 'fah' ? received : timestamp,
    mode: RECOGNITION_MODES[session.mode].label,
    points: handPredicted ? null : pointsInMirror ?? null,
    brush: action?.type === 'line' ? action.to : session.hand.stroke?.end ?? null,
    pressed: Boolean(session.hand.pointPressed),
    quickResponse: session.mode === 'fah',
    pressure: session.hand.pressMetrics?.timestamp === timestamp ? session.hand.pressMetrics : null,
    pressureHint: !hand || handPredicted ? '等待手部实测关键点' : outside ? '将食指移入镜面中央' :
      pose === 'point' ? '等待有效的手部深度' : '伸出食指，收起其他手指',
    action: !hand ? '未检测到手' : state,
    recognition: handPredicted ? '模型补帧 · 暂停绘画' : !hand ? '未检测到手' :
      [modelLabel, source === 'projection' ? '画面关键点辅助' : source === 'model' ? '模型分类' :
      session.mode === 'enhanced' ? '规则辅助' : '关键点规则'].filter(Boolean).join(' · '),
    fog: Boolean(session.fog),
    elapsed,
    performance: performanceLabel,
    tipCamera: handPredicted ? null : tipCamera,
  });
}

function updateDebugMode() {
  const enabled = debugEnabled.checked;
  debug.expire(performance.now(), STALE_LANDMARKS);
  debug.setEnabled(enabled);
  debugToggle.setAttribute('aria-pressed', String(enabled));
  debugToggle.setAttribute('aria-label', enabled ? '隐藏调试叠层' : '显示调试叠层');
  debugToggle.title = enabled ? '隐藏调试叠层' : '显示调试叠层';
}

function updateSensitivity(recalibrate = true) {
  const thresholds = indexThresholds(indexSensitivity.valueAsNumber);
  const label = thresholds.sensitivity.toFixed(2) + '×';
  indexSensitivityValue.value = label;
  indexSensitivity.setAttribute('aria-valuetext', label + '，越大越容易按下');
  debug.setThresholds(thresholds);
  if (camera?.hand) {
    camera.hand.sensitivity = thresholds.sensitivity;
    if (recalibrate) {
      camera.hand.reset();
      liveState.textContent = 'Live mirror';
      handReading.textContent = '灵敏度已更新，保持起始距离后再前推';
    }
  }
  if (recalibrate) debug.clear('灵敏度已更新，保持起始距离后再前推');
}

async function refreshFahHealth() {
  fahHealthRequest?.abort();
  fahReport.hidden = true;
  if (recognitionMode.value !== 'fah') return;
  const controller = new AbortController();
  fahHealthRequest = controller;
  fahHealth.textContent = '正在检查本机服务';
  try {
    const health = await fetchFahHealth(AbortSignal.any([controller.signal, AbortSignal.timeout(5000)]));
    if (controller.signal.aborted) return;
    fahHealth.textContent = health.message;
    fahReport.hidden = health.state !== 'ready';
  } catch (error) {
    if (controller.signal.aborted) return;
    fahHealth.textContent = error.name === 'TimeoutError' ? '本机 FAH-S 服务检查超时，请查看终端。' : error.message;
  }
}

function updateRecognitionMode() {
  recognitionDescription.textContent = RECOGNITION_MODES[recognitionMode.value].description;
  fahDetails.hidden = recognitionMode.value !== 'fah';
  void refreshFahHealth();
  if (!camera?.playing) debug.clear('等待摄像头', RECOGNITION_MODES[recognitionMode.value].label);
}
if (!import.meta.release) {
  debugEnabled.addEventListener('change', updateDebugMode);
  debugToggle.addEventListener('click', () => {
    debugEnabled.checked = !debugEnabled.checked;
    updateDebugMode();
  });
  indexSensitivity.addEventListener('input', () => updateSensitivity());
  resetSensitivity.addEventListener('click', () => {
    indexSensitivity.value = '1';
    updateSensitivity();
  });
  recognitionMode.addEventListener('change', () => {
    updateRecognitionMode();
    cancelPhoto();
    recorder.stop('Recognition mode changed. Clip ready to download.');
    if (camera?.playing) loadTracking(camera);
    else {
      mirror.legacyFog = recognitionMode.value === 'original';
      mirror.clear();
    }
  });
  updateRecognitionMode();
  updateSensitivity(false);
  updateDebugMode();
}
resetInteraction.addEventListener('click', () => {
  if (!camera?.playing) return;
  camera.hand?.reset();
  camera.mouth?.reset();
  camera.fog = null;
  mirror.clear();
  liveState.textContent = 'Live mirror';
  if (!import.meta.release) {
    debug.clear('已重新校准，等待新手势');
    handReading.textContent = '已重新校准，等待手势';
    mouthReading.textContent = '雾气已清除';
  }
});

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

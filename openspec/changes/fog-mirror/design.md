# Design

## Context

Fog Mirror is a greenfield desktop web prototype. The [proposal](proposal.md) explains the experience. Start with desktop Chrome on localhost or HTTPS as the first verification target.

## Goals / Non-Goals

**Goals**

- Share the same rendered image between the live mirror and recorded clip.
- Keep tracking and compositing responsive while the recorder is active.
- Keep camera frames and clips on the device. Serve the app and model assets as static files.

**Non-Goals**

- System-wide screen capture, microphone input, and cloud recording storage are outside the prototype scope.

## Decisions

### Use face and hand landmarks from the webcam

Use MediaPipe Face Landmarker and Hand Landmarker in video mode with one face and one hand. Pin the package and serve its matching model and runtime assets. Run inference on downscaled frames with a bounded cadence and keep at most one frame in flight. Use a worker where supported by the chosen runtime. A generic gesture classifier was considered for wiping. Landmark coordinates give the continuous fingertip path the effect needs. [Face Landmarker for Web](https://developers.google.com/edge/mediapipe/solutions/vision/face_landmarker/web_js) · [Hand Landmarker for Web](https://developers.google.com/edge/mediapipe/solutions/vision/hand_landmarker?tab=Web)

### Render a fog mask in mirror coordinates

Draw the camera frame and fog effect on one visible canvas. Apply the same mirror and scaling transform to the video and both sets of landmarks. Smooth the mouth center and normalized lip opening, then use an opening threshold with separate start and stop values to avoid flicker. Add soft opacity around the mouth, increasing deposition with opening and lip movement while the mouth stays open. Keep the fog visible for 45 seconds after the last deposit, then ease its opacity to zero at 60 seconds. Apply the current opacity to the mask before resuming deposition so faded fog does not brighten again. A shared canvas keeps the visible effect and the captured output aligned.

### Distinguish pointing, holding, and waving

Classify the hand pose from finger extension and fingertip spread. Establish a neutral pointing depth inside the drawing margin. Use fingertip depth relative to the palm and apparent palm size to infer a forward press, then release using the same signal with a lower threshold. Render an oval footprint for the initial contact and draw quadratic curves between midpoints of adjacent samples so the tangents match at every join. Stop drawing on retraction, a pose change, tracking loss, an implausible jump, or entry into the edge margin. An open hand leaves one print after a brief hold. An increase in apparent palm size arms area clearing, which begins once the user waves. Returning to the starting distance ends the sweep.

### Clear a hand-shaped opening

When the open hand meets the hold threshold, join a rounded palm and thumb web to tapered finger outlines based on the hand landmarks. Wait until the outline fits within the view. Feather the combined alpha mask and subtract it directly from the same fog layer used by fingertip lines. Fresh condensation then covers either kind of wipe in the same way. Let the open hand move away from its new print before recognizing a new gesture. [MediaPipe hand landmark output](https://developers.google.com/edge/mediapipe/solutions/vision/hand_landmarker)

### Adjust fog opacity

As wetness rises, blend a thinner white veil with additional cached layers of stationary water beads. Clip the result to the fog mask and render it to the same canvas the recorder captures.

### Frame fullscreen captures

Fullscreen displays a centered crop of the mirror canvas that fills the display without stretching. If native fullscreen is unavailable, the mirror fills the browser viewport. Show the photo countdown over the preview, then encode the visible canvas crop to JPEG. A recording uses the framing from the moment it starts so entering or leaving fullscreen during recording keeps the file dimensions stable.

### Capture the canvas stream

Use `canvas.captureStream()` with `MediaRecorder` and choose a supported MP4 MIME type at runtime, preferring H.264. If the browser cannot encode MP4, disable recording and explain why. Keep recording controls outside the canvas. Finalize once on Stop or camera loss, and offer a download only when usable data is available. Release the previous clip URL when replacing it and release capture tracks when the session ends. Tab capture was considered. Canvas capture lets users record the intended mirror directly from the app. [W3C canvas capture](https://www.w3.org/TR/mediacapture-fromelement/#html-canvas-element-media-capture-extensions) · [W3C recording API](https://www.w3.org/TR/mediastream-recording/)

## Risks / Trade-offs

- Low lighting or occlusion can interrupt tracking. Drop stale landmarks, stop adding fog when the face is unavailable, and restart a wipe from its reacquired position.
- Backlighting and motion blur can weaken landmark tracking. Draw a silhouette after a stable hold.
- Tracking and recording contend for compute. Render independently of inference, bound the inference rate, and tune capture resolution and frame rate on a test desktop while recording.
- In-memory recording uses more memory as a clip grows. Bound clip duration, show the limit before recording, and finalize automatically at the limit.

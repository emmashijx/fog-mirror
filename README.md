# Emma’s Fog Mirror

Emma’s Fog Mirror is a local desktop Chrome prototype. From the project folder, run:

```sh
python3 tools/start.py
```

Open [Emma’s Fog Mirror](http://127.0.0.1:8765/) in Chrome and select **enable your camera to start**. Keep your face and hand in frame.
The preview uses only Python's standard library; there is no npm install or build step.
On Windows, use `python tools/start.py` with an installed Python 3 interpreter.
For Mac onboarding, project structure, known limits and acceptance steps, see
[开发交接说明](docs/MAC_HANDOFF.md). A [ready-to-send Codex prompt](docs/CODEX_MAC_PROMPT.md)
is included for the receiving developer.

- Open and move your mouth to add fog. After you stop adding fog, it lingers and fades out at one minute.
- Use **Fog appearance** to move from dry mist to more transparent wet fog with stationary water beads.
- Extend only your index finger inside the mirror. Push it toward the camera to press a small fingertip shape into the fog, then move it sideways to draw. Pull back at the end to lift off while keeping your finger extended. Drawing also stops near the edges.
- Spread your fingers and hold your hand mostly still to clear a hand-shaped opening. Fresh fog covers the opening exactly as it covers a line.
- Show your open hand, move it closer to the camera, then wave to clear a broad path.
- Select **Enter fullscreen** in the upper-right corner to fill the display. Press Esc or use **Exit fullscreen** to return.
- Open the camera menu to take a JPG photo after a 3-second countdown or choose a silent MP4 video length from 15 seconds to 2 minutes. Download the result from the camera menu. You can stop a recording early.

In the three browser modes, camera frames, tracking, and clips stay in the browser.
The optional FAH mode sends JPEG frames to a service on this computer's loopback address;
the service does not save camera frames by default. The bundled runtime is MediaPipe Tasks Vision 0.10.21 with the version 1 Face Landmarker and Hand Landmarker models. See [MediaPipe](https://github.com/google-ai-edge/mediapipe) for the upstream project and Apache 2.0 license.

## Production release

On `main`, build the public site with Node.js and npm.

```sh
npm ci
npm run build
python3 -m http.server 8769 --bind 127.0.0.1 --directory dist
```

Preview at [http://127.0.0.1:8769/](http://127.0.0.1:8769/). Publish the contents of
`dist/` to a static HTTPS host. The production site uses the enhanced
Gesture Recognizer and Face Landmarker blendshapes. It includes fog, drawing,
handprints, wiping, fullscreen, JPG photos, and MP4 recording.

To build from GitHub, run **Build Fog Mirror release** under **Actions** on
`main` and download the **fog-mirror-production** artifact. The same source
runs with all four modes and the debug overlay via `python3 tools/start.py`.

## Recognition comparison

The **识别方案对比** panel offers three browser modes, plus the optional local FAH mode described below:

| Mode | Hand recognition | Mouth recognition | Interaction fixes |
| --- | --- | --- | --- |
| 模型增强版 (default) | Gesture Recognizer, with landmark rules for low-confidence or unknown gestures | Face Landmarker blendshapes plus mouth geometry and a 120 ms confirmation | Enabled |
| 仅修复版 | Original Hand Landmarker and geometric pose rules | Mouth landmark geometry | Enabled |
| 原版基线 | Original Hand Landmarker and original rules | Original mouth rules | Original behavior |

Switching modes keeps the camera enabled, stops any current recording, cancels pending photos, clears the fog, and resets gesture calibration. Only the selected mode's models run. Model loading failures are shown; the enhanced mode does not silently substitute the old model. The feedback panel shows the gesture category and score, use of rule assistance, mouth state, and inference duration. Results older than 320 ms never drive interaction.

The fixed modes end a stroke immediately when the hand is missing, preserve brief pose uncertainty while landmarks remain, keep the approach baseline fixed throughout an open-hand gesture, require spread fingers and an extended thumb for a print, and integrate fog opacity over elapsed time. The original gesture implementation is preserved in `app/legacy-gestures.js` for comparison. All modes retain the existing global fog lifetime: 45 seconds of lingering, fading completely by 60 seconds after the last deposit.

Start pointing at a comfortable distance, then push forward to draw. For a broad wipe, first show the open hand, then bring it closer and wave. Use **清除雾气 / 重新校准** to start a new comparison at your current hand distance. The enhanced mode still simulates fog from facial expression; it does not detect actual breath. `Pointing_Up` does not cover every pointing direction, so uncertain classifications use the geometric rules and are labeled **规则辅助**.

The additional model is pinned to MediaPipe Gesture Recognizer, float16, version 1:

- Source: `https://storage.googleapis.com/mediapipe-models/gesture_recognizer/gesture_recognizer/float16/1/gesture_recognizer.task`
- Local asset: `app/vendor/gesture_recognizer.task` (8,373,440 bytes).
- SHA-256: `97952348cf6a6a4915c2ea1496b4b37ebabc50cbbf80571435643c455f2b0482`.
- [Official browser API](https://ai.google.dev/edge/mediapipe/solutions/vision/gesture_recognizer/web_js) and [Face Landmarker blendshapes](https://ai.google.dev/edge/mediapipe/solutions/vision/face_landmarker/web_js).

For a manual comparison, repeat the same sequence in each mode: mouth movement, a forward-pressed fingertip line, hand leaving/re-entering view, a spread-hand hold, a slow approach followed by a wave, and a short MP4 recording. Synthetic checks do not replace this webcam acceptance.

## Debug overlay

Enable **显示调试叠层** in the comparison panel, or use the **调试** button in the lower-right corner of the active mirror. The button also works in fullscreen. The overlay shows the 21 numbered hand landmarks and finger connections, a yellow crosshair at index fingertip #8, and a green marker at the drawn stroke position while pressed. The on-screen panel identifies the selected mode, current action, model category/confidence or rule assistance, fingertip coordinates in mirror-canvas pixels, press state, fog state, and inference duration.

The overlay uses a separate canvas aligned with the mirrored preview and its fullscreen crop. It is preview-only; JPG and MP4 exports continue to use the mirror canvas. Switching modes, recalibrating, stopping the camera, tracking failure, and stale results clear the old overlay. Losing hand detection removes its landmarks immediately. Debug display is off by default and does not change the recognition mode or gesture decisions.

The debug panel also shows two forward-push signals relative to the initial pointing pose: fingertip depth relative to the palm, and the logarithmic change in palm size. These are normalized, dimensionless values, not measured distances. Before pressing, the decision value is the larger signal. Once pressed, release uses the source that triggered the press, even if the other signal becomes larger. The panel shows calibration, two-sample press/release confirmation, and the actual decision value.

Adjust **前推灵敏度** directly in the mirror, including fullscreen: 0.5× requires a deeper push; 2× makes pressing easier. Effective thresholds are `0.145 / sensitivity` for press and `0.070 / sensitivity` for release; both require two consecutive qualifying samples after a 100 ms initial calibration. **恢复 1×** restores the original thresholds. Adjustment ends the current stroke and resets hand calibration without clearing fog or restarting the camera/models. Hold your finger at the desired starting distance briefly, then push forward again. The setting stays in effect when debug display is hidden, the camera restarts, or modes change, and resets to 1× on page reload. All four modes share this setting for comparison. At 1× the original mode retains its original baseline adaptation and gesture behavior; use 1× when comparing against the untouched baseline in `app/legacy-gestures.js`.

## Local FAH-S experiment

An additional **FAH-S · 本机实验（CUDA / MPS）** option runs hand tracking in an isolated local service while retaining the three browser modes and the same drawing rules. Windows uses `tools/fah/setup.ps1 -ConfigSource maccap` and `tools/fah/start.ps1`. On Apple Silicon, use `bash tools/fah/setup.sh --python python3.12` and `bash tools/fah/start.sh`, then open `http://127.0.0.1:8766/`. The existing static server remains usable for the browser modes. Windows CUDA inference has been measured; the Mac MPS path requires acceptance on an actual Mac. The experiment displays model timing, effective tracking FPS and backend-specific memory, and exposes a JSON report. Setup supports the user-selected MacCap configuration mirror with a pinned revision and SHA-256 verification. The joint-only adapter disables MANO surface reconstruction; missing or invalid dependencies are reported explicitly. See [the setup and measurement guide](tools/fah/README.md) for reproducible real-video benchmarks and measurement limits.

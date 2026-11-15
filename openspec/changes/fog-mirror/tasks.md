# Tasks

## 1. Camera and mirror

- [x] 1.1 Scaffold the desktop web app and verify it builds and loads on localhost in desktop Chrome.
- [x] 1.2 Add camera enable, disable, and retry controls and render the mirrored feed to canvas. Verify camera grant, denial, stream loss, and camera release in Chrome.

## 2. Fog and hand gestures

- [x] 2.1 Integrate pinned, locally processed face and hand tracking. Verify simultaneous detections during live preview and confirm the browser sends no frames or landmarks over the network.
- [x] 2.2 Implement mouth-driven fog buildup and fade. Verify opening and lip motion affect deposition, new fog follows the mouth, and closing or losing the face stops deposition.
- [x] 2.3 Classify index-only pointing and open-hand poses. Implement the narrow fingertip wipe and verify it stays aligned at different view sizes, stays local, and restarts without clearing across tracking gaps.
- [x] 2.4 Add the stable open-hand hold and silhouette. Verify that the live view shows through the hand shape, fog remains between the fingers, and the opening stays after the hand leaves and then fades.
- [x] 2.5 Add broad clearing for an open-hand wave. Verify the cleared band follows the hand's size and path, removes fog and any overlapping print, and produces no fingertip stroke or extra print. Exercise pose changes, brief pauses, and tracking loss.

## 3. Mirror recording

- [x] 3.1 Implement Record, Stop, the recording indicator, and local video download. Verify a saved clip is playable, uses the expected file extension, and contains only the silent mirror and effects.
- [x] 3.2 Handle camera interruption, the displayed duration limit, and unsupported or failed recording. Verify each stop path finalizes at most one clip or reports the failure, and the user can start another session.

## 4. End-to-end check

- [ ] 4.1 On a desktop webcam, record mouth-triggered fog, a fingertip line, a hand silhouette, and a broad hand wave. Verify the mirror stays responsive and playback shows each effect.

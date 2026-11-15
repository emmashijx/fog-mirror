# Emma’s Fog Mirror

Emma’s Fog Mirror is a local desktop Chrome prototype. From the project folder, run:

```sh
python3 -m http.server 8765 --bind 127.0.0.1 --directory app
```

Open [Emma’s Fog Mirror](http://127.0.0.1:8765/) in Chrome and select **enable your camera to start**. Keep your face and hand in frame.

- Open and move your mouth to add fog. After you stop adding fog, it lingers and fades out at one minute.
- Use **Fog appearance** to move from dry mist to more transparent wet fog with stationary water beads.
- Extend only your index finger inside the mirror. Push it toward the camera to press a small fingertip shape into the fog, then move it sideways to draw. Pull back at the end to lift off while keeping your finger extended. Drawing also stops near the edges.
- Spread your fingers and hold your hand mostly still to clear a hand-shaped opening. Fresh fog covers the opening exactly as it covers a line.
- Show your open hand, move it closer to the camera, then wave to clear a broad path.
- Select **Enter fullscreen** in the upper-right corner to fill the display. Press Esc or use **Exit fullscreen** to return.
- Open the camera menu to take a JPG photo after a 3-second countdown or choose a silent MP4 video length from 15 seconds to 2 minutes. Download the result from the camera menu. You can stop a recording early.

Camera frames, tracking, and clips stay in the browser. The bundled runtime is MediaPipe Tasks Vision 0.10.21 with the version 1 Face Landmarker and Hand Landmarker models. See [MediaPipe](https://github.com/google-ai-edge/mediapipe) for the upstream project and Apache 2.0 license.

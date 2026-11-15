# Proposal

## Why

A webcam preview can feel like a fogged mirror if mouth movements make condensation appear and hand gestures draw, leave impressions, and clear it. A built-in recording control lets people save and share the effect as they see it.

## What Changes

- Show a live, horizontally mirrored webcam view in a desktop browser.
- Build fog near the mouth while it opens and moves. Let it linger and fade out one minute after fog stops forming.
- Adjust the white fog from dry mist to more transparent wet fog with stationary water beads.
- Push an extended index finger toward the camera to make a fingertip-shaped mark and draw smooth, thin lines. Pull back to stop.
- Clear a hand-shaped opening in the fog by holding a spread hand mostly still. Let it fade out after one minute.
- Bring an open hand closer to the camera and wave to clear a broad path through the fog.
- Let the user fill the display with the mirror, then use the upper-right camera control to take a photo after a countdown or record a silent video with a selected duration.

## Capabilities

### New Capabilities

- `interactive-mirror` provides the camera preview, mouth-driven fog, and three hand gestures for interacting with condensation.
- `mirror-recording` provides photo capture and timed video downloads of the mirror view.

### Modified Capabilities

## Impact

This is a new desktop web prototype. It needs browser camera access, on-device face and hand tracking, real-time compositing, and local video encoding. Its first release supports one person with one tracked hand.

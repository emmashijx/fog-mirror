# Mirror Recording

## Purpose

Let users take photos and record silent video of the live mirror effects, with local downloads.

## ADDED Requirements

### Requirement: User-controlled mirror recording
The app SHALL start a recording only after the user selects a duration and starts recording while the mirror is active. Durations SHALL range from 15 seconds to 120 seconds in 15-second increments.

#### Scenario: Start a recording
- **WHEN** the user chooses Record video, selects a length, and selects Start recording
- **THEN** the app shows the elapsed and selected times and automatically finishes when the selected duration is reached

#### Scenario: Recording is unavailable
- **WHEN** the browser cannot record the mirror as MP4
- **THEN** the app explains that recording is unavailable and the live mirror remains usable

### Requirement: Capture a mirror photo
The camera control SHALL offer a choice between taking a photo and recording a video. Selecting Take photo on an active mirror SHALL show a three-second countdown, then automatically capture one downloadable JPG.

#### Scenario: Take a fullscreen photo
- **WHEN** the user opens the camera control in fullscreen and takes a photo
- **THEN** the mirror shows 3, 2, and 1 before taking the photo
- **AND** the JPG shows the fullscreen mirror framing and visible fog and wipe effects at capture time

### Requirement: Download the composited mirror clip
The app SHALL offer a playable local MP4 download after a successful recording. The clip SHALL contain the mirrored camera image and its visible effects, with no audio or app controls.

#### Scenario: Stop and save a clip
- **WHEN** the user records fog appearing, a finger line, a handprint, and an open-hand sweep, then selects Stop and downloads the clip
- **THEN** the clip plays back the same mirrored view and effects, including the selected condensation appearance and the clear hand-shaped opening

#### Scenario: Camera session ends during recording
- **WHEN** the camera session ends while a recording is active
- **THEN** the app ends the recording and offers any successfully finalized clip, or reports that the clip could not be saved

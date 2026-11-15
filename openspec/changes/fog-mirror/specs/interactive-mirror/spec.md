# Interactive Mirror

## Purpose

Provide a live webcam mirror where mouth motion creates condensation and hand gestures draw lines, leave detailed prints, or clear broad areas.

## ADDED Requirements

### Requirement: Live webcam mirror
The app SHALL show a horizontally mirrored webcam preview after the user enables the camera and grants permission. It SHALL process camera frames on the device.

#### Scenario: Camera is granted
- **WHEN** the user enables the camera and grants access
- **THEN** the live preview moves like a mirror and no camera frames are uploaded

#### Scenario: Camera is unavailable
- **WHEN** camera access is denied, the device is missing, or the camera stream ends
- **THEN** the app shows the camera state and provides a way to try again

#### Scenario: User turns the camera off
- **WHEN** the user turns off the active camera
- **THEN** the app releases the camera and clears the live preview

### Requirement: Mouth-driven fog
The app SHALL use the tracked mouth position, opening, and movement of one visible person to add fog near the mouth in the mirror. Fog SHALL linger, then fade out by 60 seconds after fog stops forming.

#### Scenario: Mouth opens and moves
- **WHEN** the tracked person opens and moves their mouth
- **THEN** fog appears near the mirrored mouth position and new fog follows that position as it moves
- **AND** changes in mouth opening and motion change how quickly fog builds up

#### Scenario: Mouth closes or tracking is lost
- **WHEN** the tracked mouth closes or the face is lost
- **THEN** new fog stops appearing and existing fog remains visible before gradually fading out by 60 seconds

### Requirement: Fingertip wiping
The app SHALL clear a fingertip-shaped mark and then a narrow line along its mirrored path after the user pushes an extended index finger toward the camera. Pulling back SHALL stop drawing while the finger is still extended.

#### Scenario: Finger moves through fog
- **WHEN** the user pushes an extended index fingertip toward the camera and then moves it across a fogged region
- **THEN** the fog clears in a continuous line with smooth joins around turns and remains visible outside that path

#### Scenario: Fingertip disappears and reappears
- **WHEN** the fingertip leaves tracking and reappears elsewhere
- **THEN** the app waits for a new forward press and leaves the gap clear of any connecting stroke

#### Scenario: Tracking flickers during a stroke
- **WHEN** a depth or landmark reading briefly becomes uncertain during a forward press and then recovers nearby
- **THEN** the smooth stroke resumes without requiring a new press

#### Scenario: Finger enters or exits the drawing area
- **WHEN** the user moves the fingertip into view, pulls it back before leaving, or reaches the edge margin
- **THEN** the app leaves the repositioning path untouched and waits for a new forward press

### Requirement: Open-hand silhouette
The app SHALL leave one soft-edged, hand-shaped opening when the user holds a fully visible spread hand briefly and steadily in front of the camera. The opening SHALL reveal the live reflection and follow the same fog buildup and fading behavior as a fingertip line.

#### Scenario: Hold a spread hand in front of the fog
- **WHEN** the camera clearly sees the spread fingers while the hand is held still
- **THEN** the live reflection shows through a complete palm, thumb, and four fingers, with fog remaining between spread fingers

#### Scenario: The hand crosses the mirror edge
- **WHEN** the shape would be cut off at the mirror edge
- **THEN** the app waits for the full hand to fit before leaving a print
- **AND** the print remains briefly visible after the user lowers the hand

#### Scenario: Hold a spread hand over clear glass
- **WHEN** the user holds a spread hand over a clear part of the mirror
- **THEN** the mirror stays clear where there is no fog to wipe
- **AND** holding the same pose continues to show a single print

#### Scenario: Fog a handprint again
- **WHEN** the user adds fog over part of a handprint
- **THEN** fresh condensation progressively covers the overlapping part, at the same rate as a wiped fingertip line
- **AND** the rest of the handprint remains clear

#### Scenario: Wave and hold at normal distance
- **WHEN** the user moves an open hand without bringing it closer, then holds it steadily in place
- **THEN** the app leaves one handprint at the held position
- **AND** the movement leaves the fog intact before the hold

### Requirement: Adjustable fog appearance
The app SHALL let the user adjust the white fog from dry mist to more transparent wet fog with stationary water beads.

#### Scenario: Change density while fog is visible
- **WHEN** the user moves the fog appearance slider from Dry toward Wet
- **THEN** the haze becomes more transparent and stationary beads appear within it
- **AND** cleared lines, silhouettes, and areas reveal the live reflection through the condensation

### Requirement: Fullscreen mirror
The app SHALL offer fullscreen and return controls for the mirror. In fullscreen, the mirror SHALL fill the display while preserving the image proportions and show its Aruba Blue camera control in the upper-right corner.

#### Scenario: Enter and exit fullscreen
- **WHEN** the user enters fullscreen and later exits using the button or Escape
- **THEN** the mirror fills the display while fullscreen and returns to the normal layout on exit

### Requirement: Open-hand area clearing
The app SHALL clear a broad area of fog when the user moves a tracked open hand closer to the camera and then waves it. The cleared width SHALL follow the apparent size of the hand.

#### Scenario: Wave across the fog
- **WHEN** the user moves the open hand closer to the camera and sweeps it across a fogged region
- **THEN** the swept area clears in a continuous band wider than a fingertip line
- **AND** fog away from the swept area remains visible
- **AND** the wave produces neither a line nor a trail of handprints

#### Scenario: Pull back during a wave
- **WHEN** the user pulls the open hand back to its starting distance
- **THEN** the app stops broad clearing even if the hand keeps moving

#### Scenario: Tracking drops during a wave
- **WHEN** the hand leaves tracking during a wave and reappears elsewhere
- **THEN** the app waits for a fresh wave sequence and leaves the gap untouched

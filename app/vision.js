import { FaceLandmarker, FilesetResolver, HandLandmarker } from './vendor/vision_bundle.mjs';

export async function createVision() {
  const asset = name => new URL('./vendor/' + name, import.meta.url).href;
  const fileset = await FilesetResolver.forVisionTasks(asset('wasm'));
  const face = await FaceLandmarker.createFromOptions(fileset, {
    baseOptions: { modelAssetPath: asset('face_landmarker.task'), delegate: 'CPU' },
    runningMode: 'VIDEO',
    numFaces: 1,
  });
  let hand;
  try {
    hand = await HandLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: asset('hand_landmarker.task'), delegate: 'CPU' },
      runningMode: 'VIDEO',
      numHands: 1,
    });
  } catch (error) {
    face.close();
    throw error;
  }
  return {
    detect(frame, timestamp) {
      const faceResult = face.detectForVideo(frame, timestamp);
      const handResult = hand.detectForVideo(frame, timestamp);
      const landmarks = faceResult.faceLandmarks[0];
      return {
        face: landmarks ? Object.fromEntries([13, 14, 61, 291].map(i => [i, landmarks[i]])) : null,
        hand: handResult.landmarks[0] ?? null,
        handWorld: handResult.worldLandmarks[0] ?? null,
      };
    },
    close() {
      face.close();
      hand.close();
    },
  };
}

import { FaceLandmarker, FilesetResolver, GestureRecognizer, HandLandmarker } from './vendor/vision_bundle.mjs';


export async function createVision(mode = 'enhanced') {
  const enhanced = import.meta.release || mode === 'enhanced' || mode === 'fah-face';
  const asset = name => new URL('./vendor/' + name, import.meta.url).href;
  const fileset = await FilesetResolver.forVisionTasks(asset('wasm'));
  const face = await FaceLandmarker.createFromOptions(fileset, {
    baseOptions: { modelAssetPath: asset('face_landmarker.task'), delegate: 'CPU' },
    runningMode: 'VIDEO',
    numFaces: 1,
    outputFaceBlendshapes: enhanced,
  });
  let hand;
  try {
    if (import.meta.release || mode !== 'fah-face') {
      const handModel = !import.meta.release && !enhanced ? HandLandmarker : GestureRecognizer;
      const modelAsset = !import.meta.release && !enhanced ? 'hand_landmarker.task' : 'gesture_recognizer.task';
      hand = await handModel.createFromOptions(fileset, {
        baseOptions: {
          modelAssetPath: asset(modelAsset),
          delegate: 'CPU',
        },
        runningMode: 'VIDEO',
        numHands: 1,
      });
    }
  } catch (error) {
    face.close();
    throw error;
  }
  return {
    detect(frame, timestamp) {
      const faceResult = face.detectForVideo(frame, timestamp);
      const handResult = !hand ? {} :
        !import.meta.release && !enhanced ? hand.detectForVideo(frame, timestamp) : hand.recognizeForVideo(frame, timestamp);
      const landmarks = faceResult.faceLandmarks[0];
      const category = handResult.gestures?.[0]?.[0];
      return {
        face: landmarks ? Object.fromEntries([13, 14, 61, 291].map(i => [i, landmarks[i]])) : null,
        hand: handResult.landmarks?.[0] ?? null,
        handWorld: handResult.worldLandmarks?.[0] ?? null,
        gesture: category ? { name: category.categoryName, score: category.score } : null,
        expressions: enhanced ? Object.fromEntries((faceResult.faceBlendshapes[0]?.categories ?? [])
          .map(category => [category.categoryName, category.score])) : null,
      };
    },
    close() {
      face.close();
      hand?.close();
    },
  };
}

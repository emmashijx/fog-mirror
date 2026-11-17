import { ExpressionMouthGesture, HandGesture, MouthGesture, classifyHand, isProjectedIndex } from './gestures.js?v=fah-fast-stroke';
import * as legacy from './legacy-gestures.js?v=recognition-v1';
import { calibrateIndex, updateIndex, indexThresholds } from './index-pressure.js?v=fah-stroke';

class LegacyHandGesture extends legacy.HandGesture {
  setNeutralDepth(points, timestamp) {
    calibrateIndex(this, points, timestamp);
  }

  indexPressed(points, timestamp) {
    return updateIndex(this, points, timestamp, { adaptive: true });
  }

  reset() {
    super.reset();
    this.pressMetrics = null;
  }
}

export const RECOGNITION_MODES = {
  fah: {
    label: 'FAH-S 本机实验',
    description: '本机 CUDA / MPS 三维手部追踪 + 原画线规则 + 人脸表情系数。请从本机 FAH-S 启动脚本显示的地址打开；三维深度为模型估计。',
  },
  enhanced: {
    label: '模型增强版',
    description: '手势模型 + 人脸表情系数。低置信度或未知手势会使用关键点规则辅助判断。',
  },
  rules: {
    label: '仅修复版',
    description: '使用原有关键点规则，修复丢手续画、慢速靠近、手印误触和起雾帧率差异。',
  },
  original: {
    label: '原版基线',
    description: '保留原始交互规则和起雾速度，方便比较修复前后的效果。',
  },
};

export function resolveHandPose(points, gesture, drawing = false) {
  if (!points) return { pose: 'other', source: 'none' };
  if (gesture?.score >= 0.65 && gesture.name !== 'None') {
    if (gesture.name === 'Open_Palm') return { pose: 'open', source: 'model' };
    if (gesture.name === 'Pointing_Up') return { pose: 'point', source: 'model' };
    return { pose: 'other', source: 'model' };
  }
  return { pose: classifyHand(points, drawing), source: 'rules' };
}

export function createInteraction(mode, sensitivity = 1) {
  if (!Object.hasOwn(RECOGNITION_MODES, mode)) throw new Error('Unknown recognition mode');
  const hand = mode === 'original' ? new LegacyHandGesture() : new HandGesture({ sparseSamples: mode === 'fah' });
  hand.sensitivity = indexThresholds(sensitivity).sensitivity;
  return {
    hand,
    mouth: mode === 'original' ? new legacy.MouthGesture() :
      mode === 'enhanced' || mode === 'fah' ? new ExpressionMouthGesture() : new MouthGesture(),
    classify(points, gesture, drawing, projectedPoints) {
      if (!points) return { pose: 'other', source: 'none' };
      if (mode === 'enhanced') return resolveHandPose(points, gesture, drawing);
      const pose = (mode === 'original' ? legacy.classifyHand : classifyHand)(points, drawing);
      if (mode === 'fah' && pose === 'other' && isProjectedIndex(projectedPoints, drawing)) {
        return { pose: 'point', source: 'projection' };
      }
      return { pose, source: 'rules' };
    },
  };
}

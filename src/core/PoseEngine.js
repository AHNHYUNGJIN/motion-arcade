import * as poseDetection from '@tensorflow-models/pose-detection';
import '@tensorflow/tfjs-backend-webgl';

export const KP = {
  NOSE: 0,
  LEFT_EYE: 1,
  RIGHT_EYE: 2,
  LEFT_EAR: 3,
  RIGHT_EAR: 4,
  LEFT_SHOULDER: 5,
  RIGHT_SHOULDER: 6,
  LEFT_ELBOW: 7,
  RIGHT_ELBOW: 8,
  LEFT_WRIST: 9,
  RIGHT_WRIST: 10,
  LEFT_HIP: 11,
  RIGHT_HIP: 12,
  LEFT_KNEE: 13,
  RIGHT_KNEE: 14,
  LEFT_ANKLE: 15,
  RIGHT_ANKLE: 16,
};

export class PoseEngine {
  /**
   * @param {{ frameSkip?: number }} options
   *   frameSkip: process every N-th frame (1 = every frame, 2 = every other, …)
   */
  constructor({ frameSkip = 1 } = {}) {
    this._detector = null;
    this._ready = false;
    this._frameSkip = Math.max(1, frameSkip);
    this._frameCount = 0;
    this._lastPose = null;
  }

  async init() {
    // Ensure WebGL backend is ready before creating the detector.
    const tf = await import('@tensorflow/tfjs-core');
    await tf.setBackend('webgl');
    await tf.ready();

    this._detector = await poseDetection.createDetector(
      poseDetection.SupportedModels.MoveNet,
      {
        modelType: poseDetection.movenet.modelType.SINGLEPOSE_LIGHTNING,
        enableSmoothing: true,
      }
    );

    this._ready = true;
  }

  /**
   * Returns the detected pose object (with 17 keypoints) or null.
   * @param {HTMLVideoElement} videoElement
   * @returns {Promise<object|null>}
   */
  async detect(videoElement) {
    if (!this._ready) return null;

    this._frameCount++;
    // Return cached pose on skipped frames for smooth downstream consumers.
    if (this._frameCount % this._frameSkip !== 0) {
      return this._lastPose;
    }

    if (videoElement.readyState < 2) return this._lastPose;

    try {
      const poses = await this._detector.estimatePoses(videoElement, {
        flipHorizontal: true,  // 미러링된 video 표시에 맞게 x좌표 반전
      });
      this._lastPose = poses.length > 0 ? poses[0] : null;
    } catch {
      // Silently swallow transient GPU/inference errors; return last good pose.
    }

    return this._lastPose;
  }

  get isReady() {
    return this._ready;
  }

  destroy() {
    this._ready = false;
    if (this._detector) {
      this._detector.dispose?.();
      this._detector = null;
    }
    this._lastPose = null;
  }
}

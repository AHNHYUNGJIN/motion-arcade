import { KP } from './PoseEngine.js';

const SCORE_THRESHOLD = 0.3;
const VELOCITY_HISTORY = 5; // frames for moving-average velocity

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

/** Circular buffer of fixed length for moving-average calculations. */
class RingBuffer {
  constructor(size) {
    this._buf = new Array(size).fill(null);
    this._idx = 0;
    this._size = size;
  }

  push(value) {
    this._buf[this._idx] = value;
    this._idx = (this._idx + 1) % this._size;
  }

  /** Returns values in insertion order, excluding nulls. */
  values() {
    const ordered = [
      ...this._buf.slice(this._idx),
      ...this._buf.slice(0, this._idx),
    ];
    return ordered.filter((v) => v !== null);
  }
}

export class GestureRecognizer {
  /**
   * @param {number} videoWidth  - pixel width of the video feed
   * @param {number} videoHeight - pixel height of the video feed
   */
  constructor(videoWidth = 640, videoHeight = 480) {
    this._w = videoWidth;
    this._h = videoHeight;

    // Calibration reference values (defaults: screen centre)
    this._cal = {
      centerX: videoWidth / 2,
      hipY: videoHeight * 0.6, // typical hip height (60 % from top)
      shoulderWidth: videoWidth * 0.2,
    };

    this._bodyX = 0;
    this._bodyLean = 0;
    this._isJumping = false;

    // Hand tracking state
    this._leftHistory = new RingBuffer(VELOCITY_HISTORY);
    this._rightHistory = new RingBuffer(VELOCITY_HISTORY);
    this._leftHand = { x: 0, y: 0, vx: 0, vy: 0, speed: 0 };
    this._rightHand = { x: 0, y: 0, vx: 0, vy: 0, speed: 0 };
  }

  /** Call once per frame with the latest pose (or null to hold last values). */
  update(pose) {
    if (!pose) return;

    const kp = pose.keypoints;

    // Helper: return keypoint only if confidence is sufficient.
    const get = (idx) => {
      const p = kp[idx];
      return p && (p.score ?? 1) >= SCORE_THRESHOLD ? p : null;
    };

    const lShoulder = get(KP.LEFT_SHOULDER);
    const rShoulder = get(KP.RIGHT_SHOULDER);
    const lHip = get(KP.LEFT_HIP);
    const rHip = get(KP.RIGHT_HIP);
    const lWrist = get(KP.LEFT_WRIST);
    const rWrist = get(KP.RIGHT_WRIST);

    // ── Body X (-1 left … 1 right) ──────────────────────────────────────────
    if (lShoulder && rShoulder) {
      const midX = (lShoulder.x + rShoulder.x) / 2;
      // Normalize relative to calibration center; ±half-screen = ±1
      this._bodyX = clamp(
        (midX - this._cal.centerX) / (this.__w / 2 || this._w / 2),
        -1,
        1
      );
    }

    // ── Body Lean (-1 leaning left … 1 leaning right) ───────────────────────
    if (lShoulder && rShoulder) {
      const dy = rShoulder.y - lShoulder.y;
      const dx = Math.abs(rShoulder.x - lShoulder.x) || 1;
      this._bodyLean = clamp(dy / dx, -1, 1);
    }

    // ── Jumping ──────────────────────────────────────────────────────────────
    if (lHip && rHip) {
      const hipY = (lHip.y + rHip.y) / 2;
      // "above" = smaller y value in image coordinates
      const threshold = this._cal.hipY * 0.8; // 20 % above baseline
      this._isJumping = hipY < threshold;
    }

    // ── Hand positions & velocity ────────────────────────────────────────────
    this._updateHand(lWrist, this._leftHistory, '_leftHand');
    this._updateHand(rWrist, this._rightHistory, '_rightHand');
  }

  _updateHand(wrist, history, propName) {
    if (!wrist) return;

    const nx = wrist.x / this._w;
    const ny = wrist.y / this._h;

    history.push({ x: nx, y: ny });
    const pts = history.values();

    let vx = 0;
    let vy = 0;

    if (pts.length >= 2) {
      // Average velocity across the history window (frame-to-frame deltas)
      let sumVx = 0;
      let sumVy = 0;
      for (let i = 1; i < pts.length; i++) {
        sumVx += pts[i].x - pts[i - 1].x;
        sumVy += pts[i].y - pts[i - 1].y;
      }
      const n = pts.length - 1;
      vx = sumVx / n;
      vy = sumVy / n;
    }

    const speed = Math.sqrt(vx * vx + vy * vy);

    this[propName] = { x: nx, y: ny, vx, vy, speed };
  }

  /**
   * Set the calibration reference from the current pose.
   * Call once when the player is standing in a neutral position.
   * @param {object} pose
   */
  calibrate(pose) {
    if (!pose) return;

    const kp = pose.keypoints;
    const get = (idx) => {
      const p = kp[idx];
      return p && (p.score ?? 1) >= SCORE_THRESHOLD ? p : null;
    };

    const lShoulder = get(KP.LEFT_SHOULDER);
    const rShoulder = get(KP.RIGHT_SHOULDER);
    const lHip = get(KP.LEFT_HIP);
    const rHip = get(KP.RIGHT_HIP);

    if (lShoulder && rShoulder) {
      this._cal.centerX = (lShoulder.x + rShoulder.x) / 2;
      this._cal.shoulderWidth = Math.abs(rShoulder.x - lShoulder.x);
    }

    if (lHip && rHip) {
      this._cal.hipY = (lHip.y + rHip.y) / 2;
    }
  }

  // ── Getters ────────────────────────────────────────────────────────────────

  /** -1 (left) … 1 (right): horizontal body centre relative to calibration */
  get bodyX() {
    return this._bodyX;
  }

  /** -1 (leaning left) … 1 (leaning right): shoulder tilt */
  get bodyLean() {
    return this._bodyLean;
  }

  /** true when hips are ≥ 20 % above calibration baseline */
  get isJumping() {
    return this._isJumping;
  }

  /** {x, y, vx, vy, speed} – all normalised 0-1 except speed */
  get leftHand() {
    return this._leftHand;
  }

  /** {x, y, vx, vy, speed} – all normalised 0-1 except speed */
  get rightHand() {
    return this._rightHand;
  }
}

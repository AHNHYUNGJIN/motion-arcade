/**
 * PoseOverlay.js
 * 포즈 키포인트 + 스켈레톤 시각화 (Canvas 2D)
 *
 * MoveNet/BlazePose 17개 keypoint 인덱스:
 *   0  nose
 *   1  left_eye       2  right_eye
 *   3  left_ear       4  right_ear
 *   5  left_shoulder  6  right_shoulder
 *   7  left_elbow     8  right_elbow
 *   9  left_wrist    10  right_wrist
 *  11  left_hip      12  right_hip
 *  13  left_knee     14  right_knee
 *  15  left_ankle    16  right_ankle
 */

/** 신뢰도 임계값 */
const CONFIDENCE_THRESHOLD = 0.3;

/** dot 크기 (반지름) */
const DOT_RADIUS = 6;

/** 선 굵기 */
const LINE_WIDTH = 2;

/** 색상 */
const COLOR_UPPER = '#00ffff'; // 상체 (cyan)
const COLOR_LOWER = '#ff00ff'; // 하체 (magenta)
const COLOR_FACE  = 'rgba(255,255,255,0.7)';

/**
 * 스켈레톤 연결 정의: [fromIdx, toIdx, colorKey]
 * colorKey: 'upper' | 'lower' | 'face'
 */
const SKELETON = [
  // ── 얼굴 ──────────────────────────────────
  [0, 1,  'face'],   // nose → left_eye
  [0, 2,  'face'],   // nose → right_eye
  [1, 3,  'face'],   // left_eye → left_ear
  [2, 4,  'face'],   // right_eye → right_ear

  // ── 상체 ──────────────────────────────────
  [5, 6,  'upper'],  // left_shoulder → right_shoulder
  [5, 7,  'upper'],  // left_shoulder → left_elbow
  [7, 9,  'upper'],  // left_elbow → left_wrist
  [6, 8,  'upper'],  // right_shoulder → right_elbow
  [8, 10, 'upper'],  // right_elbow → right_wrist
  [5, 11, 'upper'],  // left_shoulder → left_hip
  [6, 12, 'upper'],  // right_shoulder → right_hip
  [11, 12,'upper'],  // left_hip → right_hip

  // ── 하체 ──────────────────────────────────
  [11, 13,'lower'],  // left_hip → left_knee
  [13, 15,'lower'],  // left_knee → left_ankle
  [12, 14,'lower'],  // right_hip → right_knee
  [14, 16,'lower'],  // right_knee → right_ankle
];

/** colorKey → CSS 색상 */
const COLOR_MAP = {
  face:  COLOR_FACE,
  upper: COLOR_UPPER,
  lower: COLOR_LOWER,
};

/** 글로우 색상 */
const GLOW_MAP = {
  face:  'rgba(255,255,255,0.4)',
  upper: 'rgba(0,255,255,0.5)',
  lower: 'rgba(255,0,255,0.5)',
};

export class PoseOverlay {
  /**
   * @param {HTMLCanvasElement} canvas - 포즈 오버레이용 캔버스
   */
  constructor(canvas) {
    if (!(canvas instanceof HTMLCanvasElement)) {
      throw new Error('PoseOverlay: canvas 파라미터가 HTMLCanvasElement여야 합니다.');
    }
    this._canvas  = canvas;
    this._ctx     = canvas.getContext('2d');
    this._visible = true;

    this._resizeObserver = new ResizeObserver(() => this._syncCanvasSize());
    this._resizeObserver.observe(canvas.parentElement ?? document.body);
    this._syncCanvasSize();
  }

  /* ── public API ──────────────────────────────────── */

  /**
   * 매 프레임 포즈를 캔버스에 그림
   * @param {Object|null} pose          - TF.js PoseDetector 출력 포즈 객체
   * @param {number}      videoWidth    - 원본 비디오 너비
   * @param {number}      videoHeight   - 원본 비디오 높이
   */
  draw(pose, videoWidth, videoHeight) {
    const ctx    = this._ctx;
    const canvas = this._canvas;

    // 항상 클리어
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (!this._visible || !pose) return;

    const keypoints = pose.keypoints ?? pose.keypoints3D ?? [];
    if (!keypoints.length) return;

    // 스케일 비율
    const scaleX = canvas.width  / (videoWidth  || canvas.width);
    const scaleY = canvas.height / (videoHeight || canvas.height);

    /**
     * 비디오는 CSS로 scaleX(-1) 미러링되어 있으므로
     * 캔버스 좌표도 x를 반전해야 화면과 일치함.
     * 반전: canvasX = canvas.width - (kp.x * scaleX)
     */
    const toCanvasX = (kpX) => canvas.width - (kpX * scaleX);
    const toCanvasY = (kpY) => kpY * scaleY;

    // ── 스켈레톤 선 ────────────────────────────────
    this._drawSkeleton(ctx, keypoints, toCanvasX, toCanvasY);

    // ── 키포인트 dot ───────────────────────────────
    this._drawKeypoints(ctx, keypoints, toCanvasX, toCanvasY);
  }

  /**
   * 오버레이 표시 여부
   * @param {boolean} bool
   */
  setVisible(bool) {
    this._visible = !!bool;
    if (!bool) {
      this._ctx.clearRect(0, 0, this._canvas.width, this._canvas.height);
    }
  }

  /** 정리 */
  destroy() {
    this._resizeObserver.disconnect();
    this._ctx.clearRect(0, 0, this._canvas.width, this._canvas.height);
    this._canvas = null;
    this._ctx    = null;
  }

  /* ── private ─────────────────────────────────────── */

  _drawSkeleton(ctx, keypoints, toX, toY) {
    ctx.save();
    ctx.lineCap  = 'round';
    ctx.lineJoin = 'round';

    for (const [fromIdx, toIdx, colorKey] of SKELETON) {
      const kpA = keypoints[fromIdx];
      const kpB = keypoints[toIdx];
      if (!kpA || !kpB) continue;

      const scoreA = kpA.score ?? kpA.confidence ?? 1;
      const scoreB = kpB.score ?? kpB.confidence ?? 1;
      if (scoreA < CONFIDENCE_THRESHOLD || scoreB < CONFIDENCE_THRESHOLD) continue;

      const x1 = toX(kpA.x);
      const y1 = toY(kpA.y);
      const x2 = toX(kpB.x);
      const y2 = toY(kpB.y);

      const color = COLOR_MAP[colorKey];
      const glow  = GLOW_MAP[colorKey];

      // 글로우 레이어
      ctx.strokeStyle = glow;
      ctx.lineWidth   = LINE_WIDTH + 4;
      ctx.globalAlpha = 0.4;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();

      // 실선 레이어
      ctx.strokeStyle = color;
      ctx.lineWidth   = LINE_WIDTH;
      ctx.globalAlpha = Math.min(scoreA, scoreB);
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    }

    ctx.restore();
  }

  _drawKeypoints(ctx, keypoints, toX, toY) {
    ctx.save();

    keypoints.forEach((kp, idx) => {
      if (!kp) return;
      const score = kp.score ?? kp.confidence ?? 1;
      if (score < CONFIDENCE_THRESHOLD) return;

      const x = toX(kp.x);
      const y = toY(kp.y);

      // 색상 결정: 얼굴(0~4)은 흰색, 5~10 상체 cyan, 11+ 하체 magenta
      let fillColor;
      if (idx <= 4) {
        fillColor = COLOR_FACE;
      } else if (idx <= 10) {
        fillColor = COLOR_UPPER;
      } else {
        fillColor = COLOR_LOWER;
      }

      // 글로우
      ctx.shadowBlur  = 12;
      ctx.shadowColor = fillColor;
      ctx.globalAlpha = score;

      // 외곽 원 (흰색 테두리)
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      ctx.beginPath();
      ctx.arc(x, y, DOT_RADIUS, 0, Math.PI * 2);
      ctx.fill();

      // 내부 색상 원
      ctx.shadowBlur = 0;
      ctx.fillStyle  = fillColor;
      ctx.beginPath();
      ctx.arc(x, y, DOT_RADIUS - 2, 0, Math.PI * 2);
      ctx.fill();
    });

    ctx.restore();
  }

  /** 캔버스 크기를 부모 요소에 맞춤 */
  _syncCanvasSize() {
    if (!this._canvas) return;
    const parent = this._canvas.parentElement;
    if (!parent) return;
    const { width, height } = parent.getBoundingClientRect();
    if (width  && this._canvas.width  !== Math.round(width))  this._canvas.width  = Math.round(width);
    if (height && this._canvas.height !== Math.round(height)) this._canvas.height = Math.round(height);
  }
}

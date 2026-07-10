/**
 * Calibration.js
 * 캘리브레이션 UI 컴포넌트
 *
 * 단계:
 *   1. 안내 메시지 표시
 *   2. 3초 카운트다운 (포즈 감지 대기)
 *   3. 성공 → 완료 / 실패 → 재시도 버튼
 */

/** 캘리브레이션 카운트다운 초 */
const COUNTDOWN_SEC = 3;

/** 사람 실루엣 SVG (가이드라인) */
const SILHOUETTE_SVG = `
<svg class="calibration-overlay__silhouette"
     viewBox="0 0 120 240"
     xmlns="http://www.w3.org/2000/svg"
     fill="none"
     stroke="#00ffff"
     stroke-width="2"
     stroke-linecap="round"
     stroke-linejoin="round"
     aria-hidden="true">
  <!-- 머리 -->
  <circle cx="60" cy="30" r="18"/>
  <!-- 목 -->
  <line x1="60" y1="48" x2="60" y2="60"/>
  <!-- 어깨 -->
  <path d="M20 70 Q60 58 100 70"/>
  <!-- 팔 왼쪽 -->
  <line x1="20" y1="70"  x2="8"   y2="115"/>
  <line x1="8"  y1="115" x2="14"  y2="155"/>
  <!-- 팔 오른쪽 -->
  <line x1="100" y1="70"  x2="112" y2="115"/>
  <line x1="112" y1="115" x2="106" y2="155"/>
  <!-- 몸통 -->
  <path d="M20 70 L28 130 L92 130 L100 70"/>
  <!-- 골반 -->
  <path d="M28 130 L38 148 L82 148 L92 130"/>
  <!-- 다리 왼쪽 -->
  <line x1="38" y1="148" x2="30"  y2="195"/>
  <line x1="30" y1="195" x2="26"  y2="238"/>
  <!-- 다리 오른쪽 -->
  <line x1="82" y1="148" x2="90"  y2="195"/>
  <line x1="90" y1="195" x2="94"  y2="238"/>
  <!-- 발 -->
  <path d="M18 238 L36 238" stroke-linecap="round"/>
  <path d="M82 238 L100 238" stroke-linecap="round"/>
</svg>`;

export class Calibration {
  /**
   * @param {HTMLElement}       container - UI 마운트 타겟
   * @param {HTMLCanvasElement} canvas    - 포즈 캔버스 (감지 여부 확인용)
   */
  constructor(container, canvas) {
    this._container   = container;
    this._canvas      = canvas;
    this._root        = null;
    this._onComplete  = null;
    this._timer       = null;
    this._rafId       = null;
    this._poseCheckFn = null; // 외부에서 주입 가능한 포즈 체크 함수
  }

  /* ── public API ──────────────────────────────────── */

  /**
   * 캘리브레이션 시작
   * @param {(calibrationData: Object) => void} onComplete
   * @param {() => Object|null} [getPose]  - 현재 포즈를 반환하는 함수 (선택)
   */
  start(onComplete, getPose = null) {
    this._onComplete  = onComplete;
    this._poseCheckFn = getPose;

    this._render();
    this._runStep1();
  }

  /** 완전 제거 */
  destroy() {
    this._clearTimers();
    if (this._root && this._root.parentNode) {
      this._root.parentNode.removeChild(this._root);
    }
    this._root = null;
    this._onComplete  = null;
    this._poseCheckFn = null;
  }

  /* ── 단계별 흐름 ─────────────────────────────────── */

  /** 단계 1: 안내 메시지 */
  _runStep1() {
    this._showPanel(`
      ${SILHOUETTE_SVG}
      <p class="calibration-overlay__text">
        카메라 앞에 서서<br>
        <strong style="color:#00ffff;">전신이 보이게</strong> 해주세요
      </p>
      <p class="calibration-overlay__status">포즈 감지 준비 중…</p>
      <div class="loading-bar" style="max-width:200px;">
        <div class="loading-bar__fill" id="calib-bar" style="width:0%;"></div>
      </div>
    `);

    // 짧은 지연 후 카운트다운 시작
    this._timer = setTimeout(() => this._runStep2(), 1200);
  }

  /** 단계 2: 3초 카운트다운 + 포즈 감지 */
  _runStep2() {
    let remaining = COUNTDOWN_SEC;
    let detected  = false;

    const updateBar = (progress) => {
      const bar = this._root?.querySelector('#calib-bar');
      if (bar) bar.style.width = `${progress * 100}%`;
    };

    const updateStatus = (text) => {
      const el = this._root?.querySelector('.calibration-overlay__status');
      if (el) el.textContent = text;
    };

    this._showPanel(`
      ${SILHOUETTE_SVG}
      <p class="calibration-overlay__text">
        자세를 유지해 주세요…
      </p>
      <p class="calibration-overlay__status" id="calib-status">
        ${remaining}초 후 캘리브레이션 시작
      </p>
      <div class="loading-bar" style="max-width:200px;">
        <div class="loading-bar__fill" id="calib-bar" style="width:0%;transition:width 1s linear;"></div>
      </div>
    `);

    // 1프레임 뒤 트랜지션 시작
    requestAnimationFrame(() => {
      updateBar(1);
    });

    const tick = () => {
      remaining--;
      if (remaining > 0) {
        updateStatus(`${remaining}초 남음…`);
        // 포즈 체크 (제공된 경우)
        if (typeof this._poseCheckFn === 'function') {
          const pose = this._poseCheckFn();
          detected = this._isPoseValid(pose);
        } else {
          detected = true; // 포즈 엔진 없으면 통과
        }
        this._timer = setTimeout(tick, 1000);
      } else {
        // 최종 체크
        if (typeof this._poseCheckFn === 'function') {
          const pose = this._poseCheckFn();
          detected = this._isPoseValid(pose);
        } else {
          detected = true;
        }

        if (detected) {
          this._runStep3Success();
        } else {
          this._runStep3Fail();
        }
      }
    };

    this._timer = setTimeout(tick, 1000);
  }

  /** 단계 3a: 감지 성공 */
  _runStep3Success() {
    this._showPanel(`
      <div class="calibration-overlay__success" aria-label="캘리브레이션 성공">✅</div>
      <p class="calibration-overlay__text" style="color:#00ff88;">
        캘리브레이션 완료!
      </p>
      <p class="calibration-overlay__status" style="color:rgba(255,255,255,0.6);">
        게임을 시작합니다…
      </p>
    `);

    this._timer = setTimeout(() => {
      const calibData = {
        timestamp: Date.now(),
        success:   true,
      };
      this._fadeOut(() => {
        if (typeof this._onComplete === 'function') {
          this._onComplete(calibData);
        }
      });
    }, 1200);
  }

  /** 단계 3b: 감지 실패 */
  _runStep3Fail() {
    this._showPanel(`
      <div style="font-size:3rem;" aria-label="캘리브레이션 실패">❌</div>
      <p class="calibration-overlay__text" style="color:#ff6666;">
        포즈를 감지하지 못했어요.<br>
        전신이 화면에 보이도록 서주세요.
      </p>
      <button class="btn-secondary" id="calib-retry">
        다시 시도
      </button>
    `);

    const btn = this._root?.querySelector('#calib-retry');
    if (btn) {
      btn.addEventListener('click', () => this._runStep1(), { once: true });
    }
  }

  /* ── 헬퍼 ────────────────────────────────────────── */

  /**
   * 캘리브레이션 오버레이 HTML 렌더링
   * @param {string} innerHtml
   */
  _showPanel(innerHtml) {
    if (!this._root) return;
    const content = this._root.querySelector('.calibration-overlay__content');
    if (content) {
      content.style.transition = 'opacity 0.2s ease';
      content.style.opacity    = '0';
      setTimeout(() => {
        if (content) {
          content.innerHTML  = innerHtml;
          content.style.opacity = '1';
        }
      }, 220);
    }
  }

  /** 포즈 유효성 검사 (신뢰도 높은 키포인트 ≥ 8개) */
  _isPoseValid(pose) {
    if (!pose) return false;
    const kps = pose.keypoints ?? [];
    const validCount = kps.filter(kp => (kp.score ?? kp.confidence ?? 0) >= 0.3).length;
    return validCount >= 8;
  }

  /** 페이드 아웃 후 콜백 */
  _fadeOut(cb) {
    if (!this._root) { cb?.(); return; }
    this._root.style.transition = 'opacity 0.35s ease';
    this._root.style.opacity    = '0';
    setTimeout(() => {
      if (this._root && this._root.parentNode) {
        this._root.parentNode.removeChild(this._root);
        this._root = null;
      }
      cb?.();
    }, 370);
  }

  /** 초기 렌더링 */
  _render() {
    if (this._root) this.destroy();

    const el = document.createElement('div');
    el.className = 'calibration-overlay';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-modal', 'true');
    el.setAttribute('aria-label', '캘리브레이션');

    // 내부 컨텐츠 래퍼
    const content = document.createElement('div');
    content.className = 'calibration-overlay__content';
    content.style.cssText = `
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 20px;
      transition: opacity 0.2s ease;
    `;
    el.appendChild(content);

    this._container.appendChild(el);
    this._root = el;
  }

  _clearTimers() {
    if (this._timer) {
      clearTimeout(this._timer);
      this._timer = null;
    }
    if (this._rafId) {
      cancelAnimationFrame(this._rafId);
      this._rafId = null;
    }
  }
}

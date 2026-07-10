/**
 * GameHUD.js
 * 게임 HUD UI 컴포넌트
 * - 좌상단: 점수
 * - 우상단: 남은 시간 (MM:SS)
 * - 좌하단: 목숨 (하트)
 * - 우하단: FPS
 * - 중앙: 카운트다운 오버레이
 * - 게임오버: 반투명 결과 오버레이
 */

const MAX_LIVES  = 5;
const HEART_FULL = '❤️';
const HEART_LOST = '🖤';

/** 초 → MM:SS */
function formatTime(seconds) {
  const s = Math.max(0, Math.round(seconds));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`;
}

export class GameHUD {
  /**
   * @param {HTMLElement} container
   */
  constructor(container) {
    this._container      = container;
    this._root           = null;
    this._countdownTimer = null;
    this._visible        = false;
    this._gameId         = null;

    // 캐시된 DOM 참조
    this._els = {};
  }

  /* ── public API ──────────────────────────────────── */

  /**
   * HUD 표시 (게임 시작 시 호출)
   * @param {string} gameId
   */
  show(gameId) {
    this._gameId = gameId;
    if (!this._root) {
      this._render();
    }
    this._root.style.display    = 'block';
    this._root.style.opacity    = '0';
    this._root.style.transition = 'opacity 0.3s ease';
    requestAnimationFrame(() => {
      if (this._root) this._root.style.opacity = '1';
    });
    this._visible = true;
  }

  /** HUD 숨기기 */
  hide() {
    if (!this._root) return;
    this._root.style.transition = 'opacity 0.25s ease';
    this._root.style.opacity    = '0';
    setTimeout(() => {
      if (this._root) this._root.style.display = 'none';
    }, 260);
    this._visible = false;
    this._clearCountdown();
  }

  /**
   * HUD 데이터 업데이트 (매 프레임 또는 상태 변경 시)
   * @param {{ score?: number, lives?: number, timeLeft?: number, fps?: number }} data
   */
  update({ score, lives, timeLeft, fps } = {}) {
    if (!this._visible || !this._root) return;

    if (score !== undefined) {
      const el = this._els.score;
      if (el) el.textContent = String(score).padStart(6, '0');
    }

    if (lives !== undefined) {
      this._updateLives(lives);
    }

    if (timeLeft !== undefined) {
      const el = this._els.timer;
      if (el) {
        el.textContent = formatTime(timeLeft);
        // 10초 이하 urgent 표시
        if (timeLeft <= 10) {
          el.classList.add('urgent');
        } else {
          el.classList.remove('urgent');
        }
      }
    }

    if (fps !== undefined) {
      const el = this._els.fps;
      if (el) el.textContent = `FPS: ${Math.round(fps)}`;
    }
  }

  /**
   * 카운트다운 표시 (3 → 2 → 1 → GO!)
   * @param {number} n   - 시작 숫자 (보통 3)
   * @param {() => void} onDone
   */
  showCountdown(n = 3, onDone) {
    this._clearCountdown();

    const overlay = this._els.countdown;
    const numEl   = this._els.countdownNum;
    if (!overlay || !numEl) {
      onDone?.();
      return;
    }

    overlay.style.display = 'flex';
    overlay.style.opacity = '1';

    let current = n;

    const tick = () => {
      if (current > 0) {
        numEl.className = 'countdown__number';
        numEl.textContent = String(current);
        // 애니메이션 재시작 (요소 clone trick)
        numEl.style.animation = 'none';
        void numEl.offsetWidth; // reflow
        numEl.style.animation = '';
        current--;
        this._countdownTimer = setTimeout(tick, 900);
      } else {
        // "GO!"
        numEl.className = 'countdown__number go';
        numEl.textContent = 'GO!';
        numEl.style.animation = 'none';
        void numEl.offsetWidth;
        numEl.style.animation = '';
        this._countdownTimer = setTimeout(() => {
          overlay.style.transition = 'opacity 0.2s ease';
          overlay.style.opacity    = '0';
          setTimeout(() => {
            overlay.style.display = 'none';
            onDone?.();
          }, 220);
        }, 700);
      }
    };

    tick();
  }

  /**
   * 게임오버 오버레이 표시
   * @param {{ score: number, bestScore: number }} param
   * @param {() => void} onReplay
   * @param {() => void} onMenu
   */
  showGameOver({ score = 0, bestScore = 0 }, onReplay, onMenu) {
    const overlay = this._els.gameover;
    if (!overlay) return;

    const scoreEl = overlay.querySelector('.gameover-overlay__score .score-display');
    const bestEl  = overlay.querySelector('.gameover-overlay__best-score');
    const badgeEl = overlay.querySelector('.gameover-overlay__best-badge');
    const replayBtn = overlay.querySelector('[data-action="replay"]');
    const menuBtn   = overlay.querySelector('[data-action="menu"]');

    if (scoreEl) scoreEl.textContent = String(score).padStart(6, '0');
    if (bestEl)  bestEl.textContent  = String(bestScore).padStart(6, '0');

    const isNewBest = score > 0 && score >= bestScore;
    if (badgeEl)  badgeEl.style.display = isNewBest ? 'block' : 'none';

    if (replayBtn) {
      replayBtn.onclick = () => {
        overlay.style.display = 'none';
        onReplay?.();
      };
    }
    if (menuBtn) {
      menuBtn.onclick = () => {
        overlay.style.display = 'none';
        onMenu?.();
      };
    }

    overlay.style.display = 'flex';
    overlay.style.opacity = '0';
    overlay.style.transition = 'opacity 0.4s ease';
    requestAnimationFrame(() => {
      if (overlay) overlay.style.opacity = '1';
    });
  }

  /** 완전 제거 */
  destroy() {
    this._clearCountdown();
    if (this._root && this._root.parentNode) {
      this._root.parentNode.removeChild(this._root);
    }
    this._root = null;
    this._els  = {};
    this._visible = false;
  }

  /* ── private ─────────────────────────────────────── */

  _render() {
    const el = document.createElement('div');
    el.className = 'hud-overlay';
    el.setAttribute('aria-live', 'polite');
    el.setAttribute('aria-atomic', 'false');

    el.innerHTML = `
      <!-- 상단 HUD -->
      <div class="hud-top">
        <!-- 좌상단: 점수 -->
        <div class="hud-score-block" aria-label="점수">
          <div class="score-display__label">SCORE</div>
          <div class="score-display" id="hud-score">000000</div>
        </div>

        <!-- 우상단: 시간 -->
        <div class="hud-timer-block" id="hud-timer" aria-label="남은 시간">
          00:00
        </div>
      </div>

      <!-- 하단 HUD -->
      <div class="hud-bottom">
        <!-- 좌하단: 목숨 -->
        <div class="hud-lives-block" aria-label="목숨">
          <div class="lives-display__label">LIVES</div>
          <div class="lives-display" id="hud-lives">
            ${this._renderHearts(MAX_LIVES)}
          </div>
        </div>

        <!-- 우하단: FPS -->
        <div class="hud-fps-block" id="hud-fps" aria-hidden="true">
          FPS: --
        </div>
      </div>

      <!-- 카운트다운 오버레이 -->
      <div class="countdown" id="hud-countdown" style="display:none;">
        <div class="countdown__number" id="hud-countdown-num">3</div>
      </div>

      <!-- 게임오버 오버레이 -->
      <div class="gameover-overlay" id="hud-gameover" style="display:none;" aria-modal="true" role="dialog" aria-label="게임 오버">
        <h2 class="gameover-overlay__title">GAME OVER</h2>

        <div class="gameover-overlay__score-section">
          <div class="score-display__label">FINAL SCORE</div>
          <div class="gameover-overlay__score">
            <div class="score-display text-cyan">000000</div>
          </div>

          <div class="gameover-overlay__best-badge" style="display:none;">
            ★ NEW BEST ★
          </div>

          <div class="score-display__label" style="margin-top:8px;">BEST</div>
          <div class="gameover-overlay__best-score score-display text-yellow" style="font-size:clamp(1.2rem,4vw,1.6rem);">
            000000
          </div>
        </div>

        <div class="gameover-overlay__actions">
          <button class="btn-primary" data-action="replay">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
                 stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
              <polyline points="1 4 1 10 7 10"/>
              <path d="M3.51 15a9 9 0 1 0 .49-4.79"/>
            </svg>
            다시 하기
          </button>
          <button class="btn-secondary" data-action="menu">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
                 stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
              <line x1="3" y1="6"  x2="21" y2="6"/>
              <line x1="3" y1="12" x2="21" y2="12"/>
              <line x1="3" y1="18" x2="21" y2="18"/>
            </svg>
            메뉴로
          </button>
        </div>
      </div>
    `;

    this._container.appendChild(el);
    this._root = el;

    // DOM 캐싱
    this._els.score        = el.querySelector('#hud-score');
    this._els.timer        = el.querySelector('#hud-timer');
    this._els.lives        = el.querySelector('#hud-lives');
    this._els.fps          = el.querySelector('#hud-fps');
    this._els.countdown    = el.querySelector('#hud-countdown');
    this._els.countdownNum = el.querySelector('#hud-countdown-num');
    this._els.gameover     = el.querySelector('#hud-gameover');
  }

  _renderHearts(total, active = total) {
    return Array.from({ length: total }, (_, i) =>
      `<span class="lives-display__heart${i >= active ? ' lost' : ''}"
             aria-label="${i < active ? '목숨' : '잃은 목숨'}">${i < active ? HEART_FULL : HEART_LOST}</span>`
    ).join('');
  }

  _updateLives(count) {
    const el = this._els.lives;
    if (!el) return;
    const total  = MAX_LIVES;
    const active = Math.max(0, Math.min(count, total));
    el.innerHTML = this._renderHearts(total, active);
  }

  _clearCountdown() {
    if (this._countdownTimer) {
      clearTimeout(this._countdownTimer);
      this._countdownTimer = null;
    }
    if (this._els.countdown) {
      this._els.countdown.style.display = 'none';
    }
  }
}

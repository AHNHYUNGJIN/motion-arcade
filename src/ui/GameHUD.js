/**
 * GameHUD.js
 * 게임 HUD UI 컴포넌트
 *
 * 점수/타이머는 각 게임이 canvas에 직접 렌더링하므로 DOM HUD에서 제거.
 * DOM HUD 담당: 목숨(lives), FPS, 카운트다운 오버레이, 게임오버 오버레이.
 */

const HEART_FULL = '❤️';
const HEART_LOST = '🖤';

export class GameHUD {
  constructor(container) {
    this._container      = container;
    this._root           = null;
    this._countdownTimer = null;
    this._visible        = false;
    this._livesMax       = null;
    this._els            = {};
  }

  /* ── public API ──────────────────────────────────── */

  /**
   * HUD 표시 (게임 시작 시 호출)
   * @param {string}      gameId
   * @param {number|null} livesMax - null이면 목숨 UI 숨김
   */
  show(gameId, livesMax = null) {
    this._livesMax = livesMax;
    if (!this._root) this._render();

    const livesBlock = this._els.livesBlock;
    if (livesBlock) livesBlock.style.display = livesMax ? 'flex' : 'none';
    if (this._els.lives && livesMax) {
      this._els.lives.innerHTML = this._renderHearts(livesMax, livesMax);
    }

    this._root.style.display    = 'block';
    this._root.style.opacity    = '0';
    this._root.style.transition = 'opacity 0.3s ease';
    requestAnimationFrame(() => {
      if (this._root) this._root.style.opacity = '1';
    });
    this._visible = true;
  }

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
   * HUD 데이터 업데이트 (매 프레임)
   * @param {{ lives?: number|null, fps?: number }} data
   */
  update({ lives, fps } = {}) {
    if (!this._visible || !this._root) return;

    if (lives !== undefined && lives !== null && this._livesMax) {
      this._updateLives(lives);
    }

    if (fps !== undefined) {
      const el = this._els.fps;
      if (el) el.textContent = `FPS: ${Math.round(fps)}`;
    }
  }

  /**
   * 카운트다운 표시 (3 → 2 → 1 → GO!)
   * @param {number}      n
   * @param {() => void}  onDone
   */
  showCountdown(n = 3, onDone) {
    this._clearCountdown();

    const overlay = this._els.countdown;
    const numEl   = this._els.countdownNum;
    if (!overlay || !numEl) { onDone?.(); return; }

    overlay.style.display = 'flex';
    overlay.style.opacity = '1';
    let current = n;

    const tick = () => {
      if (current > 0) {
        numEl.className   = 'countdown__number';
        numEl.textContent = String(current);
        numEl.style.animation = 'none';
        void numEl.offsetWidth;
        numEl.style.animation = '';
        current--;
        this._countdownTimer = setTimeout(tick, 900);
      } else {
        numEl.className   = 'countdown__number go';
        numEl.textContent = 'GO!';
        numEl.style.animation = 'none';
        void numEl.offsetWidth;
        numEl.style.animation = '';
        this._countdownTimer = setTimeout(() => {
          overlay.style.transition = 'opacity 0.2s ease';
          overlay.style.opacity    = '0';
          setTimeout(() => { overlay.style.display = 'none'; onDone?.(); }, 220);
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
    const overlay   = this._els.gameover;
    if (!overlay) return;

    const scoreEl   = overlay.querySelector('.gameover-overlay__score .score-display');
    const bestEl    = overlay.querySelector('.gameover-overlay__best-score');
    const badgeEl   = overlay.querySelector('.gameover-overlay__best-badge');
    const replayBtn = overlay.querySelector('[data-action="replay"]');
    const menuBtn   = overlay.querySelector('[data-action="menu"]');

    if (scoreEl) scoreEl.textContent = String(score).padStart(6, '0');
    if (bestEl)  bestEl.textContent  = String(bestScore).padStart(6, '0');

    const isNewBest = score > 0 && score >= bestScore;
    if (badgeEl) badgeEl.style.display = isNewBest ? 'block' : 'none';

    if (replayBtn) replayBtn.onclick = () => { overlay.style.display = 'none'; onReplay?.(); };
    if (menuBtn)   menuBtn.onclick   = () => { overlay.style.display = 'none'; onMenu?.(); };

    overlay.style.display    = 'flex';
    overlay.style.opacity    = '0';
    overlay.style.transition = 'opacity 0.4s ease';
    requestAnimationFrame(() => { if (overlay) overlay.style.opacity = '1'; });
  }

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
      <!-- 하단 HUD: 목숨 + FPS -->
      <div class="hud-bottom">
        <div class="hud-lives-block" id="hud-lives-block" aria-label="목숨" style="display:none;">
          <div class="lives-display__label">LIVES</div>
          <div class="lives-display" id="hud-lives"></div>
        </div>
        <div class="hud-fps-block" id="hud-fps" aria-hidden="true">FPS: --</div>
      </div>

      <!-- 카운트다운 오버레이 -->
      <div class="countdown" id="hud-countdown" style="display:none;">
        <div class="countdown__number" id="hud-countdown-num">3</div>
      </div>

      <!-- 게임오버 오버레이 -->
      <div class="gameover-overlay" id="hud-gameover" style="display:none;"
           aria-modal="true" role="dialog" aria-label="게임 오버">
        <h2 class="gameover-overlay__title">GAME OVER</h2>

        <div class="gameover-overlay__score-section">
          <div class="score-display__label">FINAL SCORE</div>
          <div class="gameover-overlay__score">
            <div class="score-display text-cyan">000000</div>
          </div>
          <div class="gameover-overlay__best-badge" style="display:none;">★ NEW BEST ★</div>
          <div class="score-display__label" style="margin-top:8px;">BEST</div>
          <div class="gameover-overlay__best-score score-display text-yellow"
               style="font-size:clamp(1.2rem,4vw,1.6rem);">000000</div>
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

    this._els.livesBlock   = el.querySelector('#hud-lives-block');
    this._els.lives        = el.querySelector('#hud-lives');
    this._els.fps          = el.querySelector('#hud-fps');
    this._els.countdown    = el.querySelector('#hud-countdown');
    this._els.countdownNum = el.querySelector('#hud-countdown-num');
    this._els.gameover     = el.querySelector('#hud-gameover');
  }

  _renderHearts(total, active) {
    return Array.from({ length: total }, (_, i) =>
      `<span class="lives-display__heart${i >= active ? ' lost' : ''}"
             aria-label="${i < active ? '목숨' : '잃은 목숨'}">${i < active ? HEART_FULL : HEART_LOST}</span>`
    ).join('');
  }

  _updateLives(count) {
    const el = this._els.lives;
    if (!el || !this._livesMax) return;
    const active = Math.max(0, Math.min(count, this._livesMax));
    el.innerHTML = this._renderHearts(this._livesMax, active);
  }

  _clearCountdown() {
    if (this._countdownTimer) {
      clearTimeout(this._countdownTimer);
      this._countdownTimer = null;
    }
    if (this._els.countdown) this._els.countdown.style.display = 'none';
  }
}

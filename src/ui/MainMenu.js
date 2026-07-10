/**
 * MainMenu.js
 * 메인 메뉴 UI 컴포넌트
 * DOM 기반, canvas 없음
 */

/** 게임 정의 */
const GAMES = [
  {
    id: 'space-pong',
    title: 'Space Pong',
    desc: '몸으로 패들 조종!\\n공을 튕겨 적을 격파',
    difficulty: 2,
    icon: `
      <svg viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">
        <rect x="3" y="13" width="4" height="10" rx="2"/>
        <rect x="25" y="9" width="4" height="14" rx="2"/>
        <circle cx="16" cy="16" r="3"/>
        <line x1="7" y1="16" x2="25" y2="16" stroke-dasharray="3 3" opacity="0.4"/>
      </svg>`,
    accentColor: '#00ffff',
  },
  {
    id: 'fruit-slicer',
    title: 'Fruit Slicer',
    desc: '손을 휘둘러 과일을 베어라!\\n폭탄은 피해야 해',
    difficulty: 3,
    icon: `
      <svg viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">
        <circle cx="14" cy="18" r="7" stroke-dasharray="none"/>
        <line x1="10" y1="11" x2="18" y2="25" stroke-width="2.5"/>
        <path d="M14 11 Q16 6 20 8" fill="none"/>
        <path d="M22 6 L28 2 M22 6 L26 12" stroke-width="2"/>
      </svg>`,
    accentColor: '#ffff00',
  },
  {
    id: 'obstacle-dodge',
    title: 'Obstacle Dodge',
    desc: '몸 기울여 장애물 피하기!\\n얼마나 오래 버티나',
    difficulty: 2,
    icon: `
      <svg viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">
        <rect x="2"  y="6"  width="6" height="20" rx="2"/>
        <rect x="13" y="2"  width="6" height="14" rx="2"/>
        <rect x="24" y="10" width="6" height="18" rx="2"/>
        <path d="M16 20 L16 30 M13 27 L16 30 L19 27" stroke-width="2"/>
      </svg>`,
    accentColor: '#ff00ff',
  },
  {
    id: 'jump-challenge',
    title: 'Jump Challenge',
    desc: '실제로 점프해서 플랫폼 밟기!\\n높이 뛸수록 고득점',
    difficulty: 4,
    icon: `
      <svg viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">
        <rect x="2"  y="26" width="10" height="4" rx="2"/>
        <rect x="20" y="19" width="10" height="4" rx="2"/>
        <rect x="8"  y="12" width="10" height="4" rx="2"/>
        <path d="M16 8 L16 2 M13 5 L16 2 L19 5" stroke-width="2"/>
        <circle cx="16" cy="10" r="2" fill="currentColor" stroke="none"/>
      </svg>`,
    accentColor: '#ff00ff',
  },
];

/** 별 점수 → HTML */
function renderStars(count, max = 5) {
  return Array.from({ length: max }, (_, i) =>
    `<span class="game-card__star${i < count ? ' active' : ''}">★</span>`
  ).join('');
}

export class MainMenu {
  /**
   * @param {HTMLElement} container - 마운트 타겟
   */
  constructor(container) {
    this._container = container;
    this._root = null;
    this._onGameSelect = null;
    this._boundHandleCardClick = this._handleCardClick.bind(this);
    this._boundHandleKeydown   = this._handleKeydown.bind(this);
  }

  /* ── public API ──────────────────────────────────── */

  /**
   * 메뉴를 렌더링하고 표시
   * @param {(gameId: string) => void} onGameSelect
   */
  show(onGameSelect) {
    this._onGameSelect = onGameSelect;
    this._render();
    this._attachEvents();

    // 카드 순차 등장 애니메이션
    requestAnimationFrame(() => {
      const cards = this._root.querySelectorAll('.game-card');
      cards.forEach((card, i) => {
        card.style.opacity  = '0';
        card.style.transform = 'translateY(20px)';
        card.style.transition = `opacity 0.35s ease ${i * 0.07}s, transform 0.35s ease ${i * 0.07}s`;
        requestAnimationFrame(() => {
          card.style.opacity  = '1';
          card.style.transform = 'translateY(0)';
        });
      });
    });
  }

  /** 메뉴 숨기기 (DOM 유지) */
  hide() {
    if (this._root) {
      this._root.style.opacity    = '0';
      this._root.style.transition = 'opacity 0.25s ease';
      this._root.style.pointerEvents = 'none';
    }
  }

  /** 완전 제거 */
  destroy() {
    this._detachEvents();
    if (this._root && this._root.parentNode) {
      this._root.parentNode.removeChild(this._root);
    }
    this._root = null;
    this._onGameSelect = null;
  }

  /* ── private ─────────────────────────────────────── */

  _render() {
    // 기존 제거
    if (this._root) {
      this._detachEvents();
      this._root.remove();
    }

    const el = document.createElement('div');
    el.className = 'main-menu';
    el.setAttribute('role', 'main');
    el.setAttribute('aria-label', 'Motion Arcade 메인 메뉴');

    el.innerHTML = `
      <!-- 헤더 -->
      <header class="main-menu__header">
        <h1 class="main-menu__logo" data-text="MOTION ARCADE">
          MOTION ARCADE
        </h1>
        <p class="main-menu__tagline">Move Your Body · Play The Game</p>
      </header>

      <!-- 게임 카드 그리드 -->
      <section
        class="main-menu__grid"
        role="list"
        aria-label="게임 목록"
      >
        ${GAMES.map(game => this._renderCard(game)).join('')}
      </section>

      <!-- 하단 안내 -->
      <footer class="main-menu__footer">
        <svg class="main-menu__footer-icon" viewBox="0 0 24 24"
             fill="none" stroke="#00ffff" stroke-width="2"
             xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
          <path d="M12 2a5 5 0 1 1 0 10A5 5 0 0 1 12 2z"/>
          <path d="M5 22a7 7 0 0 1 14 0"/>
        </svg>
        <p class="main-menu__hint">
          카메라를 향해 서세요 — 전신이 보이게 해주세요
        </p>
      </footer>
    `;

    this._container.appendChild(el);
    this._root = el;
  }

  _renderCard(game) {
    const svgStroked = game.icon.replace(
      /(<svg[^>]*>)/,
      `$1<style>svg{stroke:${game.accentColor};fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;}</style>`
    );

    return `
      <article
        class="game-card"
        role="listitem"
        data-game-id="${game.id}"
        tabindex="0"
        aria-label="${game.title}: ${game.desc.replace(/\\n/g, ' ')} (난이도 ${game.difficulty}/${5})"
      >
        <div class="game-card__icon" style="border-color:${game.accentColor}22;">
          ${svgStroked}
        </div>
        <h2 class="game-card__title">${game.title}</h2>
        <p class="game-card__desc">${game.desc.replace(/\\n/g, '<br>')}</p>
        <div class="game-card__stars" aria-label="난이도 ${game.difficulty}/${5}">
          ${renderStars(game.difficulty)}
        </div>
      </article>
    `;
  }

  _attachEvents() {
    if (!this._root) return;
    this._root.addEventListener('click',   this._boundHandleCardClick);
    this._root.addEventListener('keydown', this._boundHandleKeydown);
  }

  _detachEvents() {
    if (!this._root) return;
    this._root.removeEventListener('click',   this._boundHandleCardClick);
    this._root.removeEventListener('keydown', this._boundHandleKeydown);
  }

  _handleCardClick(e) {
    const card = e.target.closest('.game-card[data-game-id]');
    if (!card) return;

    const gameId = card.dataset.gameId;
    if (!gameId) return;

    // 선택 시각 피드백
    card.style.transition = 'transform 0.12s ease, box-shadow 0.12s ease';
    card.style.transform  = 'scale(0.95)';
    setTimeout(() => {
      if (card) card.style.transform = '';
    }, 120);

    if (typeof this._onGameSelect === 'function') {
      this._onGameSelect(gameId);
    }
  }

  _handleKeydown(e) {
    const card = e.target.closest('.game-card[data-game-id]');
    if (!card) return;

    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      this._handleCardClick(e);
    }
  }
}

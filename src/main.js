/**
 * main.js
 * Motion Arcade — 앱 진입점 & 상태 머신 오케스트레이터
 *
 * 상태 흐름:
 *   loading → calibration → menu → game → gameover → menu
 *
 * 레이어 z-index:
 *   video(0) < gameCanvas(1) < poseCanvas(2) < ui(3)
 */

import { Camera }            from './core/Camera.js';
import { PoseEngine }        from './core/PoseEngine.js';
import { GestureRecognizer } from './core/GestureRecognizer.js';
import { GameLoop }          from './core/GameLoop.js';
import { SpacePong }         from './games/SpacePong.js';
import { FruitSlicer }       from './games/FruitSlicer.js';
import { ObstacleDodge }     from './games/ObstacleDodge.js';
import { JumpChallenge }     from './games/JumpChallenge.js';
import { MainMenu }          from './ui/MainMenu.js';
import { GameHUD }           from './ui/GameHUD.js';
import { PoseOverlay }       from './ui/PoseOverlay.js';
import { Calibration }       from './ui/Calibration.js';

/* ======================================================
   앱 상태
   ====================================================== */

/** @type {'loading'|'calibration'|'menu'|'game'|'gameover'} */
let appState = 'loading';

/* ── 전역 인스턴스 ──────────────────────────────────── */
/** @type {Camera}            */ let camera;
/** @type {PoseEngine}        */ let poseEngine;
/** @type {GestureRecognizer} */ let gestureRecognizer;
/** @type {GameLoop}          */ let gameLoop;

/** @type {SpacePong|FruitSlicer|ObstacleDodge|JumpChallenge|null} */
let currentGame = null;

/** @type {MainMenu}    */ let mainMenu;
/** @type {GameHUD}     */ let gameHUD;
/** @type {PoseOverlay} */ let poseOverlay;
/** @type {Calibration} */ let calibration;

/* ── DOM 레이어 참조 ────────────────────────────────── */
let appEl, videoEl, gameCanvas, poseCanvas, uiLayer;

/* ── 게임 ID → 클래스 매핑 ──────────────────────────── */
const GAME_MAP = {
  'space-pong':      SpacePong,
  'fruit-slicer':    FruitSlicer,
  'obstacle-dodge':  ObstacleDodge,
  'jump-challenge':  JumpChallenge,
};

/* ── 게임별 최고 점수 (세션 유지) ───────────────────── */
const bestScores = {
  'space-pong':     0,
  'fruit-slicer':   0,
  'obstacle-dodge': 0,
  'jump-challenge': 0,
};

/* ── 현재 포즈 캐시 ─────────────────────────────────── */
let latestPose = null;

/* ======================================================
   진입점
   ====================================================== */

document.addEventListener('DOMContentLoaded', () => {
  init().catch(err => {
    console.error('[main] 초기화 실패:', err);
    showErrorScreen(err);
  });
});

/* ======================================================
   초기화
   ====================================================== */

async function init() {
  setState('loading');

  // ── DOM 구조 생성 ──────────────────────────────────
  buildDOM();

  // ── 로딩 화면 표시 ────────────────────────────────
  showLoadingScreen();

  try {
    // ── 1. 카메라 초기화 ──────────────────────────────
    setLoadingStatus('카메라 초기화 중…', 10);
    camera = new Camera(videoEl);
    await camera.start();
    setLoadingStatus('카메라 준비 완료', 30);

    // ── 2. PoseEngine (TF.js MoveNet) 로드 ───────────
    setLoadingStatus('포즈 엔진 로딩 중…', 40);
    poseEngine = new PoseEngine();
    await poseEngine.load();
    setLoadingStatus('포즈 엔진 준비 완료', 70);

    // ── 3. GestureRecognizer 초기화 ───────────────────
    setLoadingStatus('제스처 인식 초기화 중…', 80);
    gestureRecognizer = new GestureRecognizer();
    setLoadingStatus('준비 완료!', 100);

    // ── 4. UI 컴포넌트 초기화 ─────────────────────────
    poseOverlay = new PoseOverlay(poseCanvas);
    mainMenu    = new MainMenu(uiLayer);
    gameHUD     = new GameHUD(uiLayer);
    gameLoop    = new GameLoop(onFrame);

    // ── 5. 모바일 이벤트 등록 ─────────────────────────
    registerVisibilityHandlers();

    // ── 6. 캘리브레이션 시작 ──────────────────────────
    await delay(400); // 로딩 완료 표시 잠깐 보여주기
    hideLoadingScreen();
    startCalibration();

  } catch (err) {
    if (isPermissionError(err)) {
      showCameraPermissionError();
    } else {
      throw err;
    }
  }
}

/* ======================================================
   DOM 구조
   ====================================================== */

function buildDOM() {
  appEl = document.getElementById('app');
  if (!appEl) {
    appEl = document.createElement('div');
    appEl.id = 'app';
    document.body.appendChild(appEl);
  }

  // 비디오 레이어 (z-index: 0)
  const videoLayer = getOrCreate(appEl, 'div', 'video-layer');
  videoLayer.style.cssText = 'position:absolute;inset:0;z-index:0;';
  videoEl = getOrCreate(videoLayer, 'video', 'camera-video');
  videoEl.setAttribute('playsinline', '');
  videoEl.setAttribute('muted', '');
  videoEl.setAttribute('autoplay', '');
  videoEl.setAttribute('aria-hidden', 'true');

  // 게임 캔버스 레이어 (z-index: 1)
  const gameLayer = getOrCreate(appEl, 'div', 'game-canvas-layer');
  gameLayer.style.cssText = 'position:absolute;inset:0;z-index:1;';
  gameCanvas = getOrCreate(gameLayer, 'canvas', 'game-canvas');
  gameCanvas.style.cssText = 'width:100%;height:100%;display:block;';
  syncCanvasToParent(gameCanvas);

  // 포즈 캔버스 레이어 (z-index: 2)
  const poseLayer = getOrCreate(appEl, 'div', 'pose-canvas-layer');
  poseLayer.style.cssText = 'position:absolute;inset:0;z-index:2;pointer-events:none;';
  poseCanvas = getOrCreate(poseLayer, 'canvas', 'pose-canvas');
  poseCanvas.style.cssText = 'width:100%;height:100%;display:block;';
  syncCanvasToParent(poseCanvas);

  // UI 레이어 (z-index: 3)
  uiLayer = getOrCreate(appEl, 'div', 'ui-layer');
  uiLayer.style.cssText = 'position:absolute;inset:0;z-index:3;pointer-events:none;';

  // 창 크기 변경 시 캔버스 동기화
  window.addEventListener('resize', () => {
    syncCanvasToParent(gameCanvas);
    syncCanvasToParent(poseCanvas);
  });
}

/* ======================================================
   상태 머신
   ====================================================== */

/** @param {'loading'|'calibration'|'menu'|'game'|'gameover'} s */
function setState(s) {
  appState = s;
  console.debug('[main] state →', s);
}

/* ── 캘리브레이션 ──────────────────────────────────── */

function startCalibration() {
  setState('calibration');

  calibration = new Calibration(uiLayer, poseCanvas);
  calibration.start(
    (calibData) => {
      console.info('[main] 캘리브레이션 완료:', calibData);
      calibration.destroy();
      calibration = null;
      showMenu();
    },
    () => latestPose   // 현재 포즈 반환 함수
  );

  // 캘리브레이션 중에도 포즈 감지 루프 실행
  gameLoop.start();
}

/* ── 메뉴 ─────────────────────────────────────────── */

function showMenu() {
  setState('menu');

  // HUD, 게임 정리
  if (currentGame) {
    currentGame.destroy?.();
    currentGame = null;
  }
  gameHUD.hide();

  mainMenu.show((gameId) => {
    startGame(gameId);
  });
}

/* ── 게임 시작 ────────────────────────────────────── */

/**
 * @param {string} gameId
 */
function startGame(gameId) {
  const GameClass = GAME_MAP[gameId];
  if (!GameClass) {
    console.warn('[main] 알 수 없는 게임 ID:', gameId);
    return;
  }

  // 메뉴 숨기기
  mainMenu.hide();
  setState('game');

  // 이전 게임 정리
  if (currentGame) {
    currentGame.destroy?.();
    currentGame = null;
  }

  // 새 게임 생성
  currentGame = new GameClass(gameCanvas, {
    onGameOver: (score) => endGame(gameId, score),
  });

  // HUD 표시
  gameHUD.show(gameId);

  // 3 카운트다운 후 게임 시작
  gameHUD.showCountdown(3, () => {
    currentGame.start?.();
    gameLoop.start();
  });
}

/* ── 게임 종료 ────────────────────────────────────── */

/**
 * @param {string} gameId
 * @param {number} score
 */
function endGame(gameId, score) {
  setState('gameover');
  gameLoop.stop();

  const best = bestScores[gameId] ?? 0;
  if (score > best) {
    bestScores[gameId] = score;
  }

  gameHUD.showGameOver(
    { score, bestScore: bestScores[gameId] },
    () => startGame(gameId),   // 다시 하기
    () => returnToMenu()        // 메뉴로
  );
}

/* ── 메뉴 복귀 ────────────────────────────────────── */

function returnToMenu() {
  if (currentGame) {
    currentGame.destroy?.();
    currentGame = null;
  }
  showMenu();
}

/* ======================================================
   게임 루프 콜백 — 매 프레임
   ====================================================== */

/**
 * @param {number} dt    - 델타 타임 (초)
 * @param {number} fps   - 현재 FPS
 */
async function onFrame(dt, fps) {
  // ── 포즈 감지 ────────────────────────────────────
  if (poseEngine && camera?.isReady()) {
    try {
      latestPose = await poseEngine.detect(videoEl);
    } catch {
      // 프레임 드랍 허용
    }
  }

  // ── 제스처 업데이트 ──────────────────────────────
  if (gestureRecognizer && latestPose) {
    gestureRecognizer.update(latestPose);
  }

  // ── 게임 업데이트 & 렌더링 ───────────────────────
  if (appState === 'game' && currentGame) {
    const gesture = gestureRecognizer?.getGesture?.() ?? null;
    const state   = currentGame.update(dt, { pose: latestPose, gesture });

    // 캔버스 싱크
    syncCanvasToParent(gameCanvas);
    currentGame.draw(gameCanvas.getContext('2d'));

    // HUD 업데이트
    if (state) {
      gameHUD.update({
        score:    state.score,
        lives:    state.lives,
        timeLeft: state.timeLeft,
        fps,
      });
    }
  }

  // ── 포즈 오버레이 렌더링 ─────────────────────────
  if (poseOverlay && latestPose) {
    const vw = videoEl.videoWidth  || videoEl.clientWidth  || gameCanvas.width;
    const vh = videoEl.videoHeight || videoEl.clientHeight || gameCanvas.height;
    poseOverlay.draw(latestPose, vw, vh);
  }
}

/* ======================================================
   로딩 화면
   ====================================================== */

let loadingEl = null;

function showLoadingScreen() {
  if (loadingEl) return;

  loadingEl = document.createElement('div');
  loadingEl.id = 'loading-screen';
  loadingEl.className = 'loading-screen';
  loadingEl.setAttribute('role', 'status');
  loadingEl.setAttribute('aria-live', 'polite');

  loadingEl.innerHTML = `
    <div class="loading-screen__logo">MOTION ARCADE</div>
    <div class="loading-screen__progress-wrapper">
      <div class="loading-screen__label" id="loading-label">초기화 중…</div>
      <div class="loading-bar">
        <div class="loading-bar__fill" id="loading-bar" style="width:0%;"></div>
        <div class="loading-bar__shimmer"></div>
      </div>
    </div>
  `;

  appEl.appendChild(loadingEl);
}

/**
 * @param {string} label
 * @param {number} percent 0~100
 */
function setLoadingStatus(label, percent) {
  const labelEl = document.getElementById('loading-label');
  const barEl   = document.getElementById('loading-bar');
  if (labelEl) labelEl.textContent = label;
  if (barEl)   barEl.style.width   = `${percent}%`;
}

function hideLoadingScreen() {
  if (!loadingEl) return;
  loadingEl.style.transition = 'opacity 0.4s ease';
  loadingEl.style.opacity    = '0';
  setTimeout(() => {
    loadingEl?.remove();
    loadingEl = null;
  }, 420);
}

/* ======================================================
   에러 화면
   ====================================================== */

function showCameraPermissionError() {
  hideLoadingScreen();
  showErrorScreen(null, {
    title:   '카메라 접근 권한이 필요합니다',
    message: '브라우저 설정에서 카메라 권한을 허용한 뒤\n페이지를 새로고침 해주세요.',
    icon:    '📷',
    retry:   true,
  });
}

function showErrorScreen(err, opts = {}) {
  const el = document.createElement('div');
  el.className = 'error-screen anim-fade-in';
  el.innerHTML = `
    <div class="error-screen__icon">${opts.icon ?? '⚠️'}</div>
    <p class="error-screen__title">${opts.title ?? '오류가 발생했습니다'}</p>
    <p class="error-screen__message">
      ${(opts.message ?? err?.message ?? '알 수 없는 오류').replace(/\n/g, '<br>')}
    </p>
    ${opts.retry ? `
      <button class="btn-secondary" onclick="location.reload()">
        새로고침
      </button>
    ` : ''}
  `;
  appEl?.appendChild(el);
}

/* ======================================================
   모바일 — Visibility 핸들러
   ====================================================== */

function registerVisibilityHandlers() {
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      onPause();
    } else {
      onResume();
    }
  });

  // iOS Safari: pagehide/pageshow
  window.addEventListener('pagehide', onPause);
  window.addEventListener('pageshow', onResume);
}

function onPause() {
  if (appState === 'game') {
    gameLoop.stop();
    currentGame?.pause?.();
  }
}

function onResume() {
  if (appState === 'game' && currentGame) {
    currentGame.resume?.();
    gameLoop.start();
  }
}

/* ======================================================
   유틸리티
   ====================================================== */

/**
 * id가 있는 자식 요소를 찾거나 생성
 * @param {HTMLElement} parent
 * @param {string} tag
 * @param {string} id
 * @returns {HTMLElement}
 */
function getOrCreate(parent, tag, id) {
  let el = document.getElementById(id);
  if (!el) {
    el = document.createElement(tag);
    el.id = id;
    parent.appendChild(el);
  }
  return el;
}

/**
 * 캔버스 해상도를 렌더링 크기에 맞춤 (DPR 고려)
 * @param {HTMLCanvasElement} canvas
 */
function syncCanvasToParent(canvas) {
  const dpr    = Math.min(window.devicePixelRatio || 1, 2);
  const parent = canvas.parentElement;
  if (!parent) return;

  const { width, height } = parent.getBoundingClientRect();
  const w = Math.round(width  * dpr);
  const h = Math.round(height * dpr);

  if (canvas.width !== w || canvas.height !== h) {
    canvas.width  = w;
    canvas.height = h;
  }
}

/**
 * @param {Error} err
 * @returns {boolean}
 */
function isPermissionError(err) {
  return (
    err?.name === 'NotAllowedError' ||
    err?.name === 'PermissionDeniedError' ||
    err?.message?.toLowerCase().includes('permission')
  );
}

/**
 * @param {number} ms
 * @returns {Promise<void>}
 */
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

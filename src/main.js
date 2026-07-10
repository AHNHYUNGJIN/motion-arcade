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

/* ── 상태 ───────────────────────────────────────────── */
let appState = 'loading';
let currentGameId = null;

/* ── 인스턴스 ──────────────────────────────────────── */
let camera, poseEngine, gestureRecognizer, gameLoop;
let currentGame = null;
let mainMenu, gameHUD, poseOverlay, calibration;

/* ── DOM 참조 ──────────────────────────────────────── */
let appEl, videoLayer, videoEl, gameCanvas, poseCanvas, uiLayer;

/* ── 게임 맵 ───────────────────────────────────────── */
const GAME_MAP = {
  'space-pong':     SpacePong,
  'fruit-slicer':   FruitSlicer,
  'obstacle-dodge': ObstacleDodge,
  'jump-challenge': JumpChallenge,
};

/* ── 최고 점수 (localStorage 영구 저장) ──────────────── */
const _savedScores = (() => {
  try { return JSON.parse(localStorage.getItem('motion-arcade-scores') || '{}'); } catch { return {}; }
})();
const bestScores = {
  'space-pong': 0, 'fruit-slicer': 0,
  'obstacle-dodge': 0, 'jump-challenge': 0,
  ..._savedScores,
};

/* ── 포즈 캐시 ─────────────────────────────────────── */
let latestPose = null;
let poseLoopRunning = false;

/* ======================================================
   진입점
   ====================================================== */
document.addEventListener('DOMContentLoaded', () => {
  init().catch(err => {
    console.error('[main] 초기화 실패:', err);
    if (isPermissionError(err)) showCameraPermissionError();
    else showErrorScreen(err);
  });
});

/* ======================================================
   초기화
   ====================================================== */
async function init() {
  setState('loading');
  buildDOM();
  showLoadingScreen();

  try {
    setLoadingStatus('카메라 초기화 중…', 10);
    camera = new Camera();
    await camera.init(videoLayer);
    videoEl = camera.videoElement;
    setLoadingStatus('카메라 준비 완료', 30);

    setLoadingStatus('AI 포즈 엔진 로딩 중…', 40);
    const isMobile = /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent);
    poseEngine = new PoseEngine({ frameSkip: isMobile ? 2 : 1 });
    await poseEngine.init();
    setLoadingStatus('포즈 엔진 준비 완료', 70);

    setLoadingStatus('제스처 인식 초기화 중…', 80);
    const vw = videoEl.videoWidth  || 640;
    const vh = videoEl.videoHeight || 480;
    gestureRecognizer = new GestureRecognizer(vw, vh);
    setLoadingStatus('준비 완료!', 100);

    poseOverlay = new PoseOverlay(poseCanvas);
    mainMenu    = new MainMenu(uiLayer);
    gameHUD     = new GameHUD(uiLayer);
    gameLoop    = new GameLoop();

    registerVisibilityHandlers();
    startPoseLoop();

    await delay(400);
    hideLoadingScreen();
    startCalibration();

  } catch (err) {
    if (isPermissionError(err)) showCameraPermissionError();
    else throw err;
  }
}

/* ======================================================
   포즈 감지 루프 — 게임 루프와 분리된 비동기 루프
   ====================================================== */
function startPoseLoop() {
  poseLoopRunning = true;

  async function loop() {
    if (!poseLoopRunning) return;

    if (poseEngine?.isReady && camera?.isReady && videoEl) {
      try {
        const pose = await poseEngine.detect(videoEl);
        latestPose = pose;
        if (gestureRecognizer && pose) gestureRecognizer.update(pose);
      } catch { /* 프레임 드랍 허용 */ }
    }

    requestAnimationFrame(loop);
  }

  requestAnimationFrame(loop);
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
  appEl.style.cssText = 'position:fixed;inset:0;overflow:hidden;background:#0a0a1a;';

  videoLayer = getOrCreate(appEl, 'div', 'video-layer');
  videoLayer.style.cssText = 'position:absolute;inset:0;z-index:0;overflow:hidden;';

  const gameLayer = getOrCreate(appEl, 'div', 'game-canvas-layer');
  gameLayer.style.cssText = 'position:absolute;inset:0;z-index:1;';
  gameCanvas = getOrCreate(gameLayer, 'canvas', 'game-canvas');
  gameCanvas.style.cssText = 'width:100%;height:100%;display:block;';
  syncCanvas(gameCanvas);

  const poseLayer = getOrCreate(appEl, 'div', 'pose-canvas-layer');
  poseLayer.style.cssText = 'position:absolute;inset:0;z-index:2;pointer-events:none;';
  poseCanvas = getOrCreate(poseLayer, 'canvas', 'pose-canvas');
  poseCanvas.style.cssText = 'width:100%;height:100%;display:block;';
  syncCanvas(poseCanvas);

  uiLayer = getOrCreate(appEl, 'div', 'ui-layer');
  uiLayer.style.cssText = 'position:absolute;inset:0;z-index:3;';

  window.addEventListener('resize', () => {
    syncCanvas(gameCanvas);
    syncCanvas(poseCanvas);
    // 실행 중인 게임의 논리 크기 갱신
    if (currentGame) {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      currentGame.width  = gameCanvas.width  / dpr;
      currentGame.height = gameCanvas.height / dpr;
    }
  });
}

/* ======================================================
   상태 머신
   ====================================================== */
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
      if (calibData && gestureRecognizer && latestPose) {
        gestureRecognizer.calibrate(latestPose);
      }
      calibration.destroy();
      calibration = null;
      showMenu();
    },
    () => latestPose
  );
}

/* ── 메뉴 ─────────────────────────────────────────── */
function showMenu() {
  setState('menu');
  gameLoop.stop();
  currentGame?.destroy?.();
  currentGame = null;
  currentGameId = null;
  gameHUD.hide();
  mainMenu.show((gameId) => startGame(gameId));
}

/* ── 게임 시작 ────────────────────────────────────── */
function startGame(gameId) {
  const GameClass = GAME_MAP[gameId];
  if (!GameClass) return;

  mainMenu.hide();
  setState('game');
  currentGame?.destroy?.();

  // DPR을 적용한 CSS 논리 픽셀 크기를 게임에 전달
  syncCanvas(gameCanvas);
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = gameCanvas.width  / dpr;
  const h = gameCanvas.height / dpr;

  currentGame = new GameClass(gameCanvas, w, h);
  currentGame.init();
  currentGameId = gameId;

  gameHUD.show(gameId, currentGame.livesMax);
  gameHUD.showCountdown(3, () => {
    gameLoop.start(gameUpdate, gameDraw);
  });
}

/* ── 게임 루프 콜백 ───────────────────────────────── */
function gameUpdate(dt) {
  if (appState !== 'game' || !currentGame) return;

  const gesture = gestureRecognizer ? {
    bodyX:     gestureRecognizer.bodyX,
    bodyLean:  gestureRecognizer.bodyLean,
    isJumping: gestureRecognizer.isJumping,
    leftHand:  gestureRecognizer.leftHand,
    rightHand: gestureRecognizer.rightHand,
  } : null;

  currentGame.update(dt, gesture);

  if (currentGame.isGameOver) {
    endGame(currentGameId, currentGame.score);
  }
}

function gameDraw() {
  if (appState !== 'game' || !currentGame) return;

  // DPR 스케일 적용: 게임이 CSS 픽셀 좌표계에서 그리도록 함
  const dpr = syncCanvas(gameCanvas);
  const ctx  = gameCanvas.getContext('2d');
  ctx.save();
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  currentGame.draw();
  ctx.restore();

  // DOM HUD: 라이프 + FPS
  gameHUD.update({
    lives: currentGame.lives,
    fps:   gameLoop.fps,
  });

  // 포즈 오버레이
  if (poseOverlay && latestPose && videoEl) {
    const vw = videoEl.videoWidth  || videoEl.clientWidth  || 640;
    const vh = videoEl.videoHeight || videoEl.clientHeight || 480;
    poseOverlay.draw(latestPose, vw, vh);
  }
}

/* ── 게임 종료 ────────────────────────────────────── */
function endGame(gameId, score) {
  setState('gameover');
  gameLoop.stop();

  if (score > (bestScores[gameId] ?? 0)) {
    bestScores[gameId] = score;
    try { localStorage.setItem('motion-arcade-scores', JSON.stringify(bestScores)); } catch {}
  }

  gameHUD.showGameOver(
    { score, bestScore: bestScores[gameId] },
    () => startGame(gameId),
    () => returnToMenu()
  );
}

function returnToMenu() {
  currentGame?.destroy?.();
  currentGame = null;
  showMenu();
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
  loadingEl.innerHTML = `
    <div class="loading-screen__logo">MOTION ARCADE</div>
    <div class="loading-screen__progress-wrapper">
      <div class="loading-screen__label" id="loading-label">초기화 중…</div>
      <div class="loading-bar">
        <div class="loading-bar__fill" id="loading-bar" style="width:0%;"></div>
      </div>
    </div>
  `;
  appEl.appendChild(loadingEl);
}

function setLoadingStatus(label, percent) {
  const lbl = document.getElementById('loading-label');
  const bar = document.getElementById('loading-bar');
  if (lbl) lbl.textContent = label;
  if (bar) bar.style.width = `${percent}%`;
}

function hideLoadingScreen() {
  if (!loadingEl) return;
  loadingEl.style.transition = 'opacity 0.4s';
  loadingEl.style.opacity = '0';
  setTimeout(() => { loadingEl?.remove(); loadingEl = null; }, 420);
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
  el.className = 'error-screen';
  el.innerHTML = `
    <div class="error-screen__icon">${opts.icon ?? '⚠️'}</div>
    <p class="error-screen__title">${opts.title ?? '오류가 발생했습니다'}</p>
    <p class="error-screen__message">
      ${(opts.message ?? err?.message ?? '알 수 없는 오류').replace(/\n/g, '<br>')}
    </p>
    ${opts.retry ? `<button class="btn-secondary" onclick="location.reload()">새로고침</button>` : ''}
  `;
  appEl?.appendChild(el);
}

/* ======================================================
   모바일 Visibility 핸들러
   ====================================================== */
function registerVisibilityHandlers() {
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { if (appState === 'game') gameLoop.stop(); }
    else                  { if (appState === 'game' && currentGame) gameLoop.start(gameUpdate, gameDraw); }
  });
  window.addEventListener('pagehide', () => { if (appState === 'game') gameLoop.stop(); });
  window.addEventListener('pageshow', () => { if (appState === 'game' && currentGame) gameLoop.start(gameUpdate, gameDraw); });
}

/* ======================================================
   유틸
   ====================================================== */
function getOrCreate(parent, tag, id) {
  let el = document.getElementById(id);
  if (!el) { el = document.createElement(tag); el.id = id; parent.appendChild(el); }
  return el;
}

/**
 * 캔버스를 DPR 기반 device px 크기로 동기화.
 * 반환값 dpr을 ctx.setTransform(dpr,0,0,dpr,0,0)에 사용하면
 * 게임이 CSS 픽셀 좌표계로 동작하고 폰트/좌표가 모든 DPR에서 올바른 크기로 표시됨.
 */
function syncCanvas(canvas) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const parent = canvas.parentElement;
  if (!parent) return dpr;
  const { width, height } = parent.getBoundingClientRect();
  const w = Math.round(width  * dpr);
  const h = Math.round(height * dpr);
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width  = w;
    canvas.height = h;
  }
  return dpr;
}

function isPermissionError(err) {
  return err?.name === 'NotAllowedError' ||
         err?.name === 'PermissionDeniedError' ||
         !!err?.message?.toLowerCase().includes('permission');
}

function delay(ms) {
  return new Promise(r => setTimeout(r, ms));
}

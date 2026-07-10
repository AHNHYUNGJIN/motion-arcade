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

const bestScores = {
  'space-pong': 0, 'fruit-slicer': 0,
  'obstacle-dodge': 0, 'jump-challenge': 0,
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
    // 1. 카메라 — Camera.init(container) 시그니처
    setLoadingStatus('카메라 초기화 중…', 10);
    camera = new Camera();
    await camera.init(videoLayer);          // videoLayer div를 컨테이너로 전달
    videoEl = camera.videoElement;          // Camera가 만든 video 엘리먼트 참조
    setLoadingStatus('카메라 준비 완료', 30);

    // 2. PoseEngine — init() 시그니처 (모바일: frameSkip 2)
    setLoadingStatus('AI 포즈 엔진 로딩 중…', 40);
    const isMobile = /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent);
    poseEngine = new PoseEngine({ frameSkip: isMobile ? 2 : 1 });
    await poseEngine.init();
    setLoadingStatus('포즈 엔진 준비 완료', 70);

    // 3. GestureRecognizer — 비디오 해상도 전달
    setLoadingStatus('제스처 인식 초기화 중…', 80);
    const vw = videoEl.videoWidth  || 640;
    const vh = videoEl.videoHeight || 480;
    gestureRecognizer = new GestureRecognizer(vw, vh);
    setLoadingStatus('준비 완료!', 100);

    // 4. UI 초기화
    poseOverlay = new PoseOverlay(poseCanvas);
    mainMenu    = new MainMenu(uiLayer);
    gameHUD     = new GameHUD(uiLayer);
    gameLoop    = new GameLoop();           // 인자 없음

    registerVisibilityHandlers();

    // 5. 포즈 감지 루프 시작 (게임 루프와 분리)
    startPoseLoop();

    // 6. 캘리브레이션
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
        if (gestureRecognizer && pose) {
          gestureRecognizer.update(pose);
        }
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

  // z-index 0 — 카메라 비디오 컨테이너 (Camera.init() 이 video를 여기에 추가)
  videoLayer = getOrCreate(appEl, 'div', 'video-layer');
  videoLayer.style.cssText = 'position:absolute;inset:0;z-index:0;overflow:hidden;';

  // z-index 1 — 게임 캔버스
  const gameLayer = getOrCreate(appEl, 'div', 'game-canvas-layer');
  gameLayer.style.cssText = 'position:absolute;inset:0;z-index:1;';
  gameCanvas = getOrCreate(gameLayer, 'canvas', 'game-canvas');
  gameCanvas.style.cssText = 'width:100%;height:100%;display:block;';
  syncCanvas(gameCanvas);

  // z-index 2 — 포즈 오버레이 캔버스
  const poseLayer = getOrCreate(appEl, 'div', 'pose-canvas-layer');
  poseLayer.style.cssText = 'position:absolute;inset:0;z-index:2;pointer-events:none;';
  poseCanvas = getOrCreate(poseLayer, 'canvas', 'pose-canvas');
  poseCanvas.style.cssText = 'width:100%;height:100%;display:block;';
  syncCanvas(poseCanvas);

  // z-index 3 — UI (메뉴, HUD 등)
  uiLayer = getOrCreate(appEl, 'div', 'ui-layer');
  uiLayer.style.cssText = 'position:absolute;inset:0;z-index:3;';

  window.addEventListener('resize', () => {
    syncCanvas(gameCanvas);
    syncCanvas(poseCanvas);
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
      // 캘리브레이션 완료 → GestureRecognizer 기준점 설정
      if (calibData && gestureRecognizer && latestPose) {
        gestureRecognizer.calibrate(latestPose);
      }
      calibration.destroy();
      calibration = null;
      showMenu();
    },
    () => latestPose   // Calibration이 포즈를 폴링할 함수
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

  // Canvas 크기 동기화
  syncCanvas(gameCanvas);
  const w = gameCanvas.width;
  const h = gameCanvas.height;

  // GameClass(canvas, width, height) 시그니처
  currentGame = new GameClass(gameCanvas, w, h);
  currentGame.init();
  currentGameId = gameId;

  gameHUD.show(gameId);
  gameHUD.showCountdown(3, () => {
    // GameLoop.start(updateFn, drawFn) 시그니처
    gameLoop.start(gameUpdate, gameDraw);
  });
}

/* ── 게임 루프 콜백 ───────────────────────────────── */
function gameUpdate(dt) {
  if (appState !== 'game' || !currentGame) return;

  // gesture 객체 조립 (GestureRecognizer는 getter 기반)
  const gesture = gestureRecognizer ? {
    bodyX:    gestureRecognizer.bodyX,
    bodyLean: gestureRecognizer.bodyLean,
    isJumping: gestureRecognizer.isJumping,
    leftHand:  gestureRecognizer.leftHand,
    rightHand: gestureRecognizer.rightHand,
  } : null;

  currentGame.update(dt, gesture);

  // 게임오버 감지 (게임에서 콜백 없이 isGameOver 플래그로 처리)
  if (currentGame.isGameOver) {
    endGame(currentGameId, currentGame.score);
  }
}

function gameDraw() {
  if (appState !== 'game' || !currentGame) return;

  syncCanvas(gameCanvas);
  currentGame.draw();

  // HUD 업데이트
  gameHUD.update({
    score:    currentGame.score,
    timeLeft: currentGame.timeLeft,
    fps:      gameLoop.fps,
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

function syncCanvas(canvas) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const parent = canvas.parentElement;
  if (!parent) return;
  const { width, height } = parent.getBoundingClientRect();
  const w = Math.round(width * dpr);
  const h = Math.round(height * dpr);
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width  = w;
    canvas.height = h;
  }
}

function isPermissionError(err) {
  return err?.name === 'NotAllowedError' ||
         err?.name === 'PermissionDeniedError' ||
         !!err?.message?.toLowerCase().includes('permission');
}

function delay(ms) {
  return new Promise(r => setTimeout(r, ms));
}

# Motion Arcade — Technical Requirements Document

| 항목 | 내용 |
|------|------|
| **제품명** | Motion Arcade |
| **문서 버전** | 1.0.0 |
| **작성일** | 2026-07-11 |
| **작성자** | Hj Ahn |
| **참조 PRD** | docs/PRD.md v1.0 |

### 변경 이력
| 날짜 | 버전 | 내용 |
|---|---|---|
| 2026-07-11 | 1.0.0 | API 불일치 버그 7건 수정: Camera.init(container), PoseEngine.init(), GameLoop.start(updateFn,drawFn) 시그니처 반영. 포즈 루프와 게임 루프 분리. GestureRecognizer __w 오타 수정 |
| 2026-07-10 | 0.9.0 | 초안 작성 |

### 핵심 API 시그니처 (v1.0.0 기준 확정)

```js
// Camera
const camera = new Camera();
await camera.init(containerDivElement);  // video 엘리먼트를 container에 직접 삽입
const video = camera.videoElement;       // getter (소문자, 메서드 아님)
const ready = camera.isReady;            // getter — isReady() 아님

// PoseEngine
const engine = new PoseEngine({ frameSkip: 2 });
await engine.init();                     // load() 아님
const pose = await engine.detect(videoEl);

// GameLoop
const loop = new GameLoop();             // 인자 없음
loop.start(updateFn, drawFn);           // updateFn(dt:ms), drawFn() 분리
loop.stop();

// GestureRecognizer
const gr = new GestureRecognizer(videoWidth, videoHeight);
gr.update(pose);
const gesture = {
  bodyX:     gr.bodyX,      // getter
  bodyLean:  gr.bodyLean,   // getter
  isJumping: gr.isJumping,  // getter
  leftHand:  gr.leftHand,   // getter
  rightHand: gr.rightHand,  // getter
};
// getGesture() 메서드 없음 — getter 직접 사용

// BaseGame (각 게임 공통 시그니처)
const game = new SpacePong(canvas, width, height);  // options 객체 아님
game.init();
game.update(dt, gesture);   // dt: ms
game.draw();
game.isGameOver;             // 폴링으로 게임오버 감지
```

---

## 1. 기술 스택

### 프론트엔드

| 기술 | 버전 | 역할 |
|------|------|------|
| Vanilla JavaScript | ES2022 | 핵심 애플리케이션 로직 |
| HTML5 Canvas API | - | 게임 렌더링 (2D Context) |
| CSS3 | - | UI 레이아웃 및 애니메이션 |
| Web APIs | - | getUserMedia, RAF, localStorage, Visibility API |

### AI/ML

| 기술 | 버전 | 역할 |
|------|------|------|
| TensorFlow.js | 4.22.0 | ML 런타임 |
| tfjs-backend-webgl | 4.22.0 | GPU 가속 추론 백엔드 |
| @tensorflow-models/pose-detection | 2.1.3 | MoveNet 포즈 감지 래퍼 |
| MoveNet SINGLEPOSE_LIGHTNING | - | 실시간 단일 인물 포즈 추정 (5MB) |

### 빌드 & 배포

| 기술 | 버전 | 역할 |
|------|------|------|
| Vite | 5.4.0 | 번들러 및 개발 서버 |
| Vercel | - | 호스팅, CDN, Edge Network |
| Node.js | 18+ (LTS) | 빌드 환경 |

### 예정 (PWA)

| 기술 | 버전 | 역할 |
|------|------|------|
| Web App Manifest | - | PWA 설치 가능 메타데이터 |
| Service Worker | - | 오프라인 캐싱 (Phase 3) |

---

## 2. 시스템 아키텍처

### 레이어 구조

```
┌─────────────────────────────────────────────────────────────┐
│                      PRESENTATION LAYER                     │
│   index.html  ·  src/styles/main.css  ·  src/ui/           │
│   (게임 선택 메뉴, 카운트다운, 게임 오버 화면)               │
├─────────────────────────────────────────────────────────────┤
│                      GAME LAYER                             │
│   src/games/BaseGame.js                                     │
│   ├── SpacePong.js     ├── FruitSlicer.js                  │
│   ├── ObstacleDodge.js └── JumpChallenge.js                │
│   (게임별 로직, Canvas 렌더링, 충돌 판정)                    │
├─────────────────────────────────────────────────────────────┤
│                      CORE ENGINE LAYER                      │
│   src/core/GameLoop.js        (RAF 루프, 델타타임, FPS)     │
│   src/core/GestureRecognizer.js (제스처 해석, 캘리브레이션) │
│   src/core/PoseEngine.js      (MoveNet 추론 래퍼)           │
│   src/core/Camera.js          (getUserMedia 관리)           │
├─────────────────────────────────────────────────────────────┤
│                      ML INFERENCE LAYER                     │
│   TensorFlow.js 4.x  +  WebGL Backend                      │
│   MoveNet SINGLEPOSE_LIGHTNING (17 keypoints)               │
├─────────────────────────────────────────────────────────────┤
│                      BROWSER PLATFORM                       │
│   HTMLVideoElement  ·  HTMLCanvasElement  ·  WebGL2         │
│   localStorage  ·  getUserMedia  ·  requestAnimationFrame   │
└─────────────────────────────────────────────────────────────┘
```

### 데이터 흐름

```
[웹캠 하드웨어]
    │ MediaStream (640×480, 30fps)
    ▼
[HTMLVideoElement]  ←── Camera.js (getUserMedia 래핑)
    │ videoElement reference
    ▼
[PoseEngine.detect()]
    │ MoveNet 추론 (WebGL GPU)
    │ 출력: Pose { keypoints: KP[17] }
    ▼
[GestureRecognizer.update(pose)]
    │ 키포인트 → 제스처 변환
    │ 출력: Gesture { bodyX, bodyLean, isJumping, leftHand, rightHand }
    ▼
[GameLoop._tick()]
    │ RAF callback, delta time 계산
    ▼
[ActiveGame.update(dt, gesture)]  ←── 게임 로직 실행
    │
    ▼
[ActiveGame.draw()]
    │ Canvas 2D API 렌더링
    ▼
[HTMLCanvasElement → 화면 표시]
```

### 모듈 의존성 그래프

```
main.js
  ├── Camera.js
  ├── PoseEngine.js
  │     └── @tensorflow-models/pose-detection
  │           └── @tensorflow/tfjs-backend-webgl
  ├── GestureRecognizer.js
  │     └── PoseEngine.js (KP 상수)
  ├── GameLoop.js
  └── games/
        ├── BaseGame.js
        ├── SpacePong.js       → BaseGame.js
        ├── FruitSlicer.js     → BaseGame.js
        ├── ObstacleDodge.js   → BaseGame.js
        └── JumpChallenge.js   → BaseGame.js
```

---

## 3. 핵심 모듈 스펙

### 3.1 PoseEngine

**파일:** `src/core/PoseEngine.js`

| 항목 | 세부 사항 |
|------|-----------|
| 모델 | MoveNet SINGLEPOSE_LIGHTNING |
| 모델 크기 | ~5MB |
| 백엔드 | WebGL (GPU 가속) |
| 입력 | `HTMLVideoElement` (640×480 권장) |
| 출력 | `Pose { keypoints: Array<{x, y, score}>[17] }` 또는 `null` |
| 스무딩 | `enableSmoothing: true` (MoveNet 내장) |

**KP 인덱스 맵:**
```
KP.NOSE = 0          KP.LEFT_EYE = 1       KP.RIGHT_EYE = 2
KP.LEFT_EAR = 3      KP.RIGHT_EAR = 4
KP.LEFT_SHOULDER = 5  KP.RIGHT_SHOULDER = 6
KP.LEFT_ELBOW = 7    KP.RIGHT_ELBOW = 8
KP.LEFT_WRIST = 9    KP.RIGHT_WRIST = 10
KP.LEFT_HIP = 11     KP.RIGHT_HIP = 12
KP.LEFT_KNEE = 13    KP.RIGHT_KNEE = 14
KP.LEFT_ANKLE = 15   KP.RIGHT_ANKLE = 16
```

**frameSkip 전략:**
- `frameSkip = 1`: 매 프레임 추론 (데스크톱)
- `frameSkip = 2`: 격 프레임 추론 (중급 모바일)
- `frameSkip = 3`: 3프레임당 1회 추론 (저사양 모바일)
- 스킵 프레임에는 마지막 유효 포즈(`_lastPose`) 반환으로 렌더링 연속성 유지

**오류 처리:** `try/catch`로 GPU/추론 에러 무음 처리, 마지막 유효 포즈 반환

---

### 3.2 GestureRecognizer

**파일:** `src/core/GestureRecognizer.js`

**신뢰도 임계값:** `SCORE_THRESHOLD = 0.3` (keypoint 사용 최소 신뢰도)

**bodyX 계산 공식:**
```
midX = (leftShoulder.x + rightShoulder.x) / 2
bodyX = clamp( (midX - cal.centerX) / (videoWidth / 2), -1, 1 )
```
- 캘리브레이션 기준점 대비 수평 위치
- -1: 화면 왼쪽 끝, 0: 중앙, 1: 오른쪽 끝

**bodyLean 계산 공식:**
```
dy = rightShoulder.y - leftShoulder.y
dx = |rightShoulder.x - leftShoulder.x| (최소 1)
bodyLean = clamp( dy / dx, -1, 1 )
```
- -1: 왼쪽으로 최대 기울기, 1: 오른쪽으로 최대 기울기

**isJumping 판정 알고리즘:**
```
hipY = (leftHip.y + rightHip.y) / 2
jumpThreshold = cal.hipY * 0.8       // 기준선의 80% (20% 위)
isJumping = (hipY < jumpThreshold)
```
- 캘리브레이션 시점의 힙 Y 기준선에서 20% 이상 위로 올라가면 점프 판정

**손 속도 계산 (5프레임 이동평균):**
```javascript
// RingBuffer(5)에 정규화 좌표 { x: wrist.x/W, y: wrist.y/H } 저장
// 연속 프레임 간 좌표 차이의 평균
vx = Σ(pts[i].x - pts[i-1].x) / (n-1)
vy = Σ(pts[i].y - pts[i-1].y) / (n-1)
speed = √(vx² + vy²)
```

**캘리브레이션 데이터 구조:**
```javascript
{
  centerX: number,       // 어깨 중심 X (기본값: videoWidth / 2)
  hipY: number,          // 힙 Y 기준선 (기본값: videoHeight * 0.6)
  shoulderWidth: number  // 어깨 너비 (기본값: videoWidth * 0.2)
}
```

**Gesture 출력 타입:**
```javascript
{
  bodyX: number,       // -1 ~ 1
  bodyLean: number,    // -1 ~ 1
  isJumping: boolean,
  leftHand: {
    x: number,   // 0~1 정규화
    y: number,   // 0~1 정규화
    vx: number,  // 프레임당 이동량
    vy: number,  // 프레임당 이동량
    speed: number
  },
  rightHand: { /* 동일 구조 */ }
}
```

---

### 3.3 GameLoop

**파일:** `src/core/GameLoop.js`

**RAF 기반 루프 구조:**
```javascript
_tick(timestamp) {
  raw = timestamp - lastTime
  deltaTime = Math.min(raw, MAX_DELTA)  // 최대 100ms 클램프
  updateFn(deltaTime)
  drawFn()
  requestAnimationFrame(_tick)
}
```

**MAX_DELTA = 100ms 이유:**
- 탭 전환, 백그라운드 진입 후 복귀 시 raw delta가 수백~수천ms로 치솟아 물리 연산 폭발 방지

**FPS 측정 방식:**
- 1초 롤링 윈도우 사용
- `fpsAccum >= 1000ms` 도달 시 `fps = round(frameCount * 1000 / fpsAccum)`
- 이후 frameCount와 fpsAccum 리셋

**pause/resume 메커니즘:**
- `document.visibilitychange` 이벤트 리스닝
- `document.hidden = true` → `cancelAnimationFrame`, RAF 중단
- `document.hidden = false` → `lastTime = performance.now()` 리셋 후 RAF 재개
- 탭 숨김 시간이 deltaTime에 포함되지 않도록 clock 리셋

---

### 3.4 게임별 알고리즘

#### SpacePong

**패들 스무딩 (Lerp):**
```javascript
targetX = ((gesture.bodyX + 1) / 2) * canvasWidth
paddleX += (targetX - paddleX) * Math.min(1, deltaS * 10)
// deltaS = 0.016 (60fps) → 약 14.9% 보간 → 0.67 반응 시간
```

**충돌 판정 (AABB → 볼과 패들):**
```javascript
// 볼이 패들 영역 진입 조건
ballVY > 0                          // 아래로 이동 중
ballY + BALL_R >= paddleY           // 볼 하단이 패들 상단 이하
ballY - BALL_R <= paddleY + PADDLE_H // 볼 상단이 패들 하단 이상
ballX > paddleX - paddleW/2         // 좌측 경계 내
ballX < paddleX + paddleW/2         // 우측 경계 내
```

**반사 각도 계산:**
```javascript
offset = (ballX - paddleX) / (paddleW / 2)  // -1 ~ 1
bounceAngle = offset * (π / 3)               // 최대 ±60도
newVY = -|speed * cos(bounceAngle)|
newVX =  speed * sin(bounceAngle)
```

#### FruitSlicer

**슬라이스 감지 알고리즘:**
```javascript
// 조건 1: 손 속도가 임계값 초과
if (hand.speed > SLICE_SPEED) {         // SLICE_SPEED = 0.3
  // 조건 2: 손과 과일 거리 판정 (원형 충돌)
  dist = hypot(item.x - handX, item.y - handY)
  if (dist < item.radius) → 슬라이스 성공
}
```

**슬라이스 파편 생성:**
```javascript
sliceParts = [
  { x: item.x - r*0.3, vx: -80*dir, vy: -120 },  // 왼쪽 반
  { x: item.x + r*0.3, vx:  80*dir, vy: -100 },  // 오른쪽 반
]
// dir = hand.vx > 0 ? 1 : -1 (손 진행 방향)
// 파편에 중력 적용: vy += 800 * dt
```

**스폰 간격 감소:**
```javascript
spawnInterval = Math.max(0.6, spawnInterval - 0.01)
// 1.4초 시작 → 최소 0.6초 (80회 스폰 후 수렴)
```

#### ObstacleDodge

**파이프 갭 생성 알고리즘:**
```javascript
// 플레이어 반대편에 갭 편향 배치
playerRatio = playerX / canvasWidth
if (playerRatio < 0.5) {
  biasCenter = 0.55 + random() * 0.25  // 오른쪽 영역
} else {
  biasCenter = 0.20 + random() * 0.25  // 왼쪽 영역
}
gapCenterY = canvasHeight * (0.3 + biasCenter * 0.45)
```

**원-사각형 충돌 판정 (AABB-Circle):**
```javascript
_circleRectOverlap(cx, cy, cr, rx, ry, rw, rh) {
  nearX = clamp(cx, rx, rx + rw)
  nearY = clamp(cy, ry, ry + rh)
  return hypot(cx - nearX, cy - nearY) < cr
}
```

**속도 점진 증가:**
```javascript
pipeSpeed = canvasHeight * (0.28 + (60 - timeLeft) * 0.003)
// 시작: 0.28H/s → 60초 후: 0.46H/s (약 64% 증가)
```

#### JumpChallenge

**포물선 물리:**
```javascript
JUMP_VY = -820   // px/s (위쪽 방향)
GRAVITY = 1800   // px/s²

// 매 프레임 업데이트
playerVY += GRAVITY * dt
playerY  += playerVY * dt
if (playerY >= groundY) { playerY = groundY; playerVY = 0; onGround = true }
```

**점프 최고점 계산:**
```
최고점 높이 = JUMP_VY² / (2 × GRAVITY) = 820² / 3600 ≈ 186px
체공 시간 ≈ 2 × JUMP_VY / GRAVITY ≈ 0.91초
```

**패럴랙스 레이어 속도 배율:**
```
Layer 1 (원거리): speed × 0.12  — 가장 느리게 이동
Layer 2 (중거리): speed × 0.25
Layer 3 (근거리): speed × 0.55  — 가장 빠르게 이동
```

**AABB 충돌 (상하 인셋 6px 여유):**
```javascript
px + PLAYER_W/2 - 4 > obs.x        &&
px - PLAYER_W/2 + 4 < obs.x + obs.w &&
py > obs.y + 6                      &&
py - PLAYER_H < obs.y + obs.h - 6
```

---

## 4. 성능 요구사항

| 항목 | 데스크톱 목표 | 모바일 목표 |
|------|--------------|-------------|
| 게임 프레임레이트 | 60fps | 30fps |
| 포즈 감지 레이턴시 | < 30ms per frame | < 50ms per frame |
| 초기 로딩 시간 | < 3초 (Wi-Fi) | < 5초 (3G) |
| TF.js 모델 로드 | < 2초 | < 4초 |
| 번들 크기 (JS) | < 2MB gzip | < 2MB gzip |
| 메모리 사용량 | < 300MB | < 200MB |
| Canvas 렌더링 | < 5ms per frame | < 10ms per frame |

### 성능 최적화 전략

1. **WebGL 백엔드:** CPU 대비 최대 10배 빠른 GPU 추론
2. **frameSkip:** 저사양 기기에서 자동 감지 후 2~3 적용
3. **객체 풀링:** 파티클 배열을 필터로 재사용 (new 최소화)
4. **offscreen canvas:** 별도 렌더링 버퍼 (향후 고려)
5. **Vite pre-bundling:** TF.js 의존성 사전 번들링으로 런타임 모듈 파싱 최소화

---

## 5. API 및 인터페이스

### BaseGame 인터페이스

```typescript
interface IGame {
  // 생명주기
  init(): void;                              // 게임 상태 초기화 (재시작 포함)
  update(dt: number, gesture: Gesture): void; // 매 프레임 로직 업데이트
  draw(): void;                              // Canvas 렌더링
  destroy(): void;                           // 리소스 정리

  // 읽기 전용 상태
  readonly score: number;
  readonly isGameOver: boolean;
  readonly timeLeft: number;                 // 0 ~ 60 (초)
}

interface Gesture {
  bodyX: number;          // -1 (좌) ~ 1 (우): 수평 신체 위치
  bodyLean: number;       // -1 (좌 기울기) ~ 1 (우 기울기)
  isJumping: boolean;     // 힙이 기준선 20% 이상 상승 시 true
  leftHand: HandData;
  rightHand: HandData;
}

interface HandData {
  x: number;    // 0~1 정규화 수평 좌표
  y: number;    // 0~1 정규화 수직 좌표
  vx: number;   // 5프레임 이동평균 수평 속도
  vy: number;   // 5프레임 이동평균 수직 속도
  speed: number; // √(vx² + vy²)
}

interface CalibrationData {
  centerX: number;       // 어깨 중심 기준 X (픽셀)
  hipY: number;          // 힙 기준 Y (픽셀)
  shoulderWidth: number; // 어깨 너비 (픽셀)
}
```

### PoseEngine API

```typescript
class PoseEngine {
  constructor(options?: { frameSkip?: number })
  async init(): Promise<void>          // WebGL 백엔드 초기화 + 모델 로드
  async detect(video: HTMLVideoElement): Promise<Pose | null>
  get isReady(): boolean
  destroy(): void
}
```

### GestureRecognizer API

```typescript
class GestureRecognizer {
  constructor(videoWidth?: number, videoHeight?: number)
  update(pose: Pose | null): void      // 매 프레임 호출
  calibrate(pose: Pose): void          // 중립 포즈에서 기준값 설정
  get bodyX(): number
  get bodyLean(): number
  get isJumping(): boolean
  get leftHand(): HandData
  get rightHand(): HandData
}
```

### GameLoop API

```typescript
class GameLoop {
  start(updateFn: (dt: number) => void, drawFn: () => void): void
  stop(): void
  get fps(): number        // 1초 롤링 평균 FPS
  get deltaTime(): number  // 마지막 프레임 delta (ms)
}
```

---

## 6. 보안 요구사항

### 카메라 데이터 보호

| 요구사항 | 구현 방법 |
|----------|-----------|
| 로컬 전용 처리 | `getUserMedia` 스트림을 `HTMLVideoElement`에만 연결, 서버 전송 없음 |
| 영상 저장 없음 | `MediaRecorder` 미사용, Canvas `toDataURL()` 호출 없음 (점수 화면 제외 고려) |
| 포즈 데이터 휘발 | GestureRecognizer 상태는 메모리 내에만 유지, 저장 없음 |

### 브라우저 보안 정책

| 정책 | 세부 사항 |
|------|-----------|
| HTTPS 필수 | `getUserMedia`는 secure context 전용 — Vercel 자동 HTTPS 제공 |
| 권한 명시 요청 | `navigator.mediaDevices.getUserMedia({ video: true })` — 브라우저 기본 권한 UI |
| CSP 헤더 | `script-src 'self'`, `connect-src 'self' https://cdn.jsdelivr.net` |

### 데이터 저장 정책

| 데이터 | 저장 위치 | 보존 기간 |
|--------|-----------|-----------|
| 게임 최고점 | `localStorage` | 사용자가 삭제 시까지 |
| 포즈/영상 데이터 | 저장 없음 | N/A |
| 사용 통계 | Vercel Analytics (집계된 익명 데이터) | 서비스 운영 기간 |

---

## 7. 배포 구성

### Vercel 설정

```json
{
  "framework": "vite",
  "buildCommand": "npm run build",
  "outputDirectory": "dist",
  "installCommand": "npm install",
  "devCommand": "npm run dev"
}
```

### 환경변수

없음 — 클라이언트 전용 애플리케이션, 서버 사이드 처리 없음

### CDN 캐싱 전략

```
# Vercel CDN Cache-Control 헤더 권장 설정

# HTML 파일 (항상 최신 버전 제공)
/index.html                    → Cache-Control: public, max-age=30

# Vite 빌드 결과물 (해시 포함, 영구 캐싱)
/assets/index-[hash].js        → Cache-Control: public, max-age=31536000, immutable
/assets/index-[hash].css       → Cache-Control: public, max-age=31536000, immutable

# TensorFlow 모델 파일
/public/**                     → Cache-Control: public, max-age=86400

# PWA 매니페스트
/manifest.json                 → Cache-Control: public, max-age=86400
```

### GitHub Actions CI/CD 파이프라인

```yaml
name: CI/CD

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '18'
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Build
        run: npm run build

      - name: Check bundle size
        run: |
          SIZE=$(du -sh dist/ | cut -f1)
          echo "Bundle size: $SIZE"
          # 2MB 초과 시 경고
          find dist -name "*.js" -exec gzip -c {} \; | wc -c

  # Vercel 자동 배포 (Vercel GitHub App 연동 시 별도 액션 불필요)
  # Preview: PR 생성 시 자동
  # Production: main 브랜치 push 시 자동
```

---

## 8. 테스트 전략

### 단위 테스트 (Unit Tests)

**대상 모듈: `GestureRecognizer`**

```javascript
// 테스트 케이스 예시
describe('GestureRecognizer', () => {
  test('bodyX = 0 when shoulders at calibration center', () => { ... })
  test('bodyX = -1 when fully left, 1 when fully right', () => { ... })
  test('isJumping = true when hipY < cal.hipY * 0.8', () => { ... })
  test('hand speed = 0 with no movement', () => { ... })
  test('calibrate() updates centerX from shoulder midpoint', () => { ... })
})
```

**대상 모듈: `GameLoop`**

```javascript
describe('GameLoop', () => {
  test('deltaTime clamped to MAX_DELTA (100ms)', () => { ... })
  test('fps calculated correctly over 1 second window', () => { ... })
  test('stop() cancels RAF and removes event listeners', () => { ... })
})
```

### 통합 테스트 (Integration Tests)

```javascript
describe('Game Integration', () => {
  test('SpacePong: score increases by 5 on paddle hit', () => { ... })
  test('FruitSlicer: fruit sliced when hand.speed > 0.3 and overlap', () => { ... })
  test('ObstacleDodge: game over on pipe collision', () => { ... })
  test('JumpChallenge: playerVY set to JUMP_VY on isJumping', () => { ... })
  test('All games: isGameOver = true after 60 seconds', () => { ... })
})
```

### E2E 테스트 (Playwright)

```javascript
// 카메라 모킹 전략
test('Game loads and starts with mocked camera', async ({ page }) => {
  // 가상 비디오 스트림으로 getUserMedia 모킹
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = () =>
      Promise.resolve(createMockVideoStream())
  })

  await page.goto('/')
  await page.click('[data-testid="start-button"]')
  await expect(page.locator('[data-testid="game-canvas"]')).toBeVisible()
})
```

**E2E 커버리지:**
- 랜딩 → 카메라 권한 → 캘리브레이션 → 게임 선택 플로우
- 각 게임 시작 및 카운트다운 확인
- 게임 오버 화면 표시 및 재시작

### 성능 테스트 (Lighthouse CI)

```yaml
# lighthouserc.js
module.exports = {
  ci: {
    collect: { url: ['http://localhost:4173'] },
    assert: {
      assertions: {
        'first-contentful-paint': ['warn', { maxNumericValue: 3000 }],
        'largest-contentful-paint': ['error', { maxNumericValue: 5000 }],
        'total-blocking-time': ['warn', { maxNumericValue: 300 }],
        'cumulative-layout-shift': ['error', { maxNumericValue: 0.1 }],
      }
    }
  }
}
```

---

## 9. 모니터링

### Vercel Analytics

| 메트릭 | 수집 방법 | 알람 기준 |
|--------|-----------|-----------|
| 페이지뷰 / DAU | Vercel Analytics 자동 수집 | - |
| LCP (Largest Contentful Paint) | Real User Monitoring | > 4초 경고 |
| FID (First Input Delay) | Real User Monitoring | > 200ms 경고 |
| CLS (Cumulative Layout Shift) | Real User Monitoring | > 0.1 경고 |

### Core Web Vitals 추적

```javascript
// src/main.js 내 Web Vitals 측정 (선택적)
import { getCLS, getFID, getLCP } from 'web-vitals'

getCLS(metric => console.log('CLS:', metric.value))
getFID(metric => console.log('FID:', metric.value))
getLCP(metric => console.log('LCP:', metric.value))
// Phase 2: 서버로 전송하여 집계
```

### 오류 리포팅

| 현재 | 향후 (Phase 2) |
|------|----------------|
| `console.error()` 브라우저 콘솔 출력 | Sentry.io 연동 |
| TF.js 추론 에러 무음 처리 후 lastPose 반환 | 에러 빈도 대시보드 |
| 카메라 권한 거부 UI 표시 | 사용자 이탈 원인 분석 |

**Sentry 연동 계획 (Phase 2):**
```javascript
import * as Sentry from '@sentry/browser'
Sentry.init({
  dsn: process.env.SENTRY_DSN,
  tracesSampleRate: 0.1,
  // 카메라 관련 PII 필터링
  beforeSend: (event) => {
    // 사용자 식별 정보 제거
    delete event.user
    return event
  }
})
```

---

## 10. 향후 기술 로드맵

### Phase 2 — 소셜 & 백엔드 (2026 Q3)

| 기술 | 용도 | 고려 옵션 |
|------|------|-----------|
| Serverless Functions | 리더보드 API | Vercel Functions (Node.js) |
| 데이터베이스 | 점수 저장 | Vercel KV (Redis), Supabase |
| 인증 | 닉네임/계정 | Clerk, Firebase Auth |
| WebRTC | 2인 멀티플레이 | PeerJS, mediasoup |
| Web Share API | 소셜 공유 | 네이티브 API (추가 라이브러리 불필요) |

### Phase 3 — 렌더링 & PWA (2026 Q4)

| 기술 | 용도 | 기대 효과 |
|------|------|-----------|
| WebGL / Pixi.js | 게임 렌더링 마이그레이션 | GPU 가속 렌더링, 더 많은 파티클 |
| WASM (WebAssembly) | 포즈 후처리 가속 | JS → C++ 변환으로 2~5배 성능 향상 |
| Service Worker | 오프라인 지원 | 네트워크 없이도 게임 가능 |
| Web Push | 재방문 알림 | 사용자 재방문율 향상 |

### Phase 4 — 네이티브 앱 (2027)

| 기술 | 용도 | 고려 옵션 |
|------|------|-----------|
| React Native + Expo | iOS/Android 포팅 | Camera2 API 연동 |
| TensorFlow Lite | 모바일 최적화 추론 | NNAPI/CoreML 델리게이트 |
| MediaPipe | 포즈 감지 대체/보완 | 더 가벼운 모바일 모델 |

### 기술 부채 및 리팩토링 항목

| 항목 | 현황 | 개선 방향 |
|------|------|-----------|
| 프레임워크 없는 UI | 바닐라 JS DOM 조작 | React 또는 Svelte 전환 검토 |
| 타입 안전성 | JSDoc 기반 타입 힌트 | TypeScript 마이그레이션 |
| 테스트 커버리지 | 없음 (MVP) | Vitest 도입, 단위 테스트 작성 |
| 번들 최적화 | TF.js 전체 임포트 | 트리쉐이킹 최적화, 동적 임포트 |
| `__w` 타이포 | GestureRecognizer bodyX 계산 오류 가능성 (`this.__w` vs `this._w`) | `this._w`로 통일 수정 |

---

*문서 버전: 1.0 | 최종 업데이트: 2026-07-10*

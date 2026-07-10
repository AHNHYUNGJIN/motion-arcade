# Motion Arcade — 설계 및 개발 매뉴얼

> 최종 업데이트: 2026-07-11  
> 프로젝트: `motion-arcade` (Vercel 프로젝트 ID: `prj_W60F3Lo97isXSbnryQhnNLacthpl`)

---

## 목차

- [파트 1: 프로젝트 설계 철학](#파트-1-프로젝트-설계-철학)
- [파트 2: 개발 환경 설정](#파트-2-개발-환경-설정)
- [파트 3: 핵심 모듈 개발 가이드](#파트-3-핵심-모듈-개발-가이드)
- [파트 4: 성능 최적화 가이드](#파트-4-성능-최적화-가이드)
- [파트 5: 배포 가이드 (GitHub → Vercel)](#파트-5-배포-가이드-github--vercel)
- [파트 6: 트러블슈팅](#파트-6-트러블슈팅)
- [파트 7: 기여 가이드](#파트-7-기여-가이드)

---

## 파트 1: 프로젝트 설계 철학

### 1.1 핵심 설계 원칙

#### 반응성 (Responsiveness)
모션 인식 게임의 생명은 입력 지연이다. 플레이어가 몸을 움직인 순간과 화면의 반응 사이의 지연(latency)이 100ms를 넘으면 플레이어는 게임이 "느리다"고 느낀다. 이를 위해 다음 원칙을 적용한다.

- **frameSkip 최소화**: `PoseEngine`의 `frameSkip` 기본값을 1(매 프레임 감지)로 설정. 모바일에서만 2로 올린다.
- **포즈 캐싱**: 감지를 건너뛴 프레임에서는 `_lastPose`를 반환해 게임 업데이트가 끊기지 않게 한다.
- **패들 스무딩**: `SpacePong`에서 `paddleX += (target - paddleX) * lerp` 방식으로 갑작스런 위치 변화를 완화한다.

#### 직관성 (Intuitiveness)
처음 보는 사람도 "몸을 쓰면 되는구나"를 3초 안에 파악해야 한다.

- **캘리브레이션 UI**: 사람 실루엣 SVG를 화면에 표시해 플레이어가 어떤 자세로 서야 하는지 시각적으로 안내한다.
- **제스처 단순화**: `bodyX`(좌우), `bodyLean`(기울기), `isJumping`(점프), `leftHand`/`rightHand`(손 위치+속도) 다섯 가지 기본 제스처만 사용. 복잡한 포즈 조합은 피한다.
- **3초 카운트다운**: 게임 시작 전 카운트다운(`showCountdown(3, cb)`)으로 플레이어가 준비할 시간을 준다.

#### 피로도 관리 (Fatigue Management)
모션 게임은 신체를 사용하므로 피로가 쌓인다.

- **60초 제한 시간**: 모든 게임에 기본 60초 타이머 (`BaseGame._timeLeft = 60`)를 적용. 장기전을 막아 신체 피로를 방지한다.
- **난이도 점진적 증가**: `ObstacleDodge`는 초당 `pipeSpeed`를 점진적으로 올리고, `JumpChallenge`는 생존 시간에 비례해 속도를 높인다. 처음부터 너무 힘들면 이탈한다.
- **게임 전환 쉬는 시간**: 게임오버 오버레이에서 "메뉴로" 버튼을 눌러 자연스럽게 쉬고 다른 게임을 선택할 수 있다.

#### 모바일 퍼스트 (Mobile First)
스마트폰을 가로로 세워 거실 TV 앞에서 플레이하는 시나리오를 주요 U스케이스로 잡았다.

- `viewport-fit=cover`, `user-scalable=no` 메타 태그로 풀스크린 보장
- `env(safe-area-inset-*)` CSS 변수로 노치/홈인디케이터 영역 대응
- `position: fixed; width: 100dvw; height: 100dvh` — 스크롤 없는 단일 화면
- `playsinline` 속성 필수 (iOS Safari 자동재생 정책)
- `pagehide`/`pageshow` 이벤트로 iOS 백그라운드 전환 처리

#### 프라이버시 바이 디자인 (Privacy by Design)
카메라 데이터는 서버로 전송되지 않는다. 모든 포즈 감지는 브라우저 안에서 TF.js WebGL 백엔드로 처리된다. 서버 측 AI API 호출이 없으므로 사용자 영상이 외부로 나가지 않는다. 이 원칙은 기술 선택 단계에서부터 반영되었다(서버 측 Vision API 미사용).

---

### 1.2 기술 선택 근거

#### TensorFlow.js MoveNet vs MediaPipe

| 항목 | TF.js MoveNet Lightning | MediaPipe Pose |
|------|------------------------|----------------|
| 번들 크기 | ~6MB (WebGL 포함) | ~8MB+ |
| 추론 속도 (모바일) | ~30ms/frame | ~20ms/frame |
| 키포인트 수 | 17개 | 33개 |
| npm 패키지 | `@tensorflow-models/pose-detection` | `@mediapipe/pose` |
| Vite 호환성 | `optimizeDeps` 설정으로 해결 | WASM 빌드 복잡 |
| 커뮤니티/문서 | 풍부 | 풍부하나 WebJS 예제 적음 |

**MoveNet을 선택한 이유**: 17개 키포인트로 게임 제어에 필요한 정보는 충분하다. Vite + npm 워크플로와 자연스럽게 통합된다. `@tensorflow-models/pose-detection`이 MoveNet과 BlazePose를 모두 지원해 향후 모델 교체도 쉽다. SINGLEPOSE_LIGHTNING 모델은 정확도보다 속도를 우선해 모바일에서도 실용적인 프레임레이트를 유지한다.

#### Vanilla JS vs React

React나 Vue 같은 UI 프레임워크를 쓰지 않은 이유는 **게임 루프 성능** 때문이다.

- React는 상태 변경 시 Virtual DOM diffing → 재렌더링 사이클을 거친다. 게임 루프는 초당 60번 상태가 바뀌는데, 이 오버헤드가 누적되면 프레임 드랍으로 이어진다.
- Canvas 2D 렌더링은 명령형(imperative)이다. React의 선언형 패러다임과 맞지 않아 `useRef` + `useEffect` 조합이 복잡해진다.
- DOM UI(메뉴, HUD, 캘리브레이션)는 상태 변화가 드물고, Vanilla JS 클래스(`MainMenu`, `GameHUD`, `Calibration`)로 충분히 관리된다.

#### Vite 선택 이유

- **빠른 HMR**: 개발 중 저장 즉시 반영. TF.js 같은 큰 라이브러리도 `optimizeDeps.include`로 사전 번들링해 첫 로드를 빠르게 한다.
- **ESM 네이티브**: `import` 구문을 그대로 사용. 트랜스파일 없이 모던 브라우저에서 동작.
- **`--host` 플래그**: `npm run dev` 시 LAN 내 모든 기기에서 접근 가능. 모바일 테스트에 필수.
- **`build.target: 'esnext'`**: 최신 JS 문법(옵셔널 체이닝, nullish coalescing 등) 그대로 번들. 폴리필 없이 번들 크기 최소화.

#### Vercel 배포 선택 이유

- **HTTPS 자동 제공**: 카메라 API(`getUserMedia`)는 HTTPS에서만 동작한다. Vercel은 모든 배포에 자동으로 HTTPS를 붙인다.
- **GitHub 연동 CI/CD**: `main` 브랜치 push → 자동 프로덕션 배포. PR → 자동 프리뷰 URL.
- **글로벌 CDN**: 정적 파일을 전 세계 엣지에 캐싱. TF.js 번들(~6MB)의 로딩 속도를 개선.
- **무료 티어**: 개인 프로젝트에 충분한 대역폭과 빌드 시간 제공.

---

### 1.3 아키텍처 결정 기록 (ADR)

#### ADR-001: 포즈 모델 선택 (MoveNet Lightning)

- **날짜**: 프로젝트 초기
- **상태**: 채택됨
- **결정**: `poseDetection.SupportedModels.MoveNet` + `SINGLEPOSE_LIGHTNING`
- **이유**:
  - 단일 플레이어 게임이므로 SINGLEPOSE로 충분
  - LIGHTNING은 THUNDER보다 빠르고(~30ms vs ~50ms), 게임 제어에 필요한 정확도는 충분
  - `enableSmoothing: true`로 키포인트 지터(jitter) 감소
- **트레이드오프**: 먼 거리나 부분 가림 상황에서 감지 정확도가 낮아질 수 있음
- **코드 위치**: `src/core/PoseEngine.js`, `init()` 메서드

#### ADR-002: Canvas 2D vs WebGL

- **날짜**: 프로젝트 초기
- **상태**: 채택됨 (Canvas 2D)
- **결정**: 게임 렌더링에 `canvas.getContext('2d')` 사용
- **이유**:
  - 현재 게임(Pong, Slicer, Dodge, Jump)은 기하 도형과 파티클 중심. WebGL이 제공하는 셰이더 수준의 효과가 필요 없음
  - Canvas 2D는 `shadowBlur`로 네온 글로우를 손쉽게 구현
  - `ctx.save()`/`ctx.restore()` 패턴으로 상태 격리가 직관적
  - TF.js가 이미 WebGL 백엔드를 사용하므로 게임 캔버스도 WebGL을 쓰면 GPU 컨텍스트 충돌 가능성 존재
- **트레이드오프**: 파티클이 수백 개 이상으로 늘어나면 Canvas 2D의 성능 한계에 도달할 수 있음. 그때는 OffscreenCanvas 또는 WebGL 전환을 고려.

#### ADR-003: 상태 머신 설계

- **날짜**: 프로젝트 초기
- **상태**: 채택됨
- **결정**: `appState` 문자열 변수 + `setState()` 함수로 단순 상태 머신 구현
- **상태 흐름**:
  ```
  loading → calibration → menu → game → gameover → menu
                                              ↑         |
                                              └─────────┘ (다시 하기)
  ```
- **이유**: XState 같은 상태 머신 라이브러리 추가 없이도 5개 상태는 충분히 관리 가능. 라이브러리 의존성 최소화.
- **코드 위치**: `src/main.js`, `appState` 변수 및 `setState()`, `startCalibration()`, `showMenu()`, `startGame()`, `endGame()` 함수

#### ADR-004: 캘리브레이션 필요성

- **날짜**: 프로젝트 초기
- **상태**: 채택됨
- **결정**: 앱 시작 시 매번 캘리브레이션 단계를 거침
- **이유**:
  - 플레이어마다 카메라와의 거리, 신체 비율이 다름
  - `GestureRecognizer`의 `calibrate(pose)` 메서드는 현재 포즈에서 `centerX`, `hipY`, `shoulderWidth`를 기준값으로 저장
  - 기준값 없이 하드코딩된 임계값을 쓰면 키가 크거나 작은 사람, 카메라 위치가 다른 환경에서 오작동
- **흐름**: 로딩 완료 → 실루엣 안내 → 3초 카운트다운 → 포즈 유효성 검사(신뢰도 ≥ 0.3 키포인트 8개 이상) → 성공/실패
- **코드 위치**: `src/ui/Calibration.js`, `src/core/GestureRecognizer.js`의 `calibrate()` 메서드

---

## 파트 2: 개발 환경 설정

### 2.1 필수 요구사항

| 항목 | 최소 버전 | 권장 |
|------|----------|------|
| Node.js | 18.x | 20.x LTS |
| npm | 9.x | 10.x |
| 웹캠 | 내장 또는 외장 | 720p 이상 |
| 브라우저 | Chrome 109+ / Safari 16.4+ | Chrome 최신 |
| 네트워크 | HTTPS (프로덕션) | - |

**권장 브라우저 (2026년 기준)**:
- **Chrome / Edge (Chromium)**: WebGL 성능 최상. TF.js 공식 권장.
- **Safari 16.4+**: iOS/macOS 기본 브라우저. `playsinline` 속성 필수. PWA(`apple-mobile-web-app-capable`) 지원.
- **Firefox**: 동작하나 WebGL TF.js 성능이 Chrome 대비 낮을 수 있음.

**미지원 환경**:
- HTTP (localhost 제외) — `getUserMedia` 동작 안 함
- iOS 15 이하 — `getUserMedia` 제한
- Internet Explorer — 미지원

---

### 2.2 로컬 개발 시작

```bash
# 1. 저장소 클론
git clone https://github.com/AHNHYUNGJIN/motion-arcade.git
cd motion-arcade

# 2. 의존성 설치
npm install

# 3. 개발 서버 시작 (LAN 공유 포함)
npm run dev
# → http://localhost:3000         (PC 브라우저)
# → http://<your-ip>:3000        (같은 Wi-Fi의 모바일)
# vite.config.js에 host: true, port: 3000 설정됨

# 4. 프로덕션 빌드
npm run build
# → dist/ 폴더 생성

# 5. 빌드 결과 미리보기
npm run preview
# → http://localhost:4173
```

**주요 의존성 버전** (`package.json` 기준):
```json
{
  "dependencies": {
    "@tensorflow-models/pose-detection": "^2.1.3",
    "@tensorflow/tfjs": "^4.22.0",
    "@tensorflow/tfjs-backend-webgl": "^4.22.0"
  },
  "devDependencies": {
    "vite": "^5.4.0"
  }
}
```

---

### 2.3 모바일 테스트 방법

카메라 API는 HTTPS 또는 localhost에서만 동작한다. 모바일 테스트 시 다음 세 옵션 중 하나를 선택한다.

**옵션 A: 같은 Wi-Fi 접속 (권장 — 가장 빠름)**

`vite.config.js`에 `server: { host: true }`가 설정되어 있으므로 `npm run dev` 실행 시 자동으로 LAN IP로도 서버가 열린다.

```
터미널 출력 예시:
  ➜  Local:   http://localhost:3000/
  ➜  Network: http://192.168.0.5:3000/   ← 이 주소로 모바일 접속
```

단, 이 경우 HTTP이므로 **Chrome for Android에서는 카메라가 차단될 수 있다**. 이럴 때는 옵션 B를 사용한다.

**옵션 B: ngrok HTTPS 터널 (카메라 권한 필요 시)**

```bash
# ngrok 설치 (최초 1회)
npm install -g ngrok
# 또는 https://ngrok.com 에서 설치

# 개발 서버 실행 중 별도 터미널에서
npx ngrok http 3000
# → https://xxxx-xx-xx.ngrok-free.app  ← 이 HTTPS URL을 모바일에서 접속
```

**옵션 C: Vercel 프리뷰 배포**

PR을 열거나 브랜치에 push하면 Vercel이 자동으로 `https://motion-arcade-<hash>.vercel.app` 형태의 프리뷰 URL을 생성한다. 실제 HTTPS 환경에서 테스트할 수 있다.

---

### 2.4 프로젝트 구조 설명

```
motion-arcade/
│
├── index.html                  # 진입점 HTML (단일 페이지)
│                               # <div id="app"> + <script src="/src/main.js">
│
├── vite.config.js              # Vite 설정
│                               # host: true, port: 3000, esnext 타겟
│                               # TF.js 사전 번들링 (optimizeDeps)
│
├── package.json                # 의존성 및 스크립트 정의
│
├── public/
│   └── manifest.json           # PWA 매니페스트
│                               # 홈화면 추가, 풀스크린 모드 지원
│
├── src/
│   │
│   ├── main.js                 # 앱 진입점 & 상태 머신 오케스트레이터
│   │                           # 상태: loading → calibration → menu → game → gameover
│   │                           # DOM 레이어 생성 (video/game/pose/ui, z-index 0~3)
│   │                           # 전역 게임 루프 콜백(onFrame) 관리
│   │
│   ├── core/
│   │   ├── Camera.js           # 카메라 초기화 & 비디오 스트림 관리
│   │   │                       # getUserMedia({ video: { facingMode: 'user', 640x480 } })
│   │   │                       # CSS scaleX(-1) 미러링 처리
│   │   │
│   │   ├── PoseEngine.js       # TF.js MoveNet 포즈 감지 엔진
│   │   │                       # KP 상수(17개 키포인트 인덱스) 공개
│   │   │                       # frameSkip으로 프레임 건너뛰기 최적화
│   │   │                       # _lastPose 캐싱으로 건너뛴 프레임도 데이터 유지
│   │   │
│   │   ├── GestureRecognizer.js # 포즈 → 게임 제스처 변환
│   │   │                       # 5가지 제스처: bodyX, bodyLean, isJumping,
│   │   │                       #               leftHand, rightHand
│   │   │                       # RingBuffer(5프레임)로 손 속도 이동평균 계산
│   │   │                       # calibrate(pose)로 개인별 기준값 설정
│   │   │
│   │   └── GameLoop.js         # requestAnimationFrame 기반 게임 루프
│   │                           # deltaTime 계산 (MAX_DELTA=100ms 클램프)
│   │                           # 1초 롤링 윈도우 FPS 카운터
│   │                           # visibilitychange 처리 (백그라운드 탭 자동 정지)
│   │
│   ├── games/
│   │   ├── BaseGame.js         # 모든 게임의 기반 클래스
│   │   │                       # 공통 상태: _score, _gameOver, _timeLeft(60s), _particles
│   │   │                       # 공통 메서드: init(), update(dt,gesture), draw(), destroy()
│   │   │                       # 유틸: _drawText(), _drawNeonRect(), _drawNeonCircle()
│   │   │                       # 파티클 시스템: _spawnParticles(), _updateParticles(), _drawParticles()
│   │   │
│   │   ├── SpacePong.js        # 우주 배경 탁구 게임
│   │   │                       # 제스처: bodyX (패들 좌우 이동)
│   │   │                       # 패들 lerp 스무딩, 공 속도 증가 (50점마다 +10%)
│   │   │                       # 목숨 3개, 공 miss 시 감소
│   │   │
│   │   ├── FruitSlicer.js      # 닌자 과일 베기 게임
│   │   │                       # 제스처: leftHand.speed, rightHand.speed (슬라이싱)
│   │   │                       # 과일/폭탄 랜덤 스폰, 손 궤적 trail 렌더링
│   │   │                       # 3회 miss → 목숨 감소, 폭탄 터치 즉시 목숨 감소
│   │   │
│   │   ├── ObstacleDodge.js    # 사이버펑크 장애물 회피 게임
│   │   │                       # 제스처: bodyLean (플레이어 좌우 이동)
│   │   │                       # 파이프 장애물, gap이 플레이어 반대편에 스폰되는 AI 로직
│   │   │                       # 사이버펑크 그리드 배경, 다단계 네온 색상
│   │   │
│   │   └── JumpChallenge.js    # 달리기 점프 게임
│   │                           # 제스처: isJumping (실제 점프 감지)
│   │                           # 3단 시티 패럴랙스 배경, 달리기 레그 애니메이션
│   │                           # 생존 시간에 비례해 속도 증가
│   │
│   ├── ui/
│   │   ├── MainMenu.js         # 메인 메뉴 UI (게임 선택 카드 그리드)
│   │   │                       # GAMES 배열: id, title, desc, difficulty, icon, accentColor
│   │   │                       # 카드 클릭/키보드(Enter/Space) 이벤트 처리
│   │   │                       # 순차 등장 애니메이션 (stagger 0.07s)
│   │   │
│   │   ├── GameHUD.js          # 게임 중 HUD (점수/시간/목숨/FPS)
│   │   │                       # 3→2→1→GO! 카운트다운 오버레이
│   │   │                       # 게임오버 결과 오버레이 (점수/베스트/다시하기/메뉴)
│   │   │                       # 남은 시간 10초 이하 시 urgent 클래스 추가
│   │   │
│   │   ├── PoseOverlay.js      # 포즈 스켈레톤 시각화 (Canvas 2D)
│   │   │                       # 17개 키포인트 dot + 16개 연결선
│   │   │                       # 상체(cyan)/하체(magenta)/얼굴(white) 색상 구분
│   │   │                       # 비디오 scaleX(-1) 미러링 보정 (x축 반전)
│   │   │
│   │   └── Calibration.js      # 캘리브레이션 단계 UI
│   │                           # 단계: 안내(1.2s) → 3초 카운트다운 → 성공/실패
│   │                           # 사람 실루엣 SVG 가이드라인
│   │                           # 유효 포즈 기준: 신뢰도≥0.3 키포인트 8개 이상
│   │
│   └── styles/
│       └── main.css            # 전체 스타일시트
│                               # CSS 변수: --cyan, --magenta, --yellow, --glow-*
│                               # 폰트: Orbitron(제목), Inter(본문)
│                               # safe-area 변수: --sat, --sar, --sab, --sal
│
├── dist/                       # 빌드 출력 (git 추적 제외 권장)
│   ├── index.html
│   └── assets/
│       ├── index-*.css
│       └── index-*.js          # TF.js 포함 번들 (~6-8MB)
│
└── docs/
    └── MANUAL.md               # 이 문서
```

---

## 파트 3: 핵심 모듈 개발 가이드

### 3.1 새 게임 추가하기

#### 단계 1: `src/games/MyGame.js` 생성, BaseGame 상속

```javascript
import { BaseGame } from './BaseGame.js';

export class MyGame extends BaseGame {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {number} width
   * @param {number} height
   */
  constructor(canvas, width, height) {
    super(canvas, width, height);
    // 게임 전용 상태 초기화
    this._myState = 0;
  }

  /** 게임 리셋 (다시 하기 시 호출됨) */
  init() {
    super.init(); // _score=0, _gameOver=false, _timeLeft=60, _particles=[] 리셋
    this._myState = 0;
    // 추가 초기화 로직
  }

  /**
   * 매 프레임 업데이트
   * @param {number} dt - 델타 타임 (밀리초)
   * @param {Object} gesture - GestureRecognizer에서 온 제스처 객체
   *   gesture.bodyX       : -1(왼쪽) ~ 1(오른쪽)
   *   gesture.bodyLean    : -1(왼쪽 기울기) ~ 1(오른쪽 기울기)
   *   gesture.isJumping   : boolean
   *   gesture.leftHand    : { x, y, vx, vy, speed } — 0~1 정규화
   *   gesture.rightHand   : { x, y, vx, vy, speed } — 0~1 정규화
   */
  update(dt, gesture) {
    if (this._gameOver) return;
    super.update(dt, gesture); // 타이머 감소, 파티클 업데이트

    const s = dt / 1000; // 초 단위로 변환

    // 제스처 처리 예시
    if (gesture?.isJumping) {
      // 점프 로직
    }

    // 게임 오버 조건
    if (/* 조건 */) {
      this._gameOver = true;
    }
  }

  /** 매 프레임 렌더링 */
  draw() {
    const ctx = this.ctx;
    const { width, height } = this;

    // 배경 초기화
    ctx.fillStyle = '#0a0a1a';
    ctx.fillRect(0, 0, width, height);

    // 게임 요소 렌더링
    this._drawNeonRect(x, y, w, h, '#00ffff');   // 네온 사각형
    this._drawNeonCircle(x, y, r, '#ff00ff');    // 네온 원
    this._drawText('점수', x, y, {
      size: 24, color: '#00ffff', glow: '#00ffff', align: 'center',
    });

    // 파티클 (BaseGame 제공)
    this._drawParticles();
  }

  /** 게임 정리 (씬 전환 시 자동 호출) */
  destroy() {
    super.destroy(); // _particles 초기화
    // 추가 정리 로직 (타이머, 이벤트 리스너 등)
  }
}
```

#### 단계 2: `src/main.js`의 GAME_MAP에 등록

```javascript
// src/main.js 상단 import 추가
import { MyGame } from './games/MyGame.js';

// GAME_MAP 객체에 추가
const GAME_MAP = {
  'space-pong':      SpacePong,
  'fruit-slicer':    FruitSlicer,
  'obstacle-dodge':  ObstacleDodge,
  'jump-challenge':  JumpChallenge,
  'my-game':         MyGame,   // ← 추가
};

// bestScores 초기값도 추가
const bestScores = {
  'space-pong':     0,
  'fruit-slicer':   0,
  'obstacle-dodge': 0,
  'jump-challenge': 0,
  'my-game':        0,   // ← 추가
};
```

#### 단계 3: `src/ui/MainMenu.js`의 GAMES 배열에 카드 추가

```javascript
// src/ui/MainMenu.js 의 GAMES 배열에 추가
const GAMES = [
  // ... 기존 게임들 ...
  {
    id: 'my-game',
    title: 'My Game',
    desc: '게임 설명 한 줄\\n두 번째 줄',
    difficulty: 3,            // 1~5 별점
    icon: `
      <svg viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">
        <!-- 게임 아이콘 SVG (32x32) -->
        <circle cx="16" cy="16" r="8"/>
      </svg>`,
    accentColor: '#ff8800',   // 카드 강조 색상
  },
];
```

#### 단계 4: 테스트 체크리스트

- [ ] `init()` 호출 후 게임 상태가 완전히 리셋되는가 (다시 하기 기능)
- [ ] `_gameOver = true` 설정 시 `onGameOver(score)` 콜백이 정상 호출되는가
- [ ] `destroy()` 호출 시 메모리 누수가 없는가 (타이머, 이벤트 리스너 정리)
- [ ] 60초 타이머 만료 시 게임이 종료되는가
- [ ] 포즈 미감지(`gesture === null`) 상황에서 크래시가 없는가
- [ ] 모바일 세로/가로 방향 전환 시 캔버스가 정상 렌더링되는가
- [ ] 게임 배경 색이 `#0a0a1a` 계열인가 (디자인 통일성)

---

### 3.2 제스처 커스터마이징

#### GestureRecognizer 확장

새로운 제스처 타입은 `src/core/GestureRecognizer.js`의 `update(pose)` 메서드를 확장해 추가한다.

**예시: 박수(Clap) 제스처 추가**

```javascript
// GestureRecognizer.js 내부

constructor(videoWidth = 640, videoHeight = 480) {
  // ... 기존 코드 ...
  this._isClapping = false;
  this._clapCooldown = 0;
}

update(pose) {
  // ... 기존 코드 ...

  // ── 박수 감지 ───────────────────────────────────────
  // 두 손이 화면 중앙 근처에서 빠르게 만날 때
  if (lWrist && rWrist) {
    const dist = Math.hypot(lWrist.x - rWrist.x, lWrist.y - rWrist.y);
    const speed = (this._leftHand.speed + this._rightHand.speed) / 2;
    if (dist < this._w * 0.15 && speed > 0.05 && this._clapCooldown <= 0) {
      this._isClapping = true;
      this._clapCooldown = 0.5; // 0.5초 쿨다운
    } else {
      this._isClapping = false;
    }
  }

  // 쿨다운 감소 (update가 프레임마다 호출된다고 가정, dt 없으므로 근사)
  if (this._clapCooldown > 0) this._clapCooldown -= 0.016;
}

get isClapping() {
  return this._isClapping;
}
```

**예시: 스쿼트 감지 추가**

```javascript
// 히프가 어깨보다 많이 내려올 때 (스쿼트)
// hipY가 calibration hipY보다 낮아지면 (이미지 좌표 → 숫자 커짐) 스쿼트
get isCrouching() {
  return this._hipY > this._cal.hipY * 1.15; // 15% 아래로 내려가면
}
```

#### 임계값 튜닝 가이드

| 상수 | 위치 | 현재값 | 역할 |
|------|------|--------|------|
| `SCORE_THRESHOLD` | `GestureRecognizer.js` | `0.3` | 키포인트 신뢰도 최소값. 낮추면 노이즈 증가 |
| `VELOCITY_HISTORY` | `GestureRecognizer.js` | `5` | 손 속도 이동평균 프레임 수. 높이면 더 부드럽지만 반응 지연 |
| `SLICE_SPEED` | `FruitSlicer.js` | `0.3` | 슬라이싱 인식 최소 손 속도(0~1). 낮추면 너무 민감 |
| `frameSkip` | `PoseEngine.js` 생성자 | `1` | 모바일에서 `2`로 변경 권장 |

**조명 불량 환경에서 신뢰도 임계값 낮추기**:

```javascript
// GestureRecognizer.js 상단
const SCORE_THRESHOLD = 0.2; // 기본 0.3에서 낮춤 (어두운 환경)
```

---

### 3.3 UI 컴포넌트 추가

#### CSS 변수 사용법

`src/styles/main.css`에 정의된 CSS 변수를 사용한다:

```css
/* 색상 */
--cyan:    #00ffff;      /* 주 색상 (상체 포즈, Space Pong) */
--magenta: #ff00ff;      /* 보조 색상 (하체 포즈) */
--yellow:  #ffff00;      /* 강조 색상 */

/* 배경 */
--bg-primary:   #0a0a1a; /* 주 배경 */
--bg-secondary: #0f0f2a; /* 보조 배경 */
--bg-glass:     rgba(10, 10, 26, 0.75); /* 반투명 유리 효과 */

/* 글로우 (box-shadow에 사용) */
--glow-cyan:    0 0 6px #00ffff, 0 0 20px #00ffff, 0 0 40px rgba(0,255,255,0.5);
--glow-magenta: 0 0 6px #ff00ff, 0 0 20px #ff00ff, 0 0 40px rgba(255,0,255,0.5);

/* 폰트 */
--font-title: 'Orbitron', sans-serif; /* 아케이드 스타일 제목 */
--font-body:  'Inter', sans-serif;    /* 가독성 높은 본문 */

/* safe-area (노치/홈 인디케이터 대응) */
--sat: env(safe-area-inset-top,    0px);
--sab: env(safe-area-inset-bottom, 0px);
```

#### 네온 효과 적용

```css
/* 네온 텍스트 */
.neon-text {
  color: var(--cyan);
  text-shadow: var(--text-glow-cyan);
  font-family: var(--font-title);
}

/* 네온 버튼 */
.btn-neon {
  background: transparent;
  border: 2px solid var(--cyan);
  color: var(--cyan);
  box-shadow: var(--glow-cyan);
  font-family: var(--font-title);
  padding: 12px 24px;
}
```

#### 모바일 safe-area 대응

```css
/* 노치 영역을 피해 패딩 적용 */
.game-hud {
  padding-top: calc(12px + var(--sat));
  padding-bottom: calc(12px + var(--sab));
  padding-left: calc(16px + var(--sal));
  padding-right: calc(16px + var(--sar));
}
```

#### 새 UI 컴포넌트 작성 패턴

기존 컴포넌트(`MainMenu`, `GameHUD`, `Calibration`)를 참고해 다음 패턴을 따른다:

```javascript
export class MyComponent {
  constructor(container) {
    this._container = container;
    this._root = null;
  }

  show() {
    this._render();
    // 표시 로직
  }

  hide() {
    if (this._root) {
      this._root.style.opacity = '0';
      setTimeout(() => {
        if (this._root) this._root.style.display = 'none';
      }, 300);
    }
  }

  destroy() {
    if (this._root?.parentNode) {
      this._root.parentNode.removeChild(this._root);
    }
    this._root = null;
  }

  _render() {
    const el = document.createElement('div');
    el.className = 'my-component';
    el.innerHTML = `<!-- 컴포넌트 HTML -->`;
    this._container.appendChild(el);
    this._root = el;
  }
}
```

---

## 파트 4: 성능 최적화 가이드

### 4.1 포즈 감지 최적화

#### frameSkip 값 조정

`PoseEngine`의 `frameSkip` 옵션을 조정해 감지 빈도를 줄인다:

```javascript
// src/main.js 에서 PoseEngine 생성 시
const isMobile = /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent);
poseEngine = new PoseEngine({ frameSkip: isMobile ? 2 : 1 });
```

| frameSkip | 감지 빈도 | GPU 부하 | 반응성 |
|-----------|----------|----------|--------|
| 1 (기본)  | 매 프레임 | 높음 | 최상 |
| 2 | 2프레임마다 | 중간 | 양호 (모바일 권장) |
| 3 | 3프레임마다 | 낮음 | 지연 느껴짐 |

#### 캔버스 해상도 vs 정확도 트레이드오프

`Camera.js`에서 비디오 해상도를 조정한다:

```javascript
// 고성능 환경 (PC)
video: { width: { ideal: 640 }, height: { ideal: 480 } }

// 저성능 환경 (구형 모바일)
video: { width: { ideal: 320 }, height: { ideal: 240 } }
```

낮은 해상도에서도 MoveNet은 내부적으로 192×192 입력으로 리사이즈하므로, 640×480 이상에서는 추론 속도가 크게 개선되지 않는다. 단 카메라 미리보기 품질에는 영향을 준다.

#### requestIdleCallback 활용

포즈 감지를 유휴 시간에 처리하는 방법 (실험적):

```javascript
// 포즈 감지를 idle 시간에 큐잉
function detectPoseIdle(videoEl, callback) {
  if ('requestIdleCallback' in window) {
    requestIdleCallback(async (deadline) => {
      if (deadline.timeRemaining() > 5) { // 5ms 이상 여유 있을 때
        const pose = await poseEngine.detect(videoEl);
        callback(pose);
      }
    }, { timeout: 33 }); // 33ms(30fps) 타임아웃
  } else {
    // 폴백: requestAnimationFrame
    requestAnimationFrame(async () => {
      const pose = await poseEngine.detect(videoEl);
      callback(pose);
    });
  }
}
```

---

### 4.2 렌더링 최적화

#### ctx.save/restore 최소화

`save()`/`restore()`는 전체 그래픽 상태를 스택에 push/pop한다. 중첩이 많아지면 오버헤드가 생긴다.

**나쁜 예시**:
```javascript
// 매 파티클마다 save/restore
for (const p of this._particles) {
  ctx.save();
  ctx.globalAlpha = p.alpha;
  ctx.fillStyle = p.color;
  ctx.beginPath();
  ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}
```

**좋은 예시** (속성을 명시적으로 되돌리기):
```javascript
const savedAlpha = ctx.globalAlpha;
const savedFill  = ctx.fillStyle;
for (const p of this._particles) {
  ctx.globalAlpha = p.alpha;
  ctx.fillStyle = p.color;
  ctx.beginPath();
  ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
  ctx.fill();
}
ctx.globalAlpha = savedAlpha;
ctx.fillStyle   = savedFill;
```

#### OffscreenCanvas 적용 방법

배경 등 변하지 않는 요소를 OffscreenCanvas에 미리 그려두고 합성한다:

```javascript
// init()에서 오프스크린에 정적 배경 그리기
this._bgCanvas = new OffscreenCanvas(this.width, this.height);
const bgCtx = this._bgCanvas.getContext('2d');
// 배경 그리기 로직...

// draw()에서 매 프레임 합성 (빠름)
this.ctx.drawImage(this._bgCanvas, 0, 0);
```

현재 `SpacePong`의 별 배경이나 `ObstacleDodge`의 그리드 배경에 적용하기 좋다.

#### DPR(devicePixelRatio) 처리

`main.js`의 `syncCanvasToParent()` 함수가 DPR을 처리한다:

```javascript
function syncCanvasToParent(canvas) {
  const dpr    = Math.min(window.devicePixelRatio || 1, 2); // 최대 2배로 제한
  const parent = canvas.parentElement;
  const { width, height } = parent.getBoundingClientRect();
  const w = Math.round(width  * dpr);
  const h = Math.round(height * dpr);

  if (canvas.width !== w || canvas.height !== h) {
    canvas.width  = w;
    canvas.height = h;
    // CSS 크기는 100%로 유지되므로 픽셀이 선명하게 렌더링됨
  }
}
```

DPR을 2로 제한한 이유: 3x 디스플레이(일부 Android)에서 캔버스가 너무 커지면 GPU 메모리가 부족해진다.

---

### 4.3 메모리 관리

#### 게임 전환 시 destroy() 호출

`main.js`의 `startGame()`과 `returnToMenu()`에서 이전 게임을 정리한다. 새 게임 클래스 작성 시 `destroy()` 구현이 필수다:

```javascript
destroy() {
  super.destroy();              // _particles 초기화
  clearInterval(this._timer);   // 내부 타이머 정리
  this._items = [];             // 대형 배열 초기화
  this._myCanvas = null;        // OffscreenCanvas 참조 제거
}
```

#### TF.js tensor 메모리 해제

TF.js는 기본적으로 `estimatePoses()`가 내부적으로 tensor를 생성하고 해제한다. 직접 tensor를 사용한다면 반드시 해제해야 한다:

```javascript
// tensor 직접 사용 시 (고급)
const tensor = tf.browser.fromPixels(videoElement);
try {
  // tensor 처리
} finally {
  tensor.dispose(); // 반드시 해제
}

// 또는 tf.tidy()로 자동 관리
const result = tf.tidy(() => {
  const t = tf.browser.fromPixels(videoElement);
  return t.div(255.0); // tidy 블록 벗어나면 중간 tensor 자동 해제
});
```

`PoseEngine.destroy()` 호출 시 `_detector.dispose()`가 모델 가중치 tensor를 해제한다. 게임 전체 종료 시에는 `poseEngine.destroy()`를 호출해야 한다.

#### 파티클 풀링 패턴

현재 구현은 파티클을 배열에 push/filter로 관리한다. 파티클이 매우 많아지면 GC 압박이 생긴다. 풀링 패턴으로 개선:

```javascript
class ParticlePool {
  constructor(maxSize = 200) {
    this._pool = Array.from({ length: maxSize }, () => ({
      active: false, x: 0, y: 0, vx: 0, vy: 0,
      r: 0, color: '#fff', alpha: 0, life: 0, age: 0,
    }));
  }

  acquire() {
    return this._pool.find(p => !p.active) ?? null;
  }

  release(p) {
    p.active = false;
  }

  get active() {
    return this._pool.filter(p => p.active);
  }
}
```

---

## 파트 5: 배포 가이드 (GitHub → Vercel)

### 5.1 최초 배포 절차

```bash
# 1. GitHub 리포지토리 생성 및 최초 push
git init
git add .
git commit -m "Initial commit"
gh repo create motion-arcade --public --source=. --push

# 2. Vercel CLI 설치 (전역)
npm i -g vercel

# 3. Vercel 로그인 (브라우저 열림)
vercel login

# 4. 프로젝트 연결 (최초 1회, .vercel/project.json 생성)
#    현재 프로젝트: prj_W60F3Lo97isXSbnryQhnNLacthpl (team_y3eW0vf2I6dDntet6tcBlzgu)
vercel link --yes

# 5. 프로덕션 배포
vercel --prod --yes
```

**Vite 프로젝트 감지**: Vercel은 `vite.config.js`를 자동으로 감지해 `npm run build` → `dist/` 디렉토리를 정적 배포로 설정한다. 별도의 `vercel.json` 설정이 필요 없다.

---

### 5.2 지속적 배포 (CI/CD)

GitHub 연동 후 push만 하면 자동으로 배포된다.

```
자동 배포 흐름:

  개발자 PC                GitHub                  Vercel
  ────────                 ──────                  ──────
  git push main  ────────> main 브랜치 변경  ────> Production 배포
                                                   https://motion-arcade.vercel.app

  git push feature/xxx ──> PR 생성  ──────────────> Preview 배포
                                                   https://motion-arcade-abc123.vercel.app

                           PR 머지 → main  ────────> Production 업데이트
```

**배포 상태 확인**:
```bash
# 최근 배포 목록
vercel ls

# 현재 프로덕션 상태
vercel inspect --scope team_y3eW0vf2I6dDntet6tcBlzgu
```

---

### 5.3 환경변수 관리

현재 Motion Arcade는 서버 API 호출이 없으므로 환경변수가 필요 없다. 향후 리더보드 API나 분석 도구를 추가할 때:

```bash
# Vercel에 환경변수 추가 (프로덕션)
vercel env add MY_API_KEY production

# 로컬 개발용 .env.local 생성
vercel env pull .env.local
# → .env.local 파일 생성 (git 추적 제외 필수!)
```

`.gitignore`에 추가 확인:
```
.env
.env.local
.env.*.local
```

Vite에서 환경변수 사용 시 `VITE_` 접두사가 필요하다:
```javascript
// 클라이언트 코드에서 접근
const apiUrl = import.meta.env.VITE_API_URL;
```

---

### 5.4 롤백 방법

```bash
# 배포 목록 확인 (URL 및 타임스탬프 포함)
vercel ls

# 예시 출력:
# prj_... motion-arcade  https://motion-arcade-abc123.vercel.app  4h ago

# 특정 배포로 프로덕션 롤백
vercel rollback https://motion-arcade-abc123.vercel.app

# 또는 GitHub에서 이전 커밋으로 되돌린 후 재배포
git revert HEAD
git push main
# → Vercel이 자동으로 재빌드/재배포
```

---

### 5.5 HTTPS 설정 (카메라 접근 필수)

Vercel은 모든 배포에 자동으로 TLS 인증서를 발급한다. 별도 설정이 필요 없다.

**커스텀 도메인 연결**:
```bash
# 도메인 추가
vercel domains add motion-arcade.example.com

# DNS 설정 확인 (Vercel이 CNAME/A 레코드 안내)
vercel domains inspect motion-arcade.example.com
```

**중요**: 커스텀 도메인도 Vercel이 자동으로 HTTPS를 제공한다. 카메라 API는 이 HTTPS 환경에서 정상 동작한다.

**localhost 예외**: `localhost`는 HTTPS 없이도 `getUserMedia`가 동작한다. 개발 서버(`npm run dev`)에서 바로 카메라를 테스트할 수 있다.

---

## 파트 6: 트러블슈팅

### 6.1 카메라 관련

#### 권한 거부 (Permission Denied)

**증상**: 로딩 화면에서 "카메라 접근 권한이 필요합니다" 오류 표시

**원인 및 해결**:
1. **HTTPS 환경 확인**: HTTP로 접속 중이라면 `localhost` 또는 ngrok HTTPS URL로 접속
2. **브라우저 권한 재설정**:
   - Chrome: 주소창 자물쇠 아이콘 → 카메라 → 허용
   - Safari: 설정 → Safari → 카메라 → 허용
3. **다른 앱이 카메라 점유 중**: 화상통화, 다른 탭의 카메라 앱 종료 후 페이지 새로고침
4. **코드 레벨 확인** (`Camera.js`):
   ```javascript
   // NotAllowedError: 사용자가 거부
   // NotFoundError: 카메라 없음
   // NotReadableError: 다른 앱이 점유
   ```

#### 카메라 없음 (NotFoundError)

**증상**: "No camera found on this device" 오류

**해결**: `Camera.js`의 에러 처리에서 사용자에게 안내 메시지 표시. 별도 카메라(USB 웹캠 등) 연결 후 새로고침.

#### iOS Safari playsinline 문제

**증상**: iOS에서 카메라 영상이 전체화면으로 열리거나 자동재생 안 됨

**해결**: `index.html`과 `Camera.js`에 이미 `playsinline`, `autoplay`, `muted` 속성이 설정되어 있다. 만약 직접 video 요소를 생성하는 코드를 추가한다면 반드시 이 세 속성을 포함해야 한다:

```javascript
video.setAttribute('playsinline', '');
video.setAttribute('autoplay', '');
video.setAttribute('muted', '');
video.muted = true; // 일부 브라우저에서 속성만으로는 부족
```

---

### 6.2 포즈 감지 관련

#### 포즈 미감지

**증상**: 스켈레톤이 그려지지 않거나, 게임에서 내 움직임이 반응하지 않음

**체크리스트**:
1. **조명**: 얼굴과 몸이 밝게 보여야 함. 역광(창문을 등지는 자세)은 피할 것
2. **거리**: 카메라에서 1.5~3m 거리에서 전신이 화면에 들어와야 함
3. **배경**: 단순한 단색 배경이 감지율을 높임. 복잡한 패턴 배경은 혼란 유발
4. **카메라 각도**: 카메라가 몸 전체를 정면으로 바라보는 위치에 있어야 함
5. **신뢰도 임계값**: `SCORE_THRESHOLD = 0.3` → `0.2`로 낮춰 실험

**디버깅**:
```javascript
// PoseOverlay가 제대로 그려지는지 확인
// 브라우저 콘솔에서:
console.log(latestPose?.keypoints?.map(kp => kp.score));
// 점수가 0에 가깝다면 조명/위치 문제
```

#### 지연 심함 (High Latency)

**증상**: 몸을 움직여도 화면 반응이 느림

**해결**:
1. **frameSkip 증가**: `new PoseEngine({ frameSkip: 2 })` 또는 `3`
2. **배경 탭 닫기**: 다른 WebGL/비디오 탭이 GPU를 공유하면 지연 발생
3. **해상도 낮추기**: `Camera.js`에서 `width: { ideal: 320 }` 시도
4. **다른 백엔드 시도**: `tf.setBackend('cpu')` (느리지만 GPU 없는 환경 폴백)

#### 모바일 멈춤 (Memory Pressure)

**증상**: 모바일에서 게임 중 갑자기 멈추거나 페이지가 리로드됨

**원인**: iOS/Android의 메모리 압박으로 탭이 강제 종료

**해결**:
1. **해상도 낮추기**: 카메라 해상도를 320×240으로 낮춤
2. **frameSkip 높이기**: `frameSkip: 3` 또는 `4`
3. **파티클 수 줄이기**: `BaseGame._spawnParticles()` 호출 시 `count` 파라미터 감소
4. **다른 탭 닫기**: 브라우저 메모리 확보

---

### 6.3 빌드/배포 관련

#### Vite CJS 경고

**증상**: 빌드 시 `"vite" resolved to a non-module` 또는 CJS 관련 경고

**해결**: 무시해도 됨. TF.js 패키지 일부가 CJS 형식이어서 발생하는 경고로, 런타임 동작에 영향 없음. Vite의 `optimizeDeps.include`로 사전 번들링 처리가 되어 있다.

#### 번들 크기 경고

**증상**: `chunk size limit` 경고 (~6-8MB)

**해결**: TF.js 특성상 정상이다. TF.js 모델 가중치가 포함되어 큰 번들이 생성된다. 경고를 끄려면 `vite.config.js`에 추가:

```javascript
build: {
  target: 'esnext',
  outDir: 'dist',
  chunkSizeWarningLimit: 10000, // 10MB로 경고 임계값 올리기
}
```

#### Vercel 빌드 실패

**증상**: Vercel 대시보드에서 배포 빌드 실패

**체크리스트**:
1. **Node.js 버전**: Vercel 프로젝트 설정에서 Node.js 18+ 선택
2. **npm ci**: Vercel은 `npm ci`로 설치하므로 `package-lock.json`이 존재해야 함
3. **빌드 커맨드 확인**: `npm run build` → `dist/` 출력 확인
4. **로컬에서 빌드 테스트**: `npm run build && npm run preview`

#### Vercel scope 에러

**증상**: `vercel --prod` 실행 시 "Scope not found" 에러

**해결**:
```bash
# --scope 플래그에 orgId 명시
vercel --prod --scope team_y3eW0vf2I6dDntet6tcBlzgu

# 또는 project.json 확인
cat .vercel/project.json
# {"projectId":"prj_W60F3Lo97isXSbnryQhnNLacthpl","orgId":"team_y3eW0vf2I6dDntet6tcBlzgu",...}
```

---

## 파트 7: 기여 가이드

### 7.1 브랜치 전략

```
main
 └── develop
      ├── feature/game-snake       # 새 게임: 스네이크
      ├── feature/game-balloon     # 새 게임: 풍선 피하기
      ├── fix/ios-camera-timeout   # 버그픽스: iOS 카메라 타임아웃
      └── perf/offscreen-canvas    # 성능: OffscreenCanvas 적용
```

| 브랜치 | 용도 | 병합 대상 |
|--------|------|----------|
| `main` | 프로덕션. Vercel 자동 배포 | - |
| `develop` | 개발 통합. 기능 완료 후 main으로 PR | main |
| `feature/game-xxx` | 새 게임 개발 | develop |
| `feature/xxx` | 새 기능 개발 | develop |
| `fix/xxx` | 버그 수정 | develop (핫픽스는 main 직접) |
| `perf/xxx` | 성능 개선 | develop |
| `docs/xxx` | 문서 업데이트 | main 직접 |

---

### 7.2 커밋 컨벤션

[Conventional Commits](https://www.conventionalcommits.org/) 형식을 따른다:

```
<type>(<scope>): <description>

[optional body]

[optional footer]
```

**타입 목록**:

| 타입 | 설명 | 예시 |
|------|------|------|
| `feat` | 새 기능 추가 | `feat(game): add Snake game` |
| `fix` | 버그 수정 | `fix(camera): handle NotReadableError on iOS` |
| `perf` | 성능 개선 | `perf(pose): add frameSkip for mobile` |
| `style` | 코드 스타일 (기능 변경 없음) | `style(main): format with prettier` |
| `docs` | 문서 업데이트 | `docs: update MANUAL.md deployment guide` |
| `refactor` | 리팩토링 | `refactor(BaseGame): extract particle pool` |
| `test` | 테스트 추가/수정 | `test(gesture): add clap detection tests` |
| `chore` | 빌드/설정 변경 | `chore: upgrade vite to 5.5.0` |

**예시**:
```bash
git commit -m "feat(game): add BalloonPop game with hand proximity detection"
git commit -m "fix(ios): add pagehide handler for Safari background tab"
git commit -m "perf(render): use OffscreenCanvas for static backgrounds"
```

---

### 7.3 PR 체크리스트

PR을 열기 전 다음 항목을 확인한다:

**기능 검증**
- [ ] 새 게임/기능이 PC Chrome에서 정상 동작하는가
- [ ] 모바일 Chrome (Android)에서 카메라 + 포즈 감지가 동작하는가
- [ ] 모바일 Safari (iOS 16+)에서 동작하는가
- [ ] 포즈 미감지 상태(`gesture === null`)에서 크래시가 없는가
- [ ] 카메라 없는 환경에서 적절한 에러 메시지가 표시되는가

**성능**
- [ ] Lighthouse 성능 점수 80점 이상인가 (`npm run build && npm run preview` 후 측정)
- [ ] `destroy()` 호출 시 메모리 누수가 없는가
- [ ] 60초 게임 플레이 중 FPS가 20fps 이하로 내려가지 않는가

**코드 품질**
- [ ] `BaseGame`을 올바르게 상속하고 `init()`, `update()`, `draw()`, `destroy()`를 구현했는가
- [ ] 새 게임은 `GAME_MAP`과 `GAMES` 배열 모두에 등록했는가
- [ ] CSS 변수(`--cyan`, `--magenta` 등)를 사용해 디자인 일관성을 유지했는가
- [ ] `console.error` 사용 시 `[모듈명]` 접두사를 붙였는가

**접근성**
- [ ] 새 DOM 요소에 적절한 `role`, `aria-label`이 있는가
- [ ] 키보드(Enter, Space)로 게임을 선택할 수 있는가

**배포**
- [ ] `npm run build`가 경고 없이 성공하는가 (TF.js 번들 크기 경고 제외)
- [ ] PR에 Vercel 프리뷰 URL이 포함되어 있는가

---

*이 매뉴얼은 Motion Arcade 코드베이스와 함께 최신 상태를 유지해야 합니다. 아키텍처 변경 시 해당 ADR 섹션을 업데이트하세요.*

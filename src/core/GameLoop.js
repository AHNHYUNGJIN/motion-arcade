const MAX_DELTA = 100; // ms – clamp to prevent physics explosion after tab switch

export class GameLoop {
  constructor() {
    this._rafId = null;
    this._running = false;

    this._lastTime = 0;
    this._deltaTime = 0;

    // FPS counter state
    this._fps = 0;
    this._frameCount = 0;
    this._fpsAccum = 0; // accumulated ms in the current 1-second window

    this._updateFn = null;
    this._drawFn = null;

    this._onVisibilityChange = this._handleVisibilityChange.bind(this);
  }

  /**
   * Start the game loop.
   * @param {(deltaTime: number) => void} updateFn
   * @param {() => void} drawFn
   */
  start(updateFn, drawFn) {
    if (this._running) return;

    this._updateFn = updateFn;
    this._drawFn = drawFn;
    this._running = true;
    this._lastTime = performance.now();

    document.addEventListener('visibilitychange', this._onVisibilityChange);

    this._rafId = requestAnimationFrame((t) => this._tick(t));
  }

  stop() {
    this._running = false;
    if (this._rafId !== null) {
      cancelAnimationFrame(this._rafId);
      this._rafId = null;
    }
    document.removeEventListener('visibilitychange', this._onVisibilityChange);
  }

  /** Current smoothed FPS (updated every second). */
  get fps() {
    return this._fps;
  }

  /** Delta time in milliseconds for the most recently completed frame. */
  get deltaTime() {
    return this._deltaTime;
  }

  // ── Private ────────────────────────────────────────────────────────────────

  _tick(timestamp) {
    if (!this._running) return;

    const raw = timestamp - this._lastTime;
    this._lastTime = timestamp;

    // Clamp to prevent runaway updates after the page was hidden.
    this._deltaTime = Math.min(raw, MAX_DELTA);

    // FPS counter (rolling 1-second window).
    this._frameCount++;
    this._fpsAccum += raw;
    if (this._fpsAccum >= 1000) {
      this._fps = Math.round((this._frameCount * 1000) / this._fpsAccum);
      this._frameCount = 0;
      this._fpsAccum = 0;
    }

    this._updateFn(this._deltaTime);
    this._drawFn();

    this._rafId = requestAnimationFrame((t) => this._tick(t));
  }

  _handleVisibilityChange() {
    if (document.hidden) {
      // Pause: cancel the pending frame.
      if (this._rafId !== null) {
        cancelAnimationFrame(this._rafId);
        this._rafId = null;
      }
    } else {
      // Resume: reset the clock so delta doesn't include the hidden time.
      this._lastTime = performance.now();
      this._frameCount = 0;
      this._fpsAccum = 0;
      this._rafId = requestAnimationFrame((t) => this._tick(t));
    }
  }
}

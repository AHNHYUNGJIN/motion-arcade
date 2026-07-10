import { BaseGame } from './BaseGame.js';

const PLAYER_R = 22;
const PLAYER_X_MIN = 0.2;
const PLAYER_X_MAX = 0.8;
const PLAYER_Y_RATIO = 0.8;
const PIPE_W = 52;
const GAP_H_RATIO = 0.32;
const NEON_COLORS = ['#ff3388', '#33ffcc', '#ffcc00', '#aa44ff', '#00aaff'];
const GRID_CELL = 44;

export class ObstacleDodge extends BaseGame {
  constructor(canvas, width, height) {
    super(canvas, width, height);
    this._playerX = width / 2;
    this._pipes = [];
    this._pipeTimer = 0;
    this._pipeInterval = 2.0;
    this._pipeSpeed = height * 0.28;
    this._passed = 0;
    this._flashAlpha = 0;
    this._gridOffset = 0;
    this._colorIdx = 0;
  }

  init() {
    this._playerX = this.width / 2;
    this._pipes = [];
    this._pipeTimer = 0;
    this._pipeInterval = 2.0;
    this._pipeSpeed = this.height * 0.28;
    this._passed = 0;
    this._score = 0;
    this._flashAlpha = 0;
    this._gridOffset = 0;
    this._colorIdx = 0;
    this._gameOver = false;
    this._timeLeft = 60;
    this._particles = [];
  }

  _spawnPipe(playerX) {
    const gapH = this.height * GAP_H_RATIO;
    // bias gap towards opposite side of player
    const playerRatio = playerX / this.width;
    const biasCenter = playerRatio < 0.5
      ? 0.55 + Math.random() * 0.25
      : 0.20 + Math.random() * 0.25;
    const gapCenterY = this.height * (0.3 + biasCenter * 0.45);
    const color = NEON_COLORS[this._colorIdx % NEON_COLORS.length];
    this._colorIdx++;
    this._pipes.push({
      y: -this.height * 0.05,
      gapCenter: gapCenterY,
      gapH,
      color,
      scored: false,
    });
  }

  update(dt, gesture) {
    if (this._gameOver) return;
    super.update(dt, gesture);
    const s = dt / 1000;

    this._gridOffset = (this._gridOffset + this._pipeSpeed * 0.15 * s) % GRID_CELL;

    // player lean
    if (gesture) {
      const lean = Math.max(-1, Math.min(1, gesture.bodyLean));
      const targetX = this.width * (0.5 + lean * 0.35);
      this._playerX += (targetX - this._playerX) * Math.min(1, s * 8);
    }
    this._playerX = Math.max(
      this.width * PLAYER_X_MIN,
      Math.min(this.width * PLAYER_X_MAX, this._playerX)
    );

    // spawn pipes
    this._pipeTimer -= s;
    if (this._pipeTimer <= 0) {
      this._spawnPipe(this._playerX);
      this._pipeInterval = Math.max(0.9, this._pipeInterval - 0.02);
      this._pipeTimer = this._pipeInterval;
    }

    // move pipes
    const playerY = this.height * PLAYER_Y_RATIO;
    for (const pipe of this._pipes) {
      pipe.y += this._pipeSpeed * s;

      // score
      if (!pipe.scored && pipe.y > playerY) {
        pipe.scored = true;
        this._passed++;
        this._score = this._passed * 10;
        this._spawnParticles(this._playerX, playerY - 30, '#33ffcc', 8);
      }

      // collision: player circle vs pipe rects
      const topH = pipe.gapCenter - pipe.gapH / 2;
      const botY = pipe.gapCenter + pipe.gapH / 2;
      const botH = this.height - botY;

      const pipeLeft = this.width / 2 - PIPE_W / 2;
      const pipeRight = this.width / 2 + PIPE_W / 2;

      // simple AABB-circle check for both pipe segments
      const hitTop = this._circleRectOverlap(this._playerX, playerY, PLAYER_R,
        pipeLeft, pipe.y, PIPE_W, topH);
      const hitBot = this._circleRectOverlap(this._playerX, playerY, PLAYER_R,
        pipeLeft, pipe.y + botY, PIPE_W, botH);

      if (hitTop || hitBot) {
        this._flashAlpha = 0.6;
        this._spawnParticles(this._playerX, playerY, '#ff3388', 16);
        this._gameOver = true;
        return;
      }
    }

    // increase speed gradually
    this._pipeSpeed = this.height * (0.28 + (60 - this._timeLeft) * 0.003);

    // remove off-screen pipes
    this._pipes = this._pipes.filter(p => p.y < this.height * 1.5);

    if (this._flashAlpha > 0) this._flashAlpha -= s * 3;
  }

  _circleRectOverlap(cx, cy, cr, rx, ry, rw, rh) {
    const nearX = Math.max(rx, Math.min(cx, rx + rw));
    const nearY = Math.max(ry, Math.min(cy, ry + rh));
    return Math.hypot(cx - nearX, cy - nearY) < cr;
  }

  draw() {
    const ctx = this.ctx;
    ctx.fillStyle = '#050510';
    ctx.fillRect(0, 0, this.width, this.height);

    // cyberpunk grid
    ctx.save();
    ctx.strokeStyle = '#1a1a44';
    ctx.lineWidth = 1;
    for (let x = 0; x < this.width; x += GRID_CELL) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, this.height);
      ctx.stroke();
    }
    for (let yOff = -GRID_CELL + this._gridOffset; yOff < this.height; yOff += GRID_CELL) {
      ctx.beginPath();
      ctx.moveTo(0, yOff);
      ctx.lineTo(this.width, yOff);
      ctx.stroke();
    }
    ctx.restore();

    // pipes
    for (const pipe of this._pipes) {
      const topH = pipe.gapCenter - pipe.gapH / 2;
      const botY = pipe.gapCenter + pipe.gapH / 2;
      const pipeLeft = this.width / 2 - PIPE_W / 2;
      this._drawNeonRect(pipeLeft, pipe.y, PIPE_W, topH, pipe.color, 18, 4);
      this._drawNeonRect(pipeLeft, pipe.y + botY, PIPE_W, this.height, pipe.color, 18, 4);

      // gap hint line
      ctx.save();
      ctx.strokeStyle = pipe.color + '44';
      ctx.lineWidth = 1;
      ctx.setLineDash([6, 8]);
      ctx.beginPath();
      ctx.moveTo(pipeLeft, pipe.y + pipe.gapCenter);
      ctx.lineTo(pipeLeft + PIPE_W, pipe.y + pipe.gapCenter);
      ctx.stroke();
      ctx.restore();
    }

    // flash overlay
    if (this._flashAlpha > 0) {
      ctx.save();
      ctx.globalAlpha = this._flashAlpha;
      ctx.fillStyle = '#ff0033';
      ctx.fillRect(0, 0, this.width, this.height);
      ctx.restore();
    }

    // player silhouette
    this._drawPlayer();

    this._drawParticles();
    this._drawHUD();
  }

  _drawPlayer() {
    const ctx = this.ctx;
    const x = this._playerX;
    const y = this.height * PLAYER_Y_RATIO;
    const color = '#33ffcc';

    ctx.save();
    ctx.shadowColor = color;
    ctx.shadowBlur = 18;
    ctx.fillStyle = color;

    // head
    ctx.beginPath();
    ctx.arc(x, y - PLAYER_R * 1.5, PLAYER_R * 0.55, 0, Math.PI * 2);
    ctx.fill();

    // body
    ctx.fillRect(x - PLAYER_R * 0.38, y - PLAYER_R * 0.95, PLAYER_R * 0.76, PLAYER_R * 1.1);

    ctx.restore();

    // hitbox (debug-style ring, subtle)
    ctx.save();
    ctx.strokeStyle = '#33ffcc44';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(x, y, PLAYER_R, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  _drawHUD() {
    this._drawText(`${this._score}`, this.width / 2, 18, {
      size: 28, align: 'center', color: '#ffcc00', glow: '#ffcc00',
    });
    this._drawText(`${Math.ceil(this.timeLeft)}s`, this.width - 12, 18, {
      size: 18, align: 'right', color: '#ffffff88',
    });
    this._drawText(`x${this._passed}`, 12, 18, {
      size: 18, color: '#33ffcc88',
    });
  }
}

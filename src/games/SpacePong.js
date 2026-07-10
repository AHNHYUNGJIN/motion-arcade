import { BaseGame } from './BaseGame.js';

const PADDLE_W_RATIO = 0.25;
const PADDLE_H = 18;
const PADDLE_Y_RATIO = 0.82;
const BALL_R = 10;
const LIVES_MAX = 3;
const STAR_COUNT = 80;

export class SpacePong extends BaseGame {
  constructor(canvas, width, height) {
    super(canvas, width, height);
    this._lives = LIVES_MAX;
    this._paddleX = width / 2;
    this._ballX = width / 2;
    this._ballY = height * 0.3;
    this._ballVX = 0;
    this._ballVY = 0;
    this._baseSpeed = height * 0.55;
    this._speedMult = 1;
    this._hits = 0;
    this._stars = [];
    this._flashAlpha = 0;
  }

  init() {
    this._paddleX = this.width / 2;
    this._lives = LIVES_MAX;
    this._score = 0;
    this._hits = 0;
    this._speedMult = 1;
    this._flashAlpha = 0;
    this._gameOver = false;
    this._timeLeft = 60;
    this._particles = [];

    const angle = (Math.random() * 0.6 + 0.2) * Math.PI;
    const sp = this._baseSpeed;
    this._ballX = this.width / 2;
    this._ballY = this.height * 0.3;
    this._ballVX = Math.cos(angle) * sp * (Math.random() < 0.5 ? 1 : -1);
    this._ballVY = -Math.abs(Math.sin(angle) * sp);

    this._stars = Array.from({ length: STAR_COUNT }, () => ({
      x: Math.random() * this.width,
      y: Math.random() * this.height,
      r: Math.random() * 1.5 + 0.3,
      alpha: 0.3 + Math.random() * 0.7,
    }));
  }

  update(dt, gesture) {
    if (this._gameOver) return;
    super.update(dt, gesture);

    const s = dt / 1000;

    // paddle smoothing
    if (gesture) {
      const targetX = ((gesture.bodyX + 1) / 2) * this.width;
      this._paddleX += (targetX - this._paddleX) * Math.min(1, s * 10);
    }
    const pw = this.width * PADDLE_W_RATIO;
    this._paddleX = Math.max(pw / 2, Math.min(this.width - pw / 2, this._paddleX));

    // ball move
    const spd = this._baseSpeed * this._speedMult;
    const vLen = Math.hypot(this._ballVX, this._ballVY) || 1;
    this._ballVX = (this._ballVX / vLen) * spd;
    this._ballVY = (this._ballVY / vLen) * spd;

    this._ballX += this._ballVX * s;
    this._ballY += this._ballVY * s;

    // wall bounce left/right
    if (this._ballX - BALL_R < 0) {
      this._ballX = BALL_R;
      this._ballVX = Math.abs(this._ballVX);
    }
    if (this._ballX + BALL_R > this.width) {
      this._ballX = this.width - BALL_R;
      this._ballVX = -Math.abs(this._ballVX);
    }
    // top bounce
    if (this._ballY - BALL_R < 0) {
      this._ballY = BALL_R;
      this._ballVY = Math.abs(this._ballVY);
    }

    // paddle hit
    const py = this.height * PADDLE_Y_RATIO;
    if (
      this._ballVY > 0 &&
      this._ballY + BALL_R >= py &&
      this._ballY - BALL_R <= py + PADDLE_H &&
      this._ballX > this._paddleX - pw / 2 &&
      this._ballX < this._paddleX + pw / 2
    ) {
      this._ballY = py - BALL_R;
      const offset = (this._ballX - this._paddleX) / (pw / 2);
      const bounceAngle = offset * (Math.PI / 3);
      this._ballVY = -Math.abs(spd * Math.cos(bounceAngle));
      this._ballVX = spd * Math.sin(bounceAngle);
      this._hits++;
      this._score += 5;
      if (this._score % 50 === 0) this._speedMult += 0.1;
      this._spawnParticles(this._ballX, py, '#ffff00', 8);
    }

    // miss
    if (this._ballY - BALL_R > this.height) {
      this._lives--;
      this._flashAlpha = 0.5;
      this._spawnParticles(this._ballX, this.height - 20, '#ff4444', 15);
      if (this._lives <= 0) {
        this._gameOver = true;
        return;
      }
      const sp = this._baseSpeed * this._speedMult;
      const ang = (Math.random() * 0.6 + 0.2) * Math.PI;
      this._ballX = this.width / 2;
      this._ballY = this.height * 0.3;
      this._ballVX = Math.cos(ang) * sp * (Math.random() < 0.5 ? 1 : -1);
      this._ballVY = -Math.abs(Math.sin(ang) * sp);
    }

    if (this._flashAlpha > 0) this._flashAlpha -= s * 2;
  }

  draw() {
    const ctx = this.ctx;
    // background
    ctx.fillStyle = '#050510';
    ctx.fillRect(0, 0, this.width, this.height);

    // stars
    for (const st of this._stars) {
      ctx.save();
      ctx.globalAlpha = st.alpha;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(st.x, st.y, st.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // flash overlay
    if (this._flashAlpha > 0) {
      ctx.save();
      ctx.globalAlpha = this._flashAlpha;
      ctx.fillStyle = '#ff0000';
      ctx.fillRect(0, 0, this.width, this.height);
      ctx.restore();
    }

    // paddle
    const py = this.height * PADDLE_Y_RATIO;
    const pw = this.width * PADDLE_W_RATIO;
    ctx.save();
    ctx.shadowColor = '#00ffff';
    ctx.shadowBlur = 20;
    ctx.strokeStyle = '#00ffff';
    ctx.lineWidth = 3;
    ctx.fillStyle = '#00ffff22';
    ctx.beginPath();
    ctx.roundRect(this._paddleX - pw / 2, py, pw, PADDLE_H, 9);
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    // ball
    this._drawNeonCircle(this._ballX, this._ballY, BALL_R, '#ffff00', 20);

    this._drawParticles();

    // HUD
    this._drawHUD();
  }

  _drawHUD() {
    const ctx = this.ctx;
    // score
    this._drawText(`${this._score}`, this.width / 2, 18, {
      size: 28, align: 'center', color: '#00ffff', glow: '#00ffff',
    });
    // timer
    this._drawText(`${Math.ceil(this.timeLeft)}s`, this.width - 12, 18, {
      size: 18, align: 'right', color: '#ffffff88',
    });
    // lives
    for (let i = 0; i < LIVES_MAX; i++) {
      const col = i < this._lives ? '#ff4488' : '#333355';
      ctx.save();
      ctx.shadowColor = col;
      ctx.shadowBlur = i < this._lives ? 10 : 0;
      ctx.fillStyle = col;
      ctx.font = '20px monospace';
      ctx.fillText('♥', 12 + i * 26, 14);
      ctx.restore();
    }
  }
}

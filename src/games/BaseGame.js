export class BaseGame {
  constructor(canvas, width, height) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.width = width;
    this.height = height;
    this._score = 0;
    this._gameOver = false;
    this._timeLeft = 60;
    this._particles = [];
  }

  init() {}

  update(dt, gesture) {
    if (this._gameOver) return;
    this._timeLeft -= dt / 1000;
    if (this._timeLeft <= 0) {
      this._timeLeft = 0;
      this._gameOver = true;
    }
    this._updateParticles(dt);
  }

  draw() {}

  destroy() {
    this._particles = [];
  }

  get score() { return this._score; }
  get isGameOver() { return this._gameOver; }
  get timeLeft() { return Math.max(0, this._timeLeft); }

  _drawText(text, x, y, opts = {}) {
    const ctx = this.ctx;
    ctx.save();
    ctx.font = `${opts.weight || 'bold'} ${opts.size || 20}px ${opts.font || 'monospace'}`;
    ctx.fillStyle = opts.color || '#ffffff';
    ctx.textAlign = opts.align || 'left';
    ctx.textBaseline = opts.baseline || 'top';
    if (opts.glow) {
      ctx.shadowColor = opts.glow;
      ctx.shadowBlur = 12;
    }
    ctx.fillText(text, x, y);
    ctx.restore();
  }

  _drawNeonRect(x, y, w, h, color, glowSize = 15, radius = 6) {
    const ctx = this.ctx;
    ctx.save();
    ctx.shadowColor = color;
    ctx.shadowBlur = glowSize;
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, radius);
    ctx.stroke();
    ctx.shadowBlur = glowSize * 0.4;
    ctx.fillStyle = color + '22';
    ctx.fill();
    ctx.restore();
  }

  _drawNeonCircle(x, y, r, color, glowSize = 15) {
    const ctx = this.ctx;
    ctx.save();
    ctx.shadowColor = color;
    ctx.shadowBlur = glowSize;
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.shadowBlur = glowSize * 0.4;
    ctx.fillStyle = color + '33';
    ctx.fill();
    ctx.restore();
  }

  _spawnParticles(x, y, color, count = 10) {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 60 + Math.random() * 160;
      this._particles.push({
        x, y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        r: 2 + Math.random() * 4,
        color,
        alpha: 1,
        life: 0.5 + Math.random() * 0.5,
        age: 0,
      });
    }
  }

  _updateParticles(dt) {
    const s = dt / 1000;
    this._particles = this._particles.filter(p => {
      p.age += s;
      p.x += p.vx * s;
      p.y += p.vy * s;
      p.vy += 400 * s; // gravity
      p.alpha = 1 - p.age / p.life;
      return p.age < p.life;
    });
  }

  _drawParticles() {
    const ctx = this.ctx;
    for (const p of this._particles) {
      ctx.save();
      ctx.globalAlpha = Math.max(0, p.alpha);
      ctx.fillStyle = p.color;
      ctx.shadowColor = p.color;
      ctx.shadowBlur = 8;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }
}

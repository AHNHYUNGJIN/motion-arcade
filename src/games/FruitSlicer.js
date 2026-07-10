import { BaseGame } from './BaseGame.js';

const TRAIL_LEN = 10;
const SLICE_SPEED = 0.06;
const FRUIT_COLORS = ['#ff3333', '#33ff66', '#3388ff', '#ffdd00', '#ff88ff'];
const FRUIT_LABELS = ['🍎', '🍉', '🍇', '🍋', '🍓'];
const MISS_LIMIT = 3;
const LIVES_MAX = 3;

function rectsOverlap(ax, ay, ar, bx, by) {
  return Math.hypot(ax - bx, ay - by) < ar;
}

export class FruitSlicer extends BaseGame {
  constructor(canvas, width, height) {
    super(canvas, width, height);
    this._items = [];
    this._slices = [];
    this._trailL = [];
    this._trailR = [];
    this._lives    = LIVES_MAX;
    this._livesMax = LIVES_MAX;
    this._missed = 0;
    this._spawnTimer = 0;
    this._spawnInterval = 1.4;
    this._flashAlpha = 0;
    this._bgLines = [];
  }

  init() {
    this._items = [];
    this._slices = [];
    this._trailL = [];
    this._trailR = [];
    this._lives = LIVES_MAX;
    this._missed = 0;
    this._score = 0;
    this._spawnTimer = 0;
    this._spawnInterval = 1.4;
    this._flashAlpha = 0;
    this._gameOver = false;
    this._timeLeft = 60;
    this._particles = [];

    const lc = Math.floor(this.height / 28);
    this._bgLines = Array.from({ length: lc }, (_, i) => ({
      y: i * 28 + 14,
      alpha: 0.07 + Math.random() * 0.08,
    }));
  }

  _spawnItem() {
    const isBomb = Math.random() < 0.15;
    const x = this.width * (0.15 + Math.random() * 0.7);
    const vx = (Math.random() - 0.5) * this.width * 0.8;
    const vy = -(this.height * (0.9 + Math.random() * 0.5));
    const ci = Math.floor(Math.random() * FRUIT_COLORS.length);
    this._items.push({
      x, y: this.height + 30,
      vx, vy,
      r: 28 + Math.random() * 14,
      color: isBomb ? '#111111' : FRUIT_COLORS[ci],
      label: isBomb ? null : FRUIT_LABELS[ci],
      isBomb,
      sliced: false,
      sliceDir: 0,
      sliceAge: 0,
      sliceParts: null,
    });
  }

  update(dt, gesture) {
    if (this._gameOver) return;
    super.update(dt, gesture);
    const s = dt / 1000;

    // spawn
    this._spawnTimer -= s;
    if (this._spawnTimer <= 0) {
      this._spawnItem();
      this._spawnInterval = Math.max(0.6, this._spawnInterval - 0.01);
      this._spawnTimer = this._spawnInterval * (0.7 + Math.random() * 0.6);
    }

    // update trails
    if (gesture) {
      this._trailL.push({ x: gesture.leftHand.x * this.width, y: gesture.leftHand.y * this.height });
      this._trailR.push({ x: gesture.rightHand.x * this.width, y: gesture.rightHand.y * this.height });
      if (this._trailL.length > TRAIL_LEN) this._trailL.shift();
      if (this._trailR.length > TRAIL_LEN) this._trailR.shift();
    }

    // update items
    for (const item of this._items) {
      if (item.sliced) {
        item.sliceAge += s;
        if (item.sliceParts) {
          for (const p of item.sliceParts) {
            p.x += p.vx * s;
            p.y += p.vy * s;
            p.vy += 800 * s;
            p.alpha = Math.max(0, 1 - item.sliceAge / 0.6);
          }
        }
        continue;
      }
      item.x += item.vx * s;
      item.y += item.vy * s;
      item.vy += 980 * s;

      // slice check
      if (!item.isBomb && gesture) {
        const hands = [
          { h: gesture.leftHand, sp: gesture.leftHand.speed },
          { h: gesture.rightHand, sp: gesture.rightHand.speed },
        ];
        for (const { h, sp } of hands) {
          if (sp > SLICE_SPEED) {
            const hx = h.x * this.width;
            const hy = h.y * this.height;
            if (rectsOverlap(item.x, item.y, item.r, hx, hy)) {
              item.sliced = true;
              item.sliceAge = 0;
              const dir = h.vx > 0 ? 1 : -1;
              item.sliceParts = [
                { x: item.x - item.r * 0.3, y: item.y, vx: -80 * dir, vy: -120, alpha: 1 },
                { x: item.x + item.r * 0.3, y: item.y, vx: 80 * dir, vy: -100, alpha: 1 },
              ];
              this._score += 10;
              this._spawnParticles(item.x, item.y, item.color, 12);
              break;
            }
          }
        }
      }

      // bomb check
      if (item.isBomb && gesture) {
        const hands = [
          { h: gesture.leftHand, sp: gesture.leftHand.speed },
          { h: gesture.rightHand, sp: gesture.rightHand.speed },
        ];
        for (const { h, sp } of hands) {
          if (sp > SLICE_SPEED) {
            const hx = h.x * this.width;
            const hy = h.y * this.height;
            if (rectsOverlap(item.x, item.y, item.r, hx, hy)) {
              item.sliced = true;
              this._lives--;
              this._flashAlpha = 0.55;
              this._spawnParticles(item.x, item.y, '#ff3300', 18);
              if (this._lives <= 0) this._gameOver = true;
              break;
            }
          }
        }
      }

      // fell off top without slice
      if (!item.sliced && item.y < -60 && item.vy < 0) {
        // already going down, skip
      }
      if (!item.sliced && item.y > this.height + 60) {
        item.sliced = true;
        if (!item.isBomb) {
          this._missed++;
          if (this._missed >= MISS_LIMIT) {
            this._missed = 0;
            this._lives--;
            if (this._lives <= 0) this._gameOver = true;
          }
        }
      }
    }

    // clean up old sliced items
    this._items = this._items.filter(item => {
      if (!item.sliced) return true;
      return item.sliceAge < 0.7;
    });

    if (this._flashAlpha > 0) this._flashAlpha -= s * 2.5;
  }

  draw() {
    const ctx = this.ctx;
    // background
    ctx.fillStyle = '#0d0905';
    ctx.fillRect(0, 0, this.width, this.height);

    // wood plank lines
    for (const line of this._bgLines) {
      ctx.save();
      ctx.globalAlpha = line.alpha;
      ctx.strokeStyle = '#8B5a2B';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, line.y);
      ctx.lineTo(this.width, line.y);
      ctx.stroke();
      ctx.restore();
    }

    // flash overlay
    if (this._flashAlpha > 0) {
      ctx.save();
      ctx.globalAlpha = this._flashAlpha;
      ctx.fillStyle = '#ff2200';
      ctx.fillRect(0, 0, this.width, this.height);
      ctx.restore();
    }

    // items
    for (const item of this._items) {
      ctx.save();
      if (item.sliced && item.sliceParts) {
        for (const p of item.sliceParts) {
          ctx.globalAlpha = p.alpha;
          // half circle
          ctx.fillStyle = item.color;
          ctx.shadowColor = item.color;
          ctx.shadowBlur = 14;
          ctx.beginPath();
          ctx.arc(p.x, p.y, item.r * 0.85, 0, Math.PI);
          ctx.fill();
        }
      } else if (!item.sliced) {
        if (item.isBomb) {
          ctx.fillStyle = '#111111';
          ctx.strokeStyle = '#ff4400';
          ctx.shadowColor = '#ff4400';
          ctx.shadowBlur = 12;
          ctx.lineWidth = 2.5;
          ctx.beginPath();
          ctx.arc(item.x, item.y, item.r, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
          // X mark
          ctx.shadowBlur = 0;
          ctx.strokeStyle = '#ff4400';
          ctx.lineWidth = 3;
          const s2 = item.r * 0.5;
          ctx.beginPath();
          ctx.moveTo(item.x - s2, item.y - s2);
          ctx.lineTo(item.x + s2, item.y + s2);
          ctx.moveTo(item.x + s2, item.y - s2);
          ctx.lineTo(item.x - s2, item.y + s2);
          ctx.stroke();
        } else {
          ctx.fillStyle = item.color;
          ctx.shadowColor = item.color;
          ctx.shadowBlur = 18;
          ctx.beginPath();
          ctx.arc(item.x, item.y, item.r, 0, Math.PI * 2);
          ctx.fill();
          ctx.shadowBlur = 0;
          ctx.font = `${item.r * 1.1}px serif`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(item.label, item.x, item.y);
        }
      }
      ctx.restore();
    }

    // hand trails
    this._drawTrail(this._trailL, '#00ffff');
    this._drawTrail(this._trailR, '#ff88ff');

    this._drawParticles();
    this._drawHUD();
  }

  _drawTrail(trail, color) {
    if (trail.length < 2) return;
    const ctx = this.ctx;
    ctx.save();
    for (let i = 1; i < trail.length; i++) {
      const alpha = i / trail.length;
      ctx.globalAlpha = alpha * 0.8;
      ctx.strokeStyle = color;
      ctx.shadowColor = color;
      ctx.shadowBlur = 10;
      ctx.lineWidth = alpha * 4;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(trail[i - 1].x, trail[i - 1].y);
      ctx.lineTo(trail[i].x, trail[i].y);
      ctx.stroke();
    }
    ctx.restore();
  }

  _drawHUD() {
    this._drawText(`${this._score}`, this.width / 2, 18, {
      size: 28, align: 'center', color: '#ffdd00', glow: '#ffdd00',
    });
    this._drawText(`${Math.ceil(this.timeLeft)}s`, this.width - 12, 18, {
      size: 18, align: 'right', color: '#ffffff88',
    });
    this._drawText(`miss ${this._missed}/${MISS_LIMIT}`, 12, 18, {
      size: 13, color: '#ff884488',
    });
  }
}

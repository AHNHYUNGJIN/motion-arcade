import { BaseGame } from './BaseGame.js';

const GROUND_Y_RATIO = 0.82;
const PLAYER_X_RATIO = 0.20;
const JUMP_VY = -820;
const GRAVITY = 1800;
const PLAYER_W = 28;
const PLAYER_H = 52;
const OBS_TYPES = [
  { w: 28, h: 52, color: '#33ff88', label: 'cactus' },
  { w: 44, h: 36, color: '#ff8833', label: 'rock' },
  { w: 22, h: 72, color: '#ff3388', label: 'spike' },
];
const CITY_LAYERS = [
  { speed: 0.12, color: '#0a0a22', buildings: null },
  { speed: 0.25, color: '#0d1133', buildings: null },
  { speed: 0.55, color: '#111644', buildings: null },
];

export class JumpChallenge extends BaseGame {
  constructor(canvas, width, height) {
    super(canvas, width, height);
    this._playerY = 0;
    this._playerVY = 0;
    this._onGround = true;
    this._obstacles = [];
    this._obsTimer = 0;
    this._obsInterval = 2.2;
    this._speed = this.width * 0.38;
    this._legToggle = false;
    this._legTimer = 0;
    this._groundX = [];
    this._cityLayers = CITY_LAYERS.map(l => ({ ...l, offsets: [0, this.width] }));
    this._survived = 0;
  }

  init() {
    const groundY = this.height * GROUND_Y_RATIO;
    this._playerY = groundY;
    this._playerVY = 0;
    this._onGround = true;
    this._obstacles = [];
    this._obsTimer = 0;
    this._obsInterval = 2.2;
    this._speed = this.width * 0.38;
    this._score = 0;
    this._survived = 0;
    this._legToggle = false;
    this._legTimer = 0;
    this._gameOver = false;
    this._timeLeft = 60;
    this._particles = [];
    this._initCity();
    this._initGround();
  }

  _initCity() {
    this._cityLayers = CITY_LAYERS.map(layer => {
      const buildings = this._genBuildings(this.width * 2, layer.color);
      return { ...layer, buildings, offsetX: 0 };
    });
  }

  _genBuildings(totalW, color) {
    const blds = [];
    let x = 0;
    while (x < totalW) {
      const w = 30 + Math.random() * 60;
      const h = 40 + Math.random() * 140;
      blds.push({ x, w, h });
      x += w + 4 + Math.random() * 20;
    }
    return blds;
  }

  _initGround() {
    // ground dots/tiles for scrolling feel
    this._groundTiles = [];
    for (let i = 0; i < Math.ceil(this.width / 40) + 2; i++) {
      this._groundTiles.push(i * 40);
    }
  }

  _spawnObstacle() {
    const type = OBS_TYPES[Math.floor(Math.random() * OBS_TYPES.length)];
    const groundY = this.height * GROUND_Y_RATIO;
    this._obstacles.push({
      x: this.width + type.w,
      y: groundY - type.h,
      w: type.w,
      h: type.h,
      color: type.color,
      passed: false,
    });
  }

  update(dt, gesture) {
    if (this._gameOver) return;
    super.update(dt, gesture);
    const s = dt / 1000;

    this._survived += s;
    this._score = Math.floor(this._survived * 10);
    this._speed = this.width * (0.38 + this._survived * 0.006);

    // jump
    if (gesture && gesture.isJumping && this._onGround) {
      this._playerVY = JUMP_VY;
      this._onGround = false;
      this._spawnParticles(
        this.width * PLAYER_X_RATIO,
        this.height * GROUND_Y_RATIO,
        '#ffcc00', 8
      );
    }

    // physics
    const groundY = this.height * GROUND_Y_RATIO;
    if (!this._onGround) {
      this._playerVY += GRAVITY * s;
      this._playerY += this._playerVY * s;
      if (this._playerY >= groundY) {
        this._playerY = groundY;
        this._playerVY = 0;
        this._onGround = true;
      }
    }

    // leg animation
    this._legTimer += s;
    if (this._legTimer > 0.18) {
      this._legToggle = !this._legToggle;
      this._legTimer = 0;
    }

    // city parallax
    for (const layer of this._cityLayers) {
      layer.offsetX -= this._speed * layer.speed * s;
      const totalW = layer.buildings[layer.buildings.length - 1].x
        + layer.buildings[layer.buildings.length - 1].w + 20;
      if (layer.offsetX < -totalW) layer.offsetX += totalW;
    }

    // ground tiles scroll
    for (let i = 0; i < this._groundTiles.length; i++) {
      this._groundTiles[i] -= this._speed * s;
      if (this._groundTiles[i] < -40) {
        this._groundTiles[i] += this._groundTiles.length * 40;
      }
    }

    // obstacles
    this._obsTimer -= s;
    if (this._obsTimer <= 0) {
      this._spawnObstacle();
      this._obsInterval = Math.max(0.9, this._obsInterval - 0.025);
      this._obsTimer = this._obsInterval * (0.7 + Math.random() * 0.6);
    }

    const px = this.width * PLAYER_X_RATIO;
    const py = this._playerY;

    for (const obs of this._obstacles) {
      obs.x -= this._speed * s;

      if (!obs.passed && obs.x + obs.w < px - PLAYER_W / 2) {
        obs.passed = true;
      }

      // collision (AABB)
      if (
        px + PLAYER_W / 2 - 4 > obs.x &&
        px - PLAYER_W / 2 + 4 < obs.x + obs.w &&
        py > obs.y + 6 &&
        py - PLAYER_H < obs.y + obs.h - 6
      ) {
        this._spawnParticles(px, py - PLAYER_H / 2, '#ff3388', 20);
        this._gameOver = true;
        return;
      }
    }

    this._obstacles = this._obstacles.filter(o => o.x > -100);
  }

  draw() {
    const ctx = this.ctx;
    const groundY = this.height * GROUND_Y_RATIO;

    // sky gradient
    const grad = ctx.createLinearGradient(0, 0, 0, groundY);
    grad.addColorStop(0, '#01010f');
    grad.addColorStop(1, '#080820');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, this.width, this.height);

    // city layers
    this._drawCity();

    // ground
    ctx.save();
    ctx.strokeStyle = '#22ffaa';
    ctx.shadowColor = '#22ffaa';
    ctx.shadowBlur = 10;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, groundY);
    ctx.lineTo(this.width, groundY);
    ctx.stroke();
    ctx.restore();

    // ground tile dashes
    ctx.save();
    ctx.fillStyle = '#22ffaa44';
    for (const tx of this._groundTiles) {
      ctx.fillRect(tx, groundY + 4, 28, 4);
    }
    ctx.restore();

    // obstacles
    for (const obs of this._obstacles) {
      this._drawNeonRect(obs.x, obs.y, obs.w, obs.h, obs.color, 16, 3);
    }

    // player
    this._drawPlayer();

    this._drawParticles();
    this._drawHUD();
  }

  _drawCity() {
    const ctx = this.ctx;
    const groundY = this.height * GROUND_Y_RATIO;

    for (const layer of this._cityLayers) {
      ctx.save();
      ctx.fillStyle = layer.color;
      const offsetX = layer.offsetX;
      // draw twice for seamless loop
      for (let rep = 0; rep < 3; rep++) {
        const totalW = layer.buildings.length > 0
          ? layer.buildings[layer.buildings.length - 1].x
          + layer.buildings[layer.buildings.length - 1].w + 20
          : this.width;
        const shift = offsetX + rep * totalW;
        for (const b of layer.buildings) {
          ctx.fillRect(
            shift + b.x,
            groundY - b.h,
            b.w,
            b.h
          );
          // window dots
          ctx.fillStyle = layer.color === '#0a0a22' ? '#ffffff08' : '#ffffff0a';
          for (let wy = groundY - b.h + 8; wy < groundY - 8; wy += 14) {
            for (let wx = shift + b.x + 5; wx < shift + b.x + b.w - 5; wx += 10) {
              ctx.fillRect(wx, wy, 4, 6);
            }
          }
          ctx.fillStyle = layer.color;
        }
      }
      ctx.restore();
    }
  }

  _drawPlayer() {
    const ctx = this.ctx;
    const x = this.width * PLAYER_X_RATIO;
    const groundY = this.height * GROUND_Y_RATIO;
    const py = this._playerY;
    const color = '#ffcc00';
    const airborne = !this._onGround;

    ctx.save();
    ctx.shadowColor = color;
    ctx.shadowBlur = 16;
    ctx.fillStyle = color;

    // head
    ctx.beginPath();
    ctx.arc(x, py - PLAYER_H - 10, 13, 0, Math.PI * 2);
    ctx.fill();

    // body
    ctx.fillRect(x - 8, py - PLAYER_H, 16, 32);

    // legs (running animation)
    const legA = airborne ? -25 : (this._legToggle ? -22 : 22);
    const legB = airborne ? 25 : (this._legToggle ? 22 : -22);

    ctx.lineWidth = 7;
    ctx.strokeStyle = color;
    ctx.lineCap = 'round';

    // left leg
    ctx.beginPath();
    ctx.moveTo(x, py - PLAYER_H + 32);
    ctx.lineTo(x + Math.sin((legA * Math.PI) / 180) * 22, py);
    ctx.stroke();

    // right leg
    ctx.beginPath();
    ctx.moveTo(x, py - PLAYER_H + 32);
    ctx.lineTo(x + Math.sin((legB * Math.PI) / 180) * 22, py);
    ctx.stroke();

    // arms
    const armA = this._legToggle ? -30 : 30;
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(x, py - PLAYER_H + 8);
    ctx.lineTo(x + Math.sin((armA * Math.PI) / 180) * 18, py - PLAYER_H + 22);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x, py - PLAYER_H + 8);
    ctx.lineTo(x - Math.sin((armA * Math.PI) / 180) * 18, py - PLAYER_H + 22);
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
    this._drawText(`${this._survived.toFixed(1)}s`, 12, 18, {
      size: 16, color: '#ffcc0088',
    });
  }
}

/**
 * Canvas Confetti Particle Engine for Live Counter Assistant
 * Smooth 60fps particles, streamers, stars, and celebratory bursts
 */
class ConfettiEngine {
  constructor() {
    this.canvas = null;
    this.ctx = null;
    this.particles = [];
    this.animationId = null;
    this.colors = [
      '#00f0ff', '#ff007f', '#ffe600', '#00ff88', '#9900ff', '#ff5500',
      '#ffffff', '#00e5ff', '#ff2a6d', '#05d9e8', '#f9f9f9', '#ffd700'
    ];
    this.initCanvas();
    window.addEventListener('resize', () => this.resizeCanvas());
  }

  initCanvas() {
    this.canvas = document.getElementById('confetti-canvas');
    if (!this.canvas) {
      this.canvas = document.createElement('canvas');
      this.canvas.id = 'confetti-canvas';
      this.canvas.style.position = 'fixed';
      this.canvas.style.top = '0';
      this.canvas.style.left = '0';
      this.canvas.style.width = '100vw';
      this.canvas.style.height = '100vh';
      this.canvas.style.pointerEvents = 'none';
      this.canvas.style.zIndex = '9999';
      document.body.appendChild(this.canvas);
    }
    this.ctx = this.canvas.getContext('2d');
    this.resizeCanvas();
  }

  resizeCanvas() {
    if (this.canvas) {
      this.canvas.width = window.innerWidth * window.devicePixelRatio;
      this.canvas.height = window.innerHeight * window.devicePixelRatio;
      if (this.ctx) {
        this.ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
      }
    }
  }

  createParticle(x, y, vx, vy, isStar = false) {
    const color = this.colors[Math.floor(Math.random() * this.colors.length)];
    const size = isStar ? Math.random() * 5 + 3 : Math.random() * 6 + 3;
    return {
      x,
      y,
      vx,
      vy,
      size,
      color,
      isStar,
      rotation: Math.random() * Math.PI * 2,
      rotationSpeed: (Math.random() - 0.5) * 0.15,
      wobble: Math.random() * 8,
      wobbleSpeed: Math.random() * 0.08 + 0.04,
      opacity: 1,
      decay: Math.random() * 0.012 + 0.008
    };
  }

  burst(originX = window.innerWidth / 2, originY = window.innerHeight / 2, count = 24) {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = Math.random() * 9 + 3;
      const vx = Math.cos(angle) * speed;
      const vy = Math.sin(angle) * speed - 3.5; // slight upward drift
      const isStar = Math.random() > 0.75;
      this.particles.push(this.createParticle(originX, originY, vx, vy, isStar));
    }

    if (!this.animationId) {
      this.animate();
    }
  }

  fireworks() {
    const width = window.innerWidth;
    const height = window.innerHeight;

    // Gentle celebration blasts with minimal particle count
    this.burst(width * 0.35, height * 0.5, 25);
    this.burst(width * 0.65, height * 0.5, 25);

    setTimeout(() => {
      this.burst(width * 0.5, height * 0.4, 30);
    }, 200);
  }

  drawStar(cx, cy, spikes, outerRadius, innerRadius, color, rotation) {
    let rot = Math.PI / 2 * 3 + rotation;
    let x = cx;
    let y = cy;
    const step = Math.PI / spikes;

    this.ctx.beginPath();
    this.ctx.moveTo(cx, cy - outerRadius);
    for (let i = 0; i < spikes; i++) {
      x = cx + Math.cos(rot) * outerRadius;
      y = cy + Math.sin(rot) * outerRadius;
      this.ctx.lineTo(x, y);
      rot += step;

      x = cx + Math.cos(rot) * innerRadius;
      y = cy + Math.sin(rot) * innerRadius;
      this.ctx.lineTo(x, y);
      rot += step;
    }
    this.ctx.lineTo(cx, cy - outerRadius);
    this.ctx.closePath();
    this.ctx.fillStyle = color;
    this.ctx.fill();
  }

  animate() {
    if (!this.ctx) return;
    this.ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);

    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];

      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.38; // gravity
      p.vx *= 0.98; // drag
      p.vy *= 0.98;

      p.wobble += p.wobbleSpeed;
      p.rotation += p.rotationSpeed;
      p.opacity -= p.decay;

      if (p.opacity <= 0 || p.y > window.innerHeight + 50) {
        this.particles.splice(i, 1);
        continue;
      }

      this.ctx.save();
      this.ctx.globalAlpha = Math.max(0, p.opacity);

      if (p.isStar) {
        this.drawStar(p.x, p.y, 5, p.size, p.size / 2, p.color, p.rotation);
      } else {
        this.ctx.translate(p.x, p.y);
        this.ctx.rotate(p.rotation);
        const wobbleX = Math.cos(p.wobble) * (p.size * 0.4);
        this.ctx.fillStyle = p.color;
        this.ctx.fillRect(-p.size / 2 + wobbleX, -p.size / 2, p.size, p.size * 0.5);
      }

      this.ctx.restore();
    }

    if (this.particles.length > 0) {
      this.animationId = requestAnimationFrame(() => this.animate());
    } else {
      this.animationId = null;
      this.ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
    }
  }

  clear() {
    this.particles = [];
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }
    if (this.ctx) {
      this.ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
    }
  }
}

window.confettiEngine = new ConfettiEngine();

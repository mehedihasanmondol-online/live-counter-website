/**
 * Live Arena Counter - Penalty Shootout Mini-Game
 * Realistic 3D-Perspective Ball Physics, Goalkeeper AI, Net Simulation, Crowd Reactions & Live Score Sync
 */

(function () {
  'use strict';

  class PenaltyShootoutGame {
    constructor() {
      this.canvas = null;
      this.ctx = null;
      this.width = 0;
      this.height = 0;
      this.dpr = 1;

      // Game state
      this.isOpen = false;
      this.activePlayerId = null;
      this.autoAlternate = true;
      this.stats = {
        shots: 0,
        goals: 0,
        saves: 0,
        misses: 0,
        streak: 0,
        bestStreak: 0
      };

      // Sound toggle
      this.soundEnabled = true;

      // Ball state (Normalized: z = 0 at penalty spot, z = 1 at goal line)
      this.ball = {
        x: 0,         // Horizontal position relative to center
        y: 0,         // Vertical elevation off ground
        z: 0,         // Depth: 0 = penalty spot, 1 = goal line, >1 = behind net
        vx: 0,
        vy: 0,
        vz: 0,
        spin: 0,      // Magnus curve spin
        rotation: 0,  // Visual 2D/3D rotation angle
        radius: 20,   // Base radius at penalty spot
        state: 'ready', // 'ready', 'aiming', 'flying', 'goal', 'saved', 'missed', 'post', 'resetting'
        isDragging: false,
        dragStartX: 0,
        dragStartY: 0,
        dragCurrentX: 0,
        dragCurrentY: 0,
        trail: []     // Particle trail
      };

      // Goalkeeper state
      this.keeper = {
        x: 0,          // Normalized horizontal position [-1 to 1]
        y: 0,          // Normalized elevation [0 to 1]
        targetX: 0,
        targetY: 0,
        vx: 0,
        vy: 0,
        state: 'idle', // 'idle', 'anticipating', 'diving', 'saved', 'beaten', 'celebrating'
        diveType: 'idle', // 'idle', 'top-left', 'bottom-left', 'top-right', 'bottom-right', 'center-jump'
        diveProgress: 0,
        idleTimer: 0,
        gloves: { lx: 0, ly: 0, rx: 0, ry: 0 },
        height: 140,
        width: 70
      };

      // Dynamic Net Mesh (Spring grid behind goal)
      this.netCols = 16;
      this.netRows = 10;
      this.netNodes = [];

      // Goal dimensions in screen pixels (calculated on resize)
      this.goal = {
        left: 0,
        right: 0,
        top: 0,
        bottom: 0,
        width: 0,
        height: 0,
        postRadius: 6,
        depth: 70
      };

      // Animation & Timing
      this.animId = null;
      this.lastTime = 0;
      this.resetTimer = null;
      this.screenShake = 0;

      // DOM Elements
      this.modalEl = null;
      this.floatingBtnEl = null;

      // Bind methods
      this.loop = this.loop.bind(this);
      this.handlePointerDown = this.handlePointerDown.bind(this);
      this.handlePointerMove = this.handlePointerMove.bind(this);
      this.handlePointerUp = this.handlePointerUp.bind(this);
      this.handleResize = this.handleResize.bind(this);

      this.init();
    }

    /* ==========================================================================
       Initialization
       ========================================================================== */

    init() {
      this.modalEl = document.getElementById('penalty-modal');
      this.floatingBtnEl = document.getElementById('penalty-floating-btn');
      this.canvas = document.getElementById('penalty-canvas');

      if (!this.canvas || !this.modalEl) return;
      this.ctx = this.canvas.getContext('2d');

      this.bindDOMEvents();
      this.initNetMesh();

      // Listen for players list updates from main app
      if (window.arenaApp && window.arenaApp.subscribe) {
        window.arenaApp.subscribe(({ players }) => {
          this.updateShooterSelector(players);
        });
      }

      window.addEventListener('resize', this.handleResize);
    }

    bindDOMEvents() {
      // Floating launcher button
      if (this.floatingBtnEl) {
        this.floatingBtnEl.addEventListener('click', () => this.openGame());
      }

      // Close modal button
      const closeBtn = document.getElementById('close-penalty-btn');
      if (closeBtn) {
        closeBtn.addEventListener('click', () => this.closeGame());
      }

      // Close modal on backdrop click outside dialog
      if (this.modalEl) {
        this.modalEl.addEventListener('click', (e) => {
          if (e.target === this.modalEl) {
            this.closeGame();
          }
        });
      }

      // Close on Escape key
      window.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && this.isOpen) {
          this.closeGame();
        }
        // 'P' key to toggle penalty shootout
        if ((e.key === 'p' || e.key === 'P') && !e.ctrlKey && !e.altKey) {
          if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
          if (this.isOpen) {
            this.closeGame();
          } else {
            this.openGame();
          }
          e.preventDefault();
        }
      });

      // Alternate shooter checkbox/toggle
      const altToggle = document.getElementById('penalty-auto-alternate');
      if (altToggle) {
        altToggle.addEventListener('change', (e) => {
          this.autoAlternate = e.target.checked;
        });
      }

      // Reset shootout stats button
      const resetStatsBtn = document.getElementById('penalty-reset-stats-btn');
      if (resetStatsBtn) {
        resetStatsBtn.addEventListener('click', () => this.resetStats());
      }

      // Shootout audio toggle
      const soundBtn = document.getElementById('penalty-sound-btn');
      if (soundBtn) {
        soundBtn.addEventListener('click', () => {
          this.soundEnabled = !this.soundEnabled;
          soundBtn.classList.toggle('muted', !this.soundEnabled);
          soundBtn.innerHTML = this.soundEnabled ? '🔊 Sound: ON' : '🔇 Sound: OFF';
        });
      }

      // Canvas Pointer / Touch interactions
      this.canvas.addEventListener('pointerdown', this.handlePointerDown);
      window.addEventListener('pointermove', this.handlePointerMove);
      window.addEventListener('pointerup', this.handlePointerUp);
      window.addEventListener('pointercancel', this.handlePointerUp);
    }

    /* ==========================================================================
       Modal Open & Close
       ========================================================================== */

    openGame() {
      if (!this.modalEl) return;
      this.isOpen = true;
      this.modalEl.classList.add('show');
      document.body.classList.add('penalty-active');

      // Update active shooter selection
      this.syncActivePlayer();
      this.handleResize();
      this.resetBall();
      this.resetKeeper();

      // Play start whistle
      if (this.soundEnabled && window.soundEngine && window.soundEngine.playWhistle) {
        setTimeout(() => window.soundEngine.playWhistle(), 300);
      }

      this.lastTime = performance.now();
      if (!this.animId) {
        this.animId = requestAnimationFrame(this.loop);
      }
    }

    closeGame() {
      if (!this.modalEl) return;
      this.isOpen = false;
      this.modalEl.classList.remove('show');
      document.body.classList.remove('penalty-active');

      if (this.animId) {
        cancelAnimationFrame(this.animId);
        this.animId = null;
      }
      if (this.resetTimer) {
        clearTimeout(this.resetTimer);
        this.resetTimer = null;
      }
    }

    /* ==========================================================================
       Player Selection & Integration
       ========================================================================== */

    syncActivePlayer() {
      const players = window.arenaApp ? window.arenaApp.getPlayers() : [];
      if (players.length > 0) {
        if (!this.activePlayerId || !players.find(p => p.id === this.activePlayerId)) {
          this.activePlayerId = players[0].id;
        }
      }
      this.updateShooterSelector(players);
    }

    updateShooterSelector(players) {
      const container = document.getElementById('penalty-shooter-pills');
      if (!container || !players) return;

      container.innerHTML = '';
      players.forEach(p => {
        const pill = document.createElement('button');
        pill.className = `shooter-pill ${p.id === this.activePlayerId ? 'active' : ''}`;
        pill.style.setProperty('--shooter-color', p.color);
        pill.innerHTML = `
          <img src="${p.avatar}" alt="${p.name}" class="shooter-avatar" onerror="this.src='data:image/svg+xml,<svg xmlns=\\'http://www.w3.org/2000/svg\\' viewBox=\\'0 0 24 24\\'><circle cx=\\'12\\' cy=\\'12\\' r=\\'12\\' fill=\\'%23444\\'/></svg>'">
          <div class="shooter-info">
            <span class="shooter-name">${p.name}</span>
            <span class="shooter-score">SCORE: ${p.score}</span>
          </div>
        `;
        pill.addEventListener('click', () => {
          this.activePlayerId = p.id;
          this.updateShooterSelector(players);
        });
        container.appendChild(pill);
      });

      // Update active shooter display badge
      const activeP = players.find(p => p.id === this.activePlayerId);
      const badgeEl = document.getElementById('penalty-current-shooter-badge');
      if (badgeEl && activeP) {
        badgeEl.innerHTML = `
          <img src="${activeP.avatar}" alt="${activeP.name}" class="badge-avatar">
          <span>Kicking: <strong>${activeP.name}</strong> (${activeP.tag || 'PRO'})</span>
        `;
      }
    }

    advanceToNextPlayer() {
      if (!this.autoAlternate) return;
      const players = window.arenaApp ? window.arenaApp.getPlayers() : [];
      if (players.length < 2) return;

      const currentIndex = players.findIndex(p => p.id === this.activePlayerId);
      const nextIndex = (currentIndex + 1) % players.length;
      this.activePlayerId = players[nextIndex].id;
      this.updateShooterSelector(players);
    }

    /* ==========================================================================
       Dimensions, Resize & Net Mesh
       ========================================================================== */

    handleResize() {
      if (!this.canvas || !this.isOpen) return;

      const rect = this.canvas.parentElement.getBoundingClientRect();
      this.dpr = Math.min(window.devicePixelRatio || 1, 2);
      this.width = rect.width;
      this.height = rect.height;

      this.canvas.width = this.width * this.dpr;
      this.canvas.height = this.height * this.dpr;
      this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);

      // Calculate goal coordinates based on canvas size
      const goalWidth = Math.min(this.width * 0.62, 540);
      const goalHeight = goalWidth * 0.44;
      const goalLeft = (this.width - goalWidth) / 2;
      const goalRight = goalLeft + goalWidth;
      const goalBottom = this.height * 0.66;
      const goalTop = goalBottom - goalHeight;

      this.goal = {
        left: goalLeft,
        right: goalRight,
        top: goalTop,
        bottom: goalBottom,
        width: goalWidth,
        height: goalHeight,
        postRadius: Math.max(5, Math.floor(goalWidth * 0.015)),
        depth: Math.floor(goalHeight * 0.42)
      };

      this.initNetMesh();
    }

    initNetMesh() {
      this.netNodes = [];
      for (let r = 0; r <= this.netRows; r++) {
        const row = [];
        const ry = r / this.netRows;
        for (let c = 0; c <= this.netCols; c++) {
          const rx = c / this.netCols;
          row.push({
            originX: rx,
            originY: ry,
            currentX: rx,
            currentY: ry,
            vx: 0,
            vy: 0,
            dispX: 0,
            dispY: 0
          });
        }
        this.netNodes.push(row);
      }
    }

    /* ==========================================================================
       Ball & Keeper Physics Reset
       ========================================================================== */

    resetBall() {
      // Spot ball at screen center bottom
      this.ball.x = this.width / 2;
      this.ball.y = this.height * 0.88;
      this.ball.z = 0;
      this.ball.vx = 0;
      this.ball.vy = 0;
      this.ball.vz = 0;
      this.ball.spin = 0;
      this.ball.rotation = 0;
      this.ball.radius = Math.max(22, this.width * 0.038);
      this.ball.state = 'ready';
      this.ball.isDragging = false;
      this.ball.trail = [];

      this.hideOutcomeBanner();
    }

    resetKeeper() {
      this.keeper.x = 0;
      this.keeper.y = 0;
      this.keeper.targetX = 0;
      this.keeper.targetY = 0;
      this.keeper.vx = 0;
      this.keeper.vy = 0;
      this.keeper.state = 'idle';
      this.keeper.diveType = 'idle';
      this.keeper.diveProgress = 0;
      this.keeper.idleTimer = 0;
      this.keeper.height = this.goal.height * 0.62;
      this.keeper.width = this.keeper.height * 0.52;
    }

    /* ==========================================================================
       Pointer & Flick Controls
       ========================================================================== */

    getCanvasPointerPos(e) {
      const rect = this.canvas.getBoundingClientRect();
      return {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top
      };
    }

    handlePointerDown(e) {
      if (this.ball.state !== 'ready') return;

      const pos = this.getCanvasPointerPos(e);
      const dx = pos.x - this.ball.x;
      const dy = pos.y - this.ball.y;
      const dist = Math.hypot(dx, dy);

      // Clicked on or near the ball
      if (dist < this.ball.radius * 2.8) {
        this.ball.isDragging = true;
        this.ball.dragStartX = pos.x;
        this.ball.dragStartY = pos.y;
        this.ball.dragCurrentX = pos.x;
        this.ball.dragCurrentY = pos.y;
        this.ball.state = 'aiming';
        e.preventDefault();
      }
    }

    handlePointerMove(e) {
      if (!this.ball.isDragging || this.ball.state !== 'aiming') return;

      const pos = this.getCanvasPointerPos(e);
      this.ball.dragCurrentX = pos.x;
      this.ball.dragCurrentY = pos.y;
    }

    handlePointerUp(e) {
      if (!this.ball.isDragging || this.ball.state !== 'aiming') return;

      this.ball.isDragging = false;
      const pos = this.getCanvasPointerPos(e);

      // Flick vector: From drag start towards drag release, or inverted pull-back
      let deltaX = pos.x - this.ball.dragStartX;
      let deltaY = pos.y - this.ball.dragStartY;

      // If user pulled backwards like a slingshot, invert direction
      if (deltaY > 20 && Math.abs(deltaY) > Math.abs(deltaX)) {
        deltaX = -deltaX;
        deltaY = -deltaY;
      }

      // Minimum swipe threshold
      const swipeDistance = Math.hypot(deltaX, deltaY);
      if (swipeDistance < 15) {
        // Tap shoot towards target position
        this.shootTowardsTarget(pos.x, pos.y);
        return;
      }

      // Calculate kick velocity from swipe
      this.launchBall(deltaX, deltaY, swipeDistance);
    }

    shootTowardsTarget(targetX, targetY) {
      // Direct tap kick towards clicked location on goal
      const deltaX = targetX - this.ball.x;
      const deltaY = targetY - this.ball.y;
      const dist = Math.hypot(deltaX, deltaY);
      this.launchBall(deltaX, deltaY, Math.min(dist * 0.45, 140));
    }

    launchBall(deltaX, deltaY, powerMag) {
      this.ball.state = 'flying';

      // Normalized power [0.5 to 1.5]
      const clampedPower = Math.min(Math.max(powerMag / 80, 0.6), 1.5);

      // Target projection at goal line (z = 1)
      const aimFactor = 2.4 * clampedPower;
      const targetScreenX = this.ball.x + deltaX * aimFactor;
      const targetScreenY = this.ball.y + deltaY * aimFactor;

      // Velocity in 3D perspective space
      this.ball.vz = 0.024 * (0.8 + clampedPower * 0.4); // Travel time approx 40-50 frames
      this.ball.vx = (targetScreenX - this.ball.x) * this.ball.vz;
      this.ball.vy = (targetScreenY - this.ball.y) * this.ball.vz;

      // Curve spin based on horizontal sweep angle
      this.ball.spin = (deltaX / 120) * 0.8;

      // Sound
      if (this.soundEnabled && window.soundEngine && window.soundEngine.playKick) {
        window.soundEngine.playKick(clampedPower);
      }

      // Trigger Goalkeeper Reaction
      this.triggerKeeperDive(targetScreenX, targetScreenY, clampedPower);
    }

    /* ==========================================================================
       Goalkeeper AI & Trajectory Prediction
       ========================================================================== */

    triggerKeeperDive(targetX, targetY, power) {
      // Reaction delay before keeper commits to dive
      const reactionDelay = 80 + Math.random() * 80;

      setTimeout(() => {
        if (this.ball.state !== 'flying') return;

        // Goalkeeper AI prediction accuracy:
        // ~65% chance keeper reads the correct quadrant
        const readsCorrect = Math.random() < 0.68;
        let diveTargetX = targetX;
        let diveTargetY = targetY;

        if (!readsCorrect) {
          // Goalkeeper dives the wrong way or freezes!
          const wrongDirection = targetX > this.width / 2 ? -1 : 1;
          diveTargetX = this.width / 2 + wrongDirection * (this.goal.width * 0.35);
          diveTargetY = this.goal.bottom - Math.random() * this.goal.height * 0.6;
        }

        // Determine dive quadrant
        const isLeft = diveTargetX < this.width / 2;
        const isHigh = diveTargetY < this.goal.top + this.goal.height * 0.5;

        if (isLeft && isHigh) this.keeper.diveType = 'top-left';
        else if (isLeft && !isHigh) this.keeper.diveType = 'bottom-left';
        else if (!isLeft && isHigh) this.keeper.diveType = 'top-right';
        else if (!isLeft && !isHigh) this.keeper.diveType = 'bottom-right';
        else this.keeper.diveType = 'center-jump';

        this.keeper.state = 'diving';
        this.keeper.targetX = diveTargetX;
        this.keeper.targetY = Math.max(this.goal.top + 20, Math.min(this.goal.bottom - 20, diveTargetY));
      }, reactionDelay);
    }

    /* ==========================================================================
       Physics & Game Loop
       ========================================================================== */

    loop(timestamp) {
      if (!this.isOpen) return;

      const dt = Math.min((timestamp - this.lastTime) / 1000, 0.1);
      this.lastTime = timestamp;

      this.update(dt);
      this.render();

      this.animId = requestAnimationFrame(this.loop);
    }

    update(dt) {
      // Update screen shake
      if (this.screenShake > 0) {
        this.screenShake *= 0.88;
        if (this.screenShake < 0.2) this.screenShake = 0;
      }

      // Update Net Springs
      this.updateNetMesh();

      // Update Keeper
      this.updateKeeper(dt);

      // Update Ball Physics
      if (this.ball.state === 'flying') {
        this.updateBallFlying(dt);
      } else if (this.ball.state === 'goal') {
        // Settle in net with gravity
        this.ball.vy += 0.2;
        this.ball.x += this.ball.vx * 0.2;
        this.ball.y += this.ball.vy * 0.2;
        this.ball.y = Math.min(this.ball.y, this.goal.bottom - 10);
      } else if (this.ball.state === 'post' || this.ball.state === 'saved') {
        // Rebound physics
        this.ball.x += this.ball.vx;
        this.ball.y += this.ball.vy;
        this.ball.vy += 0.4; // Gravity
        if (this.ball.y > this.height - 20) {
          this.ball.y = this.height - 20;
          this.ball.vy = -this.ball.vy * 0.45;
          this.ball.vx *= 0.7;
        }
      }
    }

    updateBallFlying(dt) {
      // Magnus effect: spin bends horizontal path
      this.ball.vx += this.ball.spin * 0.35;
      this.ball.x += this.ball.vx;
      this.ball.y += this.ball.vy;
      this.ball.z += this.ball.vz;

      // Slight natural gravity drop as it approaches goal
      this.ball.vy += 0.12 * (this.ball.z * 1.5);
      this.ball.rotation += 0.18 + this.ball.spin * 0.1;

      // Add particle to trail
      if (this.ball.trail.length > 18) this.ball.trail.shift();
      this.ball.trail.push({
        x: this.ball.x,
        y: this.ball.y,
        z: this.ball.z,
        radius: this.getCurrentBallRadius(),
        alpha: 0.65
      });

      // Decay trail alpha
      this.ball.trail.forEach(t => t.alpha *= 0.92);

      // Ball reached goal line plane (z >= 1.0)
      if (this.ball.z >= 1.0) {
        this.checkGoalLineCollision();
      }
    }

    checkGoalLineCollision() {
      const bx = this.ball.x;
      const by = this.ball.y;
      const ballRad = this.getCurrentBallRadius();

      const gl = this.goal.left;
      const gr = this.goal.right;
      const gt = this.goal.top;
      const gb = this.goal.bottom;
      const pr = this.goal.postRadius;

      // 1. Post & Crossbar Collisions (Woodwork)
      const hitLeftPost = Math.hypot(bx - gl, by - Math.max(gt, Math.min(gb, by))) < (ballRad + pr);
      const hitRightPost = Math.hypot(bx - gr, by - Math.max(gt, Math.min(gb, by))) < (ballRad + pr);
      const hitCrossbar = (bx >= gl - pr && bx <= gr + pr) && Math.abs(by - gt) < (ballRad + pr);

      if (hitLeftPost || hitRightPost || hitCrossbar) {
        this.handleOutcome('post', bx, by);
        return;
      }

      // 2. Off target (Outside posts or over crossbar)
      const isOutsideLeft = bx < gl - ballRad;
      const isOutsideRight = bx > gr + ballRad;
      const isOverBar = by < gt - ballRad;

      if (isOutsideLeft || isOutsideRight || isOverBar) {
        this.handleOutcome('missed', bx, by);
        return;
      }

      // 3. Inside the goal frame! Check Goalkeeper Save Hitbox
      const keeperHit = this.checkKeeperSave(bx, by, ballRad);
      if (keeperHit) {
        this.handleOutcome('saved', bx, by);
      } else {
        // Goal scored!
        this.handleOutcome('goal', bx, by);
      }
    }

    checkKeeperSave(bx, by, ballRad) {
      if (this.keeper.state !== 'diving' && this.keeper.state !== 'idle') return false;

      // Goalkeeper reach box centered on keeper's current position and extended hands
      const kx = this.keeper.x;
      const ky = this.keeper.y;
      const reachW = this.keeper.width * 1.35;
      const reachH = this.keeper.height * 1.25;

      const dist = Math.hypot(bx - kx, by - ky);

      // Check distance to keeper gloves / body
      if (dist < (reachW * 0.5 + ballRad)) {
        return true;
      }
      return false;
    }

    /* ==========================================================================
       Outcome Director & Celebrations
       ========================================================================== */

    handleOutcome(type, impactX, impactY) {
      if (this.resetTimer) clearTimeout(this.resetTimer);

      if (type === 'goal') {
        this.ball.state = 'goal';
        this.ball.vx *= 0.15;
        this.ball.vy *= 0.15;
        this.ball.vz = 0;

        // Deform net at impact point
        this.distortNetMesh(impactX, impactY);

        // Update stats
        this.stats.shots++;
        this.stats.goals++;
        this.stats.streak++;
        if (this.stats.streak > this.stats.bestStreak) {
          this.stats.bestStreak = this.stats.streak;
        }

        // Screen shake & Keeper beaten state
        this.screenShake = 16;
        this.keeper.state = 'beaten';

        // Play crowd cheer, net sound & fireworks
        if (this.soundEnabled && window.soundEngine) {
          if (window.soundEngine.playNet) window.soundEngine.playNet();
          setTimeout(() => {
            if (window.soundEngine.playCrowdRoar) window.soundEngine.playCrowdRoar();
            if (window.soundEngine.playWhistle) window.soundEngine.playWhistle();
          }, 60);
        }

        if (window.confettiEngine && window.confettiEngine.fireworks) {
          window.confettiEngine.fireworks();
        }

        // Sync score with active player in main Arena Counter!
        if (this.activePlayerId && window.arenaApp && window.arenaApp.modifyScore) {
          window.arenaApp.modifyScore(this.activePlayerId, 1);
        }

        // Show celebration banner
        this.showOutcomeBanner('GOAL! ⚽🔥', 'goal');

      } else if (type === 'saved') {
        this.ball.state = 'saved';
        // Rebound ball off goalkeeper hands
        this.ball.vx = (Math.random() - 0.5) * 8;
        this.ball.vy = -Math.random() * 6 - 2;
        this.ball.vz = 0;

        this.stats.shots++;
        this.stats.saves++;
        this.stats.streak = 0;

        this.keeper.state = 'celebrating';
        this.screenShake = 6;

        if (this.soundEnabled && window.soundEngine) {
          if (window.soundEngine.playGloveSave) window.soundEngine.playGloveSave();
          setTimeout(() => {
            if (window.soundEngine.playCrowdGroan) window.soundEngine.playCrowdGroan();
          }, 120);
        }

        this.showOutcomeBanner('SAVED BY KEEPER! 🧤⛔', 'saved');

      } else if (type === 'post') {
        this.ball.state = 'post';
        // Rebound off metal
        this.ball.vx = -this.ball.vx * 0.75 + (Math.random() - 0.5) * 4;
        this.ball.vy = -Math.abs(this.ball.vy) * 0.75;
        this.ball.vz = 0;

        this.stats.shots++;
        this.stats.misses++;
        this.stats.streak = 0;

        this.screenShake = 12;

        if (this.soundEnabled && window.soundEngine) {
          if (window.soundEngine.playWoodwork) window.soundEngine.playWoodwork();
          setTimeout(() => {
            if (window.soundEngine.playCrowdGroan) window.soundEngine.playCrowdGroan();
          }, 100);
        }

        this.showOutcomeBanner('HIT THE WOODWORK! 🔔💥', 'post');

      } else if (type === 'missed') {
        this.ball.state = 'missed';
        this.stats.shots++;
        this.stats.misses++;
        this.stats.streak = 0;

        if (this.soundEnabled && window.soundEngine && window.soundEngine.playCrowdGroan) {
          window.soundEngine.playCrowdGroan();
        }

        this.showOutcomeBanner('OFF TARGET! ❌', 'missed');
      }

      this.updateStatsUI();

      // Automatically advance turn and reset for next shot after 2.6s
      this.resetTimer = setTimeout(() => {
        this.advanceToNextPlayer();
        this.resetBall();
        this.resetKeeper();
      }, 2600);
    }

    showOutcomeBanner(text, type) {
      const banner = document.getElementById('penalty-outcome-banner');
      if (!banner) return;

      banner.innerText = text;
      banner.className = `penalty-outcome-banner show ${type}`;

      // Extra streak subtext
      if (type === 'goal' && this.stats.streak > 1) {
        banner.innerHTML = `${text}<span class="streak-subtag">🔥 ${this.stats.streak} IN A ROW!</span>`;
      }
    }

    hideOutcomeBanner() {
      const banner = document.getElementById('penalty-outcome-banner');
      if (banner) {
        banner.classList.remove('show', 'goal', 'saved', 'post', 'missed');
      }
    }

    updateStatsUI() {
      const goalsEl = document.getElementById('penalty-stat-goals');
      const shotsEl = document.getElementById('penalty-stat-shots');
      const savesEl = document.getElementById('penalty-stat-saves');
      const streakEl = document.getElementById('penalty-stat-streak');
      const accEl = document.getElementById('penalty-stat-acc');

      if (goalsEl) goalsEl.innerText = this.stats.goals;
      if (shotsEl) shotsEl.innerText = this.stats.shots;
      if (savesEl) savesEl.innerText = this.stats.saves;
      if (streakEl) streakEl.innerText = `🔥 ${this.stats.streak}`;
      if (accEl) {
        const acc = this.stats.shots > 0 ? Math.round((this.stats.goals / this.stats.shots) * 100) : 0;
        accEl.innerText = `${acc}%`;
      }
    }

    resetStats() {
      this.stats = { shots: 0, goals: 0, saves: 0, misses: 0, streak: 0, bestStreak: 0 };
      this.updateStatsUI();
      this.resetBall();
      this.resetKeeper();
    }

    /* ==========================================================================
       Goalkeeper Updates & Physics
       ========================================================================== */

    updateKeeper(dt) {
      const targetBaseY = this.goal.bottom - this.keeper.height * 0.52;

      if (this.keeper.state === 'idle') {
        this.keeper.idleTimer += dt * 3.5;
        // Bouncing on toes
        this.keeper.x = this.width / 2 + Math.sin(this.keeper.idleTimer) * (this.goal.width * 0.08);
        this.keeper.y = targetBaseY + Math.abs(Math.sin(this.keeper.idleTimer * 2)) * 6;
      } else if (this.keeper.state === 'diving') {
        // Move swiftly towards dive target
        const dx = this.keeper.targetX - this.keeper.x;
        const dy = this.keeper.targetY - this.keeper.y;

        this.keeper.x += dx * 0.16;
        this.keeper.y += dy * 0.16;

        this.keeper.diveProgress = Math.min(this.keeper.diveProgress + dt * 3.2, 1.0);
      } else if (this.keeper.state === 'celebrating') {
        // Keeper pumps fist
        this.keeper.y = targetBaseY - Math.abs(Math.sin(Date.now() * 0.008)) * 14;
      }
    }

    /* ==========================================================================
       Net Mesh Springs
       ========================================================================== */

    distortNetMesh(impactX, impactY) {
      // Find closest net nodes and displace them backwards
      const normX = (impactX - this.goal.left) / this.goal.width;
      const normY = (impactY - this.goal.top) / this.goal.height;

      for (let r = 0; r <= this.netRows; r++) {
        for (let c = 0; c <= this.netCols; c++) {
          const node = this.netNodes[r][c];
          const dist = Math.hypot(node.originX - normX, node.originY - normY);
          if (dist < 0.35) {
            const force = (0.35 - dist) * 45;
            node.dispY += force * 0.6;
            node.dispX += (node.originX - normX) * force * 0.8;
          }
        }
      }
    }

    updateNetMesh() {
      for (let r = 0; r <= this.netRows; r++) {
        for (let c = 0; c <= this.netCols; c++) {
          const node = this.netNodes[r][c];
          // Spring back to 0 displacement
          node.dispX *= 0.90;
          node.dispY *= 0.90;
        }
      }
    }

    /* ==========================================================================
       Rendering: Stadium, Goal, Net, Keeper, Ball, Effects
       ========================================================================== */

    render() {
      const ctx = this.ctx;
      ctx.save();

      // Screen shake translation
      if (this.screenShake > 0) {
        const shakeX = (Math.random() - 0.5) * this.screenShake;
        const shakeY = (Math.random() - 0.5) * this.screenShake;
        ctx.translate(shakeX, shakeY);
      }

      ctx.clearRect(0, 0, this.width, this.height);

      // 1. Draw Stadium Night Backdrop
      this.drawStadiumSky(ctx);

      // 2. Draw Pitch & Penalty Box
      this.drawPitch(ctx);

      // 3. Draw 3D Net
      this.drawGoalNet(ctx);

      // 4. Draw Goalkeeper
      this.drawGoalkeeper(ctx);

      // 5. Draw Goal Frame (Posts & Crossbar)
      this.drawGoalPosts(ctx);

      // 6. Draw Ball Shadow & Ball
      this.drawBall(ctx);

      // 7. Draw Aiming Reticle / Swipe Guide
      this.drawAimingGuide(ctx);

      ctx.restore();
    }

    drawStadiumSky(ctx) {
      const w = this.width;
      const h = this.height;
      const horizon = this.goal.bottom - 40;

      // Dark night arena gradient
      const skyGrad = ctx.createLinearGradient(0, 0, 0, horizon);
      skyGrad.addColorStop(0, '#04060b');
      skyGrad.addColorStop(0.5, '#0a0f1d');
      skyGrad.addColorStop(1, '#111a30');
      ctx.fillStyle = skyGrad;
      ctx.fillRect(0, 0, w, horizon);

      // Stadium Grandstands Silhouette & Crowd Lights
      ctx.fillStyle = '#070a14';
      ctx.fillRect(0, horizon - 90, w, 90);

      // Floodlights Glow Flares
      this.drawFloodlight(ctx, w * 0.12, horizon - 120);
      this.drawFloodlight(ctx, w * 0.88, horizon - 120);
      this.drawFloodlight(ctx, w * 0.35, horizon - 130);
      this.drawFloodlight(ctx, w * 0.65, horizon - 130);

      // Crowd camera flashes / atmospheric dots
      ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
      for (let i = 0; i < 24; i++) {
        if (Math.random() > 0.88) {
          const fx = (i / 24) * w + (Math.random() - 0.5) * 40;
          const fy = horizon - 75 + Math.random() * 50;
          ctx.beginPath();
          ctx.arc(fx, fy, Math.random() * 2 + 1, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }

    drawFloodlight(ctx, x, y) {
      // Light tower fixture
      ctx.fillStyle = '#1e2840';
      ctx.fillRect(x - 14, y, 28, 14);

      // Intense atmospheric beam & flare
      const flare = ctx.createRadialGradient(x, y + 7, 0, x, y + 7, 160);
      flare.addColorStop(0, 'rgba(210, 240, 255, 0.55)');
      flare.addColorStop(0.2, 'rgba(0, 240, 255, 0.22)');
      flare.addColorStop(1, 'rgba(0, 240, 255, 0)');
      ctx.fillStyle = flare;
      ctx.beginPath();
      ctx.arc(x, y + 7, 160, 0, Math.PI * 2);
      ctx.fill();
    }

    drawPitch(ctx) {
      const w = this.width;
      const h = this.height;
      const pitchTop = this.goal.bottom - 20;

      // 3D Perspective Pitch with Lawn Stripes
      const stripes = 12;
      for (let i = 0; i < stripes; i++) {
        const y1 = pitchTop + (i / stripes) * (h - pitchTop);
        const y2 = pitchTop + ((i + 1) / stripes) * (h - pitchTop);

        ctx.fillStyle = i % 2 === 0 ? '#114925' : '#0c3a1c';
        ctx.fillRect(0, y1, w, y2 - y1);
      }

      // Pitch lighting vignette
      const pitchGlow = ctx.createRadialGradient(w / 2, pitchTop + 60, 40, w / 2, h * 0.8, w * 0.7);
      pitchGlow.addColorStop(0, 'rgba(0, 255, 140, 0.12)');
      pitchGlow.addColorStop(1, 'rgba(0, 0, 0, 0.5)');
      ctx.fillStyle = pitchGlow;
      ctx.fillRect(0, pitchTop, w, h - pitchTop);

      // Pitch Markings: Goal line, Penalty box, Penalty spot
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.65)';
      ctx.lineWidth = 3;

      // Goal line
      ctx.beginPath();
      ctx.moveTo(this.goal.left - 60, this.goal.bottom);
      ctx.lineTo(this.goal.right + 60, this.goal.bottom);
      ctx.stroke();

      // 6-yard / Goal Area Box in perspective
      const boxLeft = this.goal.left - 35;
      const boxRight = this.goal.right + 35;
      const boxBottom = this.goal.bottom + (h - this.goal.bottom) * 0.28;

      ctx.beginPath();
      ctx.moveTo(boxLeft, this.goal.bottom);
      ctx.lineTo(boxLeft - 18, boxBottom);
      ctx.lineTo(boxRight + 18, boxBottom);
      ctx.lineTo(boxRight, this.goal.bottom);
      ctx.stroke();

      // Penalty Spot (White circle on turf)
      const spotX = w / 2;
      const spotY = h * 0.88;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.ellipse(spotX, spotY, 6, 3, 0, 0, Math.PI * 2);
      ctx.fill();

      // Penalty Arc segment at bottom
      ctx.beginPath();
      ctx.ellipse(spotX, spotY - 30, 80, 25, 0, 0, Math.PI);
      ctx.stroke();
    }

    drawGoalNet(ctx) {
      const gl = this.goal.left;
      const gr = this.goal.right;
      const gt = this.goal.top;
      const gb = this.goal.bottom;
      const depth = this.goal.depth;

      // Back frame coordinates (further away in depth)
      const bLeft = gl + depth * 0.25;
      const bRight = gr - depth * 0.25;
      const bTop = gt - depth * 0.35;
      const bBottom = gb - depth * 0.1;

      // Draw rear dark net backing
      ctx.fillStyle = 'rgba(6, 12, 22, 0.55)';
      ctx.beginPath();
      ctx.moveTo(bLeft, bTop);
      ctx.lineTo(bRight, bTop);
      ctx.lineTo(bRight, bBottom);
      ctx.lineTo(bLeft, bBottom);
      ctx.closePath();
      ctx.fill();

      // Dynamic Net Mesh Lines
      ctx.strokeStyle = 'rgba(240, 248, 255, 0.35)';
      ctx.lineWidth = 1;

      // Horizontal cords
      for (let r = 0; r <= this.netRows; r++) {
        ctx.beginPath();
        for (let c = 0; c <= this.netCols; c++) {
          const node = this.netNodes[r][c];
          // Interpolate between front frame and back frame
          const frontX = gl + node.originX * (gr - gl);
          const frontY = gt + node.originY * (gb - gt);
          const backX = bLeft + node.originX * (bRight - bLeft);
          const backY = bTop + node.originY * (bBottom - bTop);

          const px = (frontX * 0.4 + backX * 0.6) + node.dispX;
          const py = (frontY * 0.4 + backY * 0.6) + node.dispY;

          if (c === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.stroke();
      }

      // Vertical cords
      for (let c = 0; c <= this.netCols; c++) {
        ctx.beginPath();
        for (let r = 0; r <= this.netRows; r++) {
          const node = this.netNodes[r][c];
          const frontX = gl + node.originX * (gr - gl);
          const frontY = gt + node.originY * (gb - gt);
          const backX = bLeft + node.originX * (bRight - bLeft);
          const backY = bTop + node.originY * (bBottom - bTop);

          const px = (frontX * 0.4 + backX * 0.6) + node.dispX;
          const py = (frontY * 0.4 + backY * 0.6) + node.dispY;

          if (r === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.stroke();
      }
    }

    drawGoalPosts(ctx) {
      const gl = this.goal.left;
      const gr = this.goal.right;
      const gt = this.goal.top;
      const gb = this.goal.bottom;
      const pr = this.goal.postRadius;

      // Realistic Metallic Tubular Shading
      const postGrad = ctx.createLinearGradient(gl - pr, 0, gl + pr, 0);
      postGrad.addColorStop(0, '#8892a0');
      postGrad.addColorStop(0.3, '#ffffff');
      postGrad.addColorStop(0.7, '#f0f3f8');
      postGrad.addColorStop(1, '#566070');

      ctx.fillStyle = postGrad;

      // Left post
      ctx.beginPath();
      ctx.roundRect(gl - pr, gt - pr, pr * 2, (gb - gt) + pr * 2, pr);
      ctx.fill();

      // Right post
      const rPostGrad = ctx.createLinearGradient(gr - pr, 0, gr + pr, 0);
      rPostGrad.addColorStop(0, '#8892a0');
      rPostGrad.addColorStop(0.3, '#ffffff');
      rPostGrad.addColorStop(0.7, '#f0f3f8');
      rPostGrad.addColorStop(1, '#566070');
      ctx.fillStyle = rPostGrad;
      ctx.beginPath();
      ctx.roundRect(gr - pr, gt - pr, pr * 2, (gb - gt) + pr * 2, pr);
      ctx.fill();

      // Crossbar
      const barGrad = ctx.createLinearGradient(0, gt - pr, 0, gt + pr);
      barGrad.addColorStop(0, '#8892a0');
      barGrad.addColorStop(0.3, '#ffffff');
      barGrad.addColorStop(0.7, '#f0f3f8');
      barGrad.addColorStop(1, '#566070');
      ctx.fillStyle = barGrad;
      ctx.beginPath();
      ctx.roundRect(gl - pr, gt - pr, (gr - gl) + pr * 2, pr * 2, pr);
      ctx.fill();

      // Corner Joint highlights
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(gl, gt, pr * 1.15, 0, Math.PI * 2);
      ctx.arc(gr, gt, pr * 1.15, 0, Math.PI * 2);
      ctx.fill();
    }

    drawGoalkeeper(ctx) {
      const k = this.keeper;
      const x = k.x;
      const y = k.y;
      const w = k.width;
      const h = k.height;

      ctx.save();
      ctx.translate(x, y);

      // Keeper shadow on turf
      ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
      ctx.beginPath();
      ctx.ellipse(0, h * 0.46, w * 0.65, 8, 0, 0, Math.PI * 2);
      ctx.fill();

      // If diving, apply rotation towards dive direction
      if (k.state === 'diving' || k.state === 'saved') {
        const angle = (k.targetX > this.width / 2 ? 1 : -1) * (k.diveProgress * 0.95);
        ctx.rotate(angle);
      }

      // Keeper Body Rendering
      // Jersey (Fluorescent Yellow-Green / Cyan Goalkeeper Kit)
      const jerseyGrad = ctx.createLinearGradient(-w * 0.35, -h * 0.3, w * 0.35, h * 0.2);
      jerseyGrad.addColorStop(0, '#eaff00');
      jerseyGrad.addColorStop(1, '#00e575');
      ctx.fillStyle = jerseyGrad;

      // Torso
      ctx.beginPath();
      ctx.roundRect(-w * 0.32, -h * 0.28, w * 0.64, h * 0.45, 8);
      ctx.fill();

      // Head & Hair
      ctx.fillStyle = '#f1c27d'; // Skin tone
      ctx.beginPath();
      ctx.arc(0, -h * 0.38, w * 0.22, 0, Math.PI * 2);
      ctx.fill();

      // Hair
      ctx.fillStyle = '#221915';
      ctx.beginPath();
      ctx.arc(0, -h * 0.41, w * 0.22, Math.PI, Math.PI * 2);
      ctx.fill();

      // Shorts (Black with neon stripe)
      ctx.fillStyle = '#111520';
      ctx.beginPath();
      ctx.roundRect(-w * 0.3, h * 0.16, w * 0.6, h * 0.22, 4);
      ctx.fill();

      // Legs
      ctx.fillStyle = '#f1c27d';
      ctx.fillRect(-w * 0.22, h * 0.36, w * 0.18, h * 0.14);
      ctx.fillRect(w * 0.04, h * 0.36, w * 0.18, h * 0.14);

      // Boots
      ctx.fillStyle = '#ff2a6d';
      ctx.fillRect(-w * 0.24, h * 0.46, w * 0.22, 8);
      ctx.fillRect(w * 0.02, h * 0.46, w * 0.22, 8);

      // Arms & Goalkeeper Gloves
      // Left arm & glove
      ctx.fillStyle = jerseyGrad;
      ctx.save();
      const armSpread = k.state === 'diving' ? -0.8 : -0.25;
      ctx.rotate(armSpread);
      ctx.fillRect(-w * 0.55, -h * 0.26, w * 0.22, h * 0.42);
      // Large Pro Goalkeeper Glove
      ctx.fillStyle = '#ffffff';
      ctx.strokeStyle = '#00f0ff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(-w * 0.46, h * 0.18, 14, 11, -0.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.restore();

      // Right arm & glove
      ctx.fillStyle = jerseyGrad;
      ctx.save();
      const rArmSpread = k.state === 'diving' ? 0.8 : 0.25;
      ctx.rotate(rArmSpread);
      ctx.fillRect(w * 0.33, -h * 0.26, w * 0.22, h * 0.42);
      ctx.fillStyle = '#ffffff';
      ctx.strokeStyle = '#00f0ff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(w * 0.46, h * 0.18, 14, 11, 0.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.restore();

      ctx.restore();
    }

    getCurrentBallRadius() {
      // Perspective scale: Ball shrinks as z approaches 1.0 (goal line)
      const scale = 1.0 - (this.ball.z * 0.62);
      return Math.max(8, this.ball.radius * scale);
    }

    drawBall(ctx) {
      const b = this.ball;
      const currentRadius = this.getCurrentBallRadius();

      // 1. Draw Ball Trail while flying
      if (b.trail.length > 1) {
        for (let i = 0; i < b.trail.length; i++) {
          const t = b.trail[i];
          ctx.fillStyle = `rgba(0, 240, 255, ${t.alpha * 0.35})`;
          ctx.beginPath();
          ctx.arc(t.x, t.y, t.radius * 0.85, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // 2. Ball Shadow on Pitch (scales and fades with elevation)
      const pitchGroundY = this.height * 0.88 - (b.z * (this.height * 0.88 - this.goal.bottom));
      const shadowY = Math.max(b.y, pitchGroundY);
      const elevation = Math.max(0, shadowY - b.y);
      const shadowScale = Math.max(0.4, 1.0 - (elevation / 200));

      ctx.fillStyle = `rgba(0, 0, 0, ${Math.max(0.12, 0.5 - elevation * 0.002)})`;
      ctx.beginPath();
      ctx.ellipse(b.x, shadowY, currentRadius * 1.15 * shadowScale, currentRadius * 0.4 * shadowScale, 0, 0, Math.PI * 2);
      ctx.fill();

      // 3. Realistic Soccer Ball Rendering
      ctx.save();
      ctx.translate(b.x, b.y);
      ctx.rotate(b.rotation);

      // Ball base sphere
      const sphereGrad = ctx.createRadialGradient(
        -currentRadius * 0.35, -currentRadius * 0.35, currentRadius * 0.1,
        0, 0, currentRadius
      );
      sphereGrad.addColorStop(0, '#ffffff');
      sphereGrad.addColorStop(0.7, '#e4e7ed');
      sphereGrad.addColorStop(1, '#838e9e');

      ctx.fillStyle = sphereGrad;
      ctx.beginPath();
      ctx.arc(0, 0, currentRadius, 0, Math.PI * 2);
      ctx.fill();

      // Pentagonal/Hexagonal Panels (Classic Match Ball Pattern)
      ctx.fillStyle = '#161922';
      const pSize = currentRadius * 0.36;

      // Center Pentagon
      this.drawPolygon(ctx, 0, 0, 5, pSize);

      // Perimeter surrounding panels
      for (let i = 0; i < 5; i++) {
        const ang = (i * Math.PI * 2) / 5 - Math.PI / 2;
        const px = Math.cos(ang) * (currentRadius * 0.72);
        const py = Math.sin(ang) * (currentRadius * 0.72);
        this.drawPolygon(ctx, px, py, 6, pSize * 0.65);
      }

      // Ball Outer Glow Highlight
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(0, 0, currentRadius - 0.75, 0, Math.PI * 2);
      ctx.stroke();

      ctx.restore();
    }

    drawPolygon(ctx, cx, cy, sides, radius) {
      ctx.beginPath();
      for (let i = 0; i < sides; i++) {
        const a = (i * Math.PI * 2) / sides;
        const x = cx + Math.cos(a) * radius;
        const y = cy + Math.sin(a) * radius;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.fill();
    }

    drawAimingGuide(ctx) {
      if (this.ball.state !== 'aiming' || !this.ball.isDragging) return;

      const bx = this.ball.x;
      const by = this.ball.y;
      const curX = this.ball.dragCurrentX;
      const curY = this.ball.dragCurrentY;

      // Calculate aiming trajectory in opposite/target direction
      let dx = curX - this.ball.dragStartX;
      let dy = curY - this.ball.dragStartY;

      // If user pulls back, trajectory points forward
      if (dy > 0) {
        dx = -dx;
        dy = -dy;
      }

      const dist = Math.hypot(dx, dy);
      const power = Math.min(dist / 80, 1.5);

      // Projected aim target
      const aimFactor = 2.4 * Math.max(power, 0.6);
      const targetX = bx + dx * aimFactor;
      const targetY = by + dy * aimFactor;

      // Dynamic Trajectory Arc
      ctx.save();
      ctx.setLineDash([8, 8]);
      ctx.strokeStyle = power > 1.2 ? '#ff2a6d' : (power > 0.8 ? '#ffc837' : '#00f0ff');
      ctx.lineWidth = 3;

      ctx.beginPath();
      ctx.moveTo(bx, by);
      ctx.quadraticCurveTo(
        (bx + targetX) / 2 + (dx * 0.2),
        Math.min(by, targetY) - 40,
        targetX,
        targetY
      );
      ctx.stroke();

      // Target Crosshair / Reticle
      ctx.setLineDash([]);
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(targetX, targetY, 14, 0, Math.PI * 2);
      ctx.stroke();

      // Crosshair center dot
      ctx.fillStyle = '#00f0ff';
      ctx.beginPath();
      ctx.arc(targetX, targetY, 4, 0, Math.PI * 2);
      ctx.fill();

      // Power Level Bar
      const barW = 120;
      const barH = 10;
      const barX = bx - barW / 2;
      const barY = by + 45;

      ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
      ctx.beginPath();
      ctx.roundRect(barX - 2, barY - 2, barW + 4, barH + 4, 6);
      ctx.fill();

      const powerFill = Math.min(1.0, power / 1.5);
      const pGrad = ctx.createLinearGradient(barX, 0, barX + barW, 0);
      pGrad.addColorStop(0, '#00f0ff');
      pGrad.addColorStop(0.7, '#ffc837');
      pGrad.addColorStop(1, '#ff2a6d');
      ctx.fillStyle = pGrad;
      ctx.beginPath();
      ctx.roundRect(barX, barY, barW * powerFill, barH, 4);
      ctx.fill();

      ctx.restore();
    }
  }

  // Initialize and attach to window
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      window.penaltyGame = new PenaltyShootoutGame();
    });
  } else {
    window.penaltyGame = new PenaltyShootoutGame();
  }
})();

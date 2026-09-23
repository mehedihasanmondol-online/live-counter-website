/**
 * Live Arena Counter - Penalty Shootout Mini-Game
 * Realistic 3D-Perspective Ball Physics, Goalkeeper AI, Net Simulation, Crowd Reactions & Live Score Sync
 * Features:
 * - Grandstand Spectator Area covered with Player Images (Messi & Ronaldo Fan Stands)
 * - Prominent Broadcast TV Kicker Showcase (Who is kicking, charging, scored, or missed)
 * - Physical Kicker Character rendered on the penalty spot with player photo & jersey
 * - Rich Celebratory Outcome Cards with Player Credit, Score Delta (+1), and Fan Stand Eruptions
 */

(function () {
  'use strict';

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

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

      // Player Image Cache
      this.playerImages = {}; // id -> HTMLImageElement
      this.lastScoredPlayerId = null;
      this.celebrationGlowTimer = 0;
      this.ledScrollOffset = 0;

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

      // Kicker Character state on the pitch
      this.kicker = {
        legAngle: 0,
        kickProgress: 0,
        breathTimer: 0
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
      this.penaltySpotY = 0;

      // Animation & Timing
      this.animId = null;
      this.lastTime = 0;
      this.resetTimer = null;
      this.screenShake = 0;
      this.lastKickTimestamp = 0;
      this.activePointerId = null;
      this.backdropPointerDown = false;

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
          this.preloadPlayerImages(players);
          this.updateShooterSelector(players);
        });
      }

      window.addEventListener('resize', this.handleResize);
    }

    preloadPlayerImages(players) {
      if (!players) return;
      players.forEach(p => {
        if (!this.playerImages[p.id] || this.playerImages[p.id].src !== p.avatar) {
          const img = new Image();
          img.src = p.avatar;
          this.playerImages[p.id] = img;
        }
      });
    }

    bindDOMEvents() {
      // Floating launcher button
      if (this.floatingBtnEl) {
        this.floatingBtnEl.addEventListener('click', () => this.openGame());
      }

      // Close modal button
      const closeBtn = document.getElementById('close-penalty-btn');
      if (closeBtn) {
        closeBtn.addEventListener('click', (e) => {
          // If a kick just occurred within 1200ms or ball is dragging, prevent accidental trigger
          if (this.ball.isDragging || Date.now() - this.lastKickTimestamp < 1200) {
            e.preventDefault();
            e.stopPropagation();
            return;
          }
          this.closeGame();
        });
      }

      // Close modal ONLY on deliberate backdrop click (both pointerdown AND click on backdrop itself)
      if (this.modalEl) {
        this.modalEl.addEventListener('pointerdown', (e) => {
          this.backdropPointerDown = (e.target === this.modalEl || (e.target.classList && e.target.classList.contains('penalty-modal-outer-layout')));
        });

        this.modalEl.addEventListener('click', (e) => {
          const wasBackdropStart = this.backdropPointerDown;
          this.backdropPointerDown = false;

          const isBackdropTarget = (e.target === this.modalEl || (e.target.classList && e.target.classList.contains('penalty-modal-outer-layout')));

          // Never close modal on backdrop if a shot was just taken or currently in flight or dragging
          if (
            wasBackdropStart &&
            isBackdropTarget &&
            !this.ball.isDragging &&
            this.ball.state !== 'flying' &&
            Date.now() - this.lastKickTimestamp > 1500
          ) {
            this.closeGame();
          }
        });

        // Prevent clicks & pointer events inside dialog from bubbling to the backdrop
        const dialogEl = this.modalEl.querySelector('.penalty-modal-dialog');
        if (dialogEl) {
          dialogEl.addEventListener('pointerdown', (e) => {
            this.backdropPointerDown = false;
          });
          dialogEl.addEventListener('click', (e) => {
            e.stopPropagation();
          });
        }
      }

      // Close on Escape key & 'P' toggle
      window.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && this.isOpen) {
          this.closeGame();
        }
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

      // Prevent pointer events on flank widgets from triggering canvas shooting or backdrop close
      const sideLeft = document.getElementById('penalty-side-left');
      const sideRight = document.getElementById('penalty-side-right');
      [sideLeft, sideRight].forEach(el => {
        if (el) {
          el.addEventListener('pointerdown', (e) => {
            this.backdropPointerDown = false;
            e.stopPropagation();
          });
          el.addEventListener('mousedown', (e) => e.stopPropagation());
          el.addEventListener('click', (e) => e.stopPropagation());
          el.addEventListener('touchstart', (e) => e.stopPropagation(), { passive: true });
        }
      });

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

      const players = window.arenaApp ? window.arenaApp.getPlayers() : [];
      this.preloadPlayerImages(players);
      this.syncActivePlayer();
      this.handleResize();
      this.resetBall();
      this.resetKeeper();
      this.setKickerStatus('ready');

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
       Player Selection & Prominent Kicker Showcase
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
      if (!players) return;

      // 1. Populate side-by-side player columns backdrop (Homepage Style)
      const backdrop = document.getElementById('penalty-players-backdrop');
      if (backdrop) {
        backdrop.innerHTML = '';
        players.forEach((p, idx) => {
          const isCurrent = p.id === this.activePlayerId;
          const col = document.createElement('div');
          col.className = `penalty-player-col ${isCurrent ? 'active' : ''}`;
          col.style.setProperty('--player-color', p.color);
          col.style.setProperty('--player-color-rgb', p.colorRgb || '0, 240, 255');
          col.setAttribute('title', `${p.name} - Score: ${p.score}`);

          // Default position: 50% 50% (Center of Image) or user-dragged position
          const posX = p.penaltyPosX !== undefined ? p.penaltyPosX : 50;
          const posY = p.penaltyPosY !== undefined ? p.penaltyPosY : 50;

          col.innerHTML = `
            <div class="penalty-col-bg">
              <img src="${p.avatar}" alt="${p.name}" class="penalty-col-photo" onerror="this.style.display='none'">
              <div class="penalty-col-gradient"></div>
              <div class="penalty-col-glow"></div>
            </div>
            <div class="penalty-col-header" title="Click to set ${escapeHtml(p.name)} as active striker">
              <div class="penalty-col-meta">
                <div class="avatar-wrapper">
                  <img src="${p.avatar}" alt="${p.name}" class="avatar-img" onerror="this.src='data:image/svg+xml,<svg xmlns=\\'http://www.w3.org/2000/svg\\' viewBox=\\'0 0 24 24\\'><circle cx=\\'12\\' cy=\\'12\\' r=\\'12\\' fill=\\'%23444\\'/></svg>'">
                  ${isCurrent ? '<span class="shooter-active-dot" title="Active Kicker">⚽</span>' : ''}
                </div>
                <div class="player-details">
                  <div class="player-title-row">
                    <span class="player-name">${escapeHtml(p.name)}</span>
                  </div>
                  <div class="player-sub-row">
                    <span class="player-tag">${escapeHtml(p.tag || `PLAYER ${idx + 1}`)}</span>
                    ${isCurrent ? '<span class="penalty-kicking-pill">⚽ KICKING</span>' : ''}
                  </div>
                </div>
              </div>
            </div>

            <!-- Big Draggable Counter Badge in Center of Player Image -->
            <div class="penalty-score-draggable-badge ${p.id === this.lastScoredPlayerId ? 'pop-up' : ''}" 
                 id="penalty-drag-${p.id}"
                 style="left: ${posX}%; top: ${posY}%;"
                 title="Drag to reposition counter anywhere on player image (Double click to re-center)">
              <span class="penalty-score-num" id="penalty-score-num-${p.id}">${p.score}</span>
            </div>
          `;

          // Header click switches striker
          const headerEl = col.querySelector('.penalty-col-header');
          if (headerEl) {
            headerEl.addEventListener('click', (e) => {
              e.stopPropagation();
              this.activePlayerId = p.id;
              this.updateShooterSelector(players);
              this.resetBall();
            });
          }

          // Draggable score badge logic (Just like homepage)
          const dragBadge = col.querySelector('.penalty-score-draggable-badge');
          if (dragBadge) {
            let startX = 0;
            let startY = 0;
            let isDragging = false;
            let badgeMoved = false;

            dragBadge.addEventListener('pointerdown', (e) => {
              e.stopPropagation();
              startX = e.clientX;
              startY = e.clientY;
              isDragging = true;
              badgeMoved = false;
              try {
                dragBadge.setPointerCapture(e.pointerId);
              } catch (err) {}
            });

            dragBadge.addEventListener('pointermove', (e) => {
              if (!isDragging) return;
              const dx = e.clientX - startX;
              const dy = e.clientY - startY;

              if (Math.hypot(dx, dy) > 4) {
                badgeMoved = true;
                dragBadge.classList.add('is-dragging');

                const colRect = col.getBoundingClientRect();
                const relX = e.clientX - colRect.left;
                const relY = e.clientY - colRect.top;

                // Clamp within column bounds
                const percentX = Math.max(18, Math.min(82, (relX / colRect.width) * 100));
                const percentY = Math.max(22, Math.min(78, (relY / colRect.height) * 100));

                dragBadge.style.left = `${percentX.toFixed(2)}%`;
                dragBadge.style.top = `${percentY.toFixed(2)}%`;
              }
            });

            const finishDrag = (e) => {
              if (!isDragging) return;
              isDragging = false;
              dragBadge.classList.remove('is-dragging');

              try {
                if (e && e.pointerId !== undefined) {
                  dragBadge.releasePointerCapture(e.pointerId);
                }
              } catch (err) {}

              if (badgeMoved) {
                p.penaltyPosX = parseFloat(dragBadge.style.left);
                p.penaltyPosY = parseFloat(dragBadge.style.top);
                if (window.arenaApp && window.arenaApp.saveState) {
                  window.arenaApp.saveState();
                }
              } else {
                // If tapped without dragging -> switch active striker to this player
                if (this.activePlayerId !== p.id) {
                  this.activePlayerId = p.id;
                  this.updateShooterSelector(players);
                  this.resetBall();
                }
              }
            };

            dragBadge.addEventListener('pointerup', finishDrag);
            dragBadge.addEventListener('pointercancel', (e) => {
              isDragging = false;
              dragBadge.classList.remove('is-dragging');
              try {
                if (e && e.pointerId !== undefined) {
                  dragBadge.releasePointerCapture(e.pointerId);
                }
              } catch (err) {}
            });

            // Double click to re-center
            dragBadge.addEventListener('dblclick', (e) => {
              e.stopPropagation();
              p.penaltyPosX = 50;
              p.penaltyPosY = 50;
              dragBadge.style.left = '50%';
              dragBadge.style.top = '50%';
              if (window.arenaApp && window.arenaApp.saveState) {
                window.arenaApp.saveState();
              }
            });
          }

          backdrop.appendChild(col);
        });

        // Add 3X Championship VS divider if exactly 2 players (like homepage)
        if (players.length === 2) {
          const vs = document.createElement('div');
          vs.className = 'penalty-vs-divider';
          vs.innerText = 'VS';
          backdrop.appendChild(vs);
        }
      }

      // 2. Fallback legacy container update if present
      const container = document.getElementById('penalty-shooter-pills');
      if (container) {
        container.innerHTML = '';
        players.forEach(p => {
          const isCurrent = p.id === this.activePlayerId;
          const pill = document.createElement('button');
          pill.className = `shooter-pill ${isCurrent ? 'active' : ''}`;
          pill.style.setProperty('--shooter-color', p.color);
          pill.setAttribute('type', 'button');
          pill.setAttribute('title', `${p.name} - Score: ${p.score} (Click to set as active striker)`);
          pill.innerHTML = `
            <div class="shooter-identity">
              <div class="shooter-avatar-wrap">
                <img src="${p.avatar}" alt="${p.name}" class="shooter-avatar" onerror="this.src='data:image/svg+xml,<svg xmlns=\\'http://www.w3.org/2000/svg\\' viewBox=\\'0 0 24 24\\'><circle cx=\\'12\\' cy=\\'12\\' r=\\'12\\' fill=\\'%23444\\'/></svg>'">
                ${isCurrent ? '<span class="shooter-active-dot" title="Active Kicker">⚽</span>' : ''}
              </div>
              <div class="shooter-info">
                <div class="shooter-name-row">
                  <span class="shooter-name">${escapeHtml(p.name)}</span>
                  ${isCurrent ? '<span class="shooter-kicking-pill">KICKING ⚽</span>' : ''}
                </div>
                <span class="shooter-tag">${escapeHtml(p.tag || 'PLAYER')}</span>
              </div>
            </div>
            <div class="shooter-score-box">
              <span class="shooter-score-tag">SCORE</span>
              <span class="shooter-score-big" id="shooter-score-num-${p.id}">${p.score}</span>
            </div>
          `;
          pill.addEventListener('click', () => {
            this.activePlayerId = p.id;
            this.updateShooterSelector(players);
            this.resetBall();
          });
          container.appendChild(pill);
        });
      }

      // 3. Update Big Broadcast TV Kicker Showcase Card
      const activeP = players.find(p => p.id === this.activePlayerId) || players[0];
      if (activeP) {
        const avatarEl = document.getElementById('kicker-avatar-big');
        const nameEl = document.getElementById('kicker-name-huge');
        const tagEl = document.getElementById('kicker-tag');
        const scoreEl = document.getElementById('kicker-score-val');
        const cardEl = document.getElementById('penalty-broadcast-kicker-card');
        const numberEl = document.getElementById('kicker-number-badge');

        if (avatarEl) avatarEl.src = activeP.avatar;
        if (nameEl) {
          nameEl.innerText = activeP.name.toUpperCase();
          nameEl.style.textShadow = `0 0 16px ${activeP.color}88`;
        }
        if (tagEl) tagEl.innerText = activeP.tag || 'PRO 10';
        if (scoreEl) scoreEl.innerText = activeP.score;
        if (cardEl) {
          cardEl.style.borderColor = `${activeP.color}66`;
          cardEl.style.boxShadow = `0 12px 35px rgba(0, 0, 0, 0.7), 0 0 25px ${activeP.color}33`;
        }
        if (numberEl) {
          const numMatch = (activeP.tag || '').match(/\d+/);
          numberEl.innerText = numMatch ? numMatch[0] : (activeP.name.includes('Messi') ? '10' : '7');
          numberEl.style.background = activeP.color;
        }
      }
    }

    setKickerStatus(state, customMsg = null) {
      const iconEl = document.getElementById('kicker-status-icon');
      const msgEl = document.getElementById('kicker-status-msg');
      const pillEl = document.getElementById('kicker-live-status-pill');
      if (!msgEl || !iconEl || !pillEl) return;

      const players = window.arenaApp ? window.arenaApp.getPlayers() : [];
      const activeP = players.find(p => p.id === this.activePlayerId) || { name: 'Player' };

      pillEl.className = 'kicker-live-status-pill';

      if (state === 'ready') {
        iconEl.innerText = '⚽';
        msgEl.innerText = customMsg || `READY TO KICK • DRAG OR TAP BALL`;
      } else if (state === 'aiming') {
        pillEl.classList.add('aiming');
        iconEl.innerText = '🎯';
        msgEl.innerText = customMsg || `AIMING & CHARGING SHOT...`;
      } else if (state === 'kicked') {
        pillEl.classList.add('kicked');
        iconEl.innerText = '⚡';
        msgEl.innerText = customMsg || `${activeP.name.toUpperCase()} STRUCK THE BALL!`;
      } else if (state === 'goal') {
        pillEl.classList.add('goal');
        iconEl.innerText = '🏆';
        msgEl.innerText = customMsg || `GOAAAL! SCORED BY ${activeP.name.toUpperCase()} (+1)`;
      } else if (state === 'saved') {
        pillEl.classList.add('saved');
        iconEl.innerText = '🧤';
        msgEl.innerText = customMsg || `SAVED! ${activeP.name.toUpperCase()} DENIED BY KEEPER`;
      } else if (state === 'post') {
        pillEl.classList.add('aiming');
        iconEl.innerText = '🔔';
        msgEl.innerText = customMsg || `${activeP.name.toUpperCase()} HIT THE WOODWORK!`;
      } else if (state === 'missed') {
        pillEl.classList.add('saved');
        iconEl.innerText = '❌';
        msgEl.innerText = customMsg || `${activeP.name.toUpperCase()} MISSED THE TARGET`;
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

      // Calculate goal coordinates based on canvas size - elevated right below backdrop
      const isMobile = this.width < 768;
      const goalWidth = Math.min(this.width * (isMobile ? 0.65 : 0.56), 520);
      const goalHeight = goalWidth * 0.44;
      const goalLeft = (this.width - goalWidth) / 2;
      const goalRight = goalLeft + goalWidth;

      const backdropHeight = this.height * (isMobile ? 0.38 : 0.44);
      const goalTop = backdropHeight + 10;
      const goalBottom = goalTop + goalHeight;

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

      // Elevated penalty spot & ball coordinates
      this.penaltySpotY = Math.min(this.height * 0.79, goalBottom + (this.height - goalBottom) * 0.56);

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
      this.ball.x = this.width / 2;
      this.ball.y = this.penaltySpotY || (this.height * 0.79);
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

      this.kicker.legAngle = 0;
      this.kicker.kickProgress = 0;

      this.setKickerStatus('ready');
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

      // If tapped in the upper player columns backdrop area, switch active striker
      if (this.goal && pos.y < this.goal.top + 30) {
        const players = window.arenaApp ? window.arenaApp.getPlayers() : [];
        if (players.length > 0) {
          const colW = this.width / players.length;
          const clickedIdx = Math.min(players.length - 1, Math.max(0, Math.floor(pos.x / colW)));
          const targetPlayer = players[clickedIdx];
          if (targetPlayer && targetPlayer.id !== this.activePlayerId) {
            this.activePlayerId = targetPlayer.id;
            this.updateShooterSelector(players);
            this.resetBall();
            return;
          }
        }
      }

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
        this.setKickerStatus('aiming');

        // Capture pointer to canvas so fast flicks outside never trigger clicks on modal backdrop/header
        if (e && e.pointerId !== undefined && this.canvas.setPointerCapture) {
          try {
            this.canvas.setPointerCapture(e.pointerId);
            this.activePointerId = e.pointerId;
          } catch (err) {}
        }

        if (e.preventDefault) e.preventDefault();
        if (e.stopPropagation) e.stopPropagation();
      }
    }

    handlePointerMove(e) {
      if (!this.ball.isDragging || this.ball.state !== 'aiming') return;

      const pos = this.getCanvasPointerPos(e);
      this.ball.dragCurrentX = pos.x;
      this.ball.dragCurrentY = pos.y;

      const dy = pos.y - this.ball.dragStartY;
      const dx = pos.x - this.ball.dragStartX;
      const dist = Math.hypot(dx, dy);
      this.kicker.legAngle = Math.min(dist / 60, 1.2);

      if (e.preventDefault) e.preventDefault();
    }

    handlePointerUp(e) {
      if (!this.ball.isDragging || this.ball.state !== 'aiming') return;

      // Cleanly release pointer capture
      if (this.activePointerId !== null && this.canvas.releasePointerCapture) {
        try {
          this.canvas.releasePointerCapture(this.activePointerId);
        } catch (err) {}
        this.activePointerId = null;
      }

      this.ball.isDragging = false;
      this.lastKickTimestamp = Date.now();

      if (e) {
        if (e.preventDefault) e.preventDefault();
        if (e.stopPropagation) e.stopPropagation();
      }

      const pos = this.getCanvasPointerPos(e);

      let deltaX = pos.x - this.ball.dragStartX;
      let deltaY = pos.y - this.ball.dragStartY;

      if (deltaY > 20 && Math.abs(deltaY) > Math.abs(deltaX)) {
        deltaX = -deltaX;
        deltaY = -deltaY;
      }

      const swipeDistance = Math.hypot(deltaX, deltaY);
      if (swipeDistance < 15) {
        this.shootTowardsTarget(pos.x, pos.y);
        return;
      }

      this.launchBall(deltaX, deltaY, swipeDistance);
    }

    shootTowardsTarget(targetX, targetY) {
      const deltaX = targetX - this.ball.x;
      const deltaY = targetY - this.ball.y;
      const dist = Math.hypot(deltaX, deltaY);
      this.launchBall(deltaX, deltaY, Math.min(dist * 0.45, 140));
    }

    launchBall(deltaX, deltaY, powerMag) {
      this.ball.state = 'flying';
      this.lastKickTimestamp = Date.now();
      this.setKickerStatus('kicked');
      this.kicker.kickProgress = 1.0;

      const clampedPower = Math.min(Math.max(powerMag / 80, 0.6), 1.5);
      const aimFactor = 2.4 * clampedPower;
      const targetScreenX = this.ball.x + deltaX * aimFactor;
      const targetScreenY = this.ball.y + deltaY * aimFactor;

      this.ball.vz = 0.024 * (0.8 + clampedPower * 0.4);
      this.ball.vx = (targetScreenX - this.ball.x) * this.ball.vz;
      this.ball.vy = (targetScreenY - this.ball.y) * this.ball.vz;
      this.ball.spin = (deltaX / 120) * 0.8;

      if (this.soundEnabled && window.soundEngine && window.soundEngine.playKick) {
        window.soundEngine.playKick(clampedPower);
      }

      this.triggerKeeperDive(targetScreenX, targetScreenY, clampedPower);
    }

    /* ==========================================================================
       Goalkeeper AI & Trajectory Prediction
       ========================================================================== */

    triggerKeeperDive(targetX, targetY, power) {
      const reactionDelay = 80 + Math.random() * 80;

      setTimeout(() => {
        if (this.ball.state !== 'flying') return;

        const readsCorrect = Math.random() < 0.66;
        let diveTargetX = targetX;
        let diveTargetY = targetY;

        if (!readsCorrect) {
          const wrongDirection = targetX > this.width / 2 ? -1 : 1;
          diveTargetX = this.width / 2 + wrongDirection * (this.goal.width * 0.35);
          diveTargetY = this.goal.bottom - Math.random() * this.goal.height * 0.6;
        }

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
      // Screen shake
      if (this.screenShake > 0) {
        this.screenShake *= 0.88;
        if (this.screenShake < 0.2) this.screenShake = 0;
      }

      // Fan stand celebration glow timer
      if (this.celebrationGlowTimer > 0) {
        this.celebrationGlowTimer -= dt;
      }

      // LED Marquee animation
      this.ledScrollOffset += dt * 38;

      // Kicker breathing
      this.kicker.breathTimer += dt * 3;

      // Net springs
      this.updateNetMesh();

      // Keeper
      this.updateKeeper(dt);

      // Ball Physics
      if (this.ball.state === 'flying') {
        this.updateBallFlying(dt);
      } else if (this.ball.state === 'goal') {
        this.ball.vy += 0.2;
        this.ball.x += this.ball.vx * 0.2;
        this.ball.y += this.ball.vy * 0.2;
        this.ball.y = Math.min(this.ball.y, this.goal.bottom - 10);
      } else if (this.ball.state === 'post' || this.ball.state === 'saved') {
        this.ball.x += this.ball.vx;
        this.ball.y += this.ball.vy;
        this.ball.vy += 0.4;
        if (this.ball.y > this.height - 20) {
          this.ball.y = this.height - 20;
          this.ball.vy = -this.ball.vy * 0.45;
          this.ball.vx *= 0.7;
        }
      }
    }

    updateBallFlying(dt) {
      this.ball.vx += this.ball.spin * 0.35;
      this.ball.x += this.ball.vx;
      this.ball.y += this.ball.vy;
      this.ball.z += this.ball.vz;

      this.ball.vy += 0.12 * (this.ball.z * 1.5);
      this.ball.rotation += 0.18 + this.ball.spin * 0.1;

      if (this.ball.trail.length > 18) this.ball.trail.shift();
      this.ball.trail.push({
        x: this.ball.x,
        y: this.ball.y,
        z: this.ball.z,
        radius: this.getCurrentBallRadius(),
        alpha: 0.65
      });

      this.ball.trail.forEach(t => t.alpha *= 0.92);

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

      // 1. Post & Crossbar (Woodwork)
      const hitLeftPost = Math.hypot(bx - gl, by - Math.max(gt, Math.min(gb, by))) < (ballRad + pr);
      const hitRightPost = Math.hypot(bx - gr, by - Math.max(gt, Math.min(gb, by))) < (ballRad + pr);
      const hitCrossbar = (bx >= gl - pr && bx <= gr + pr) && Math.abs(by - gt) < (ballRad + pr);

      if (hitLeftPost || hitRightPost || hitCrossbar) {
        this.handleOutcome('post', bx, by);
        return;
      }

      // 2. Off target
      const isOutsideLeft = bx < gl - ballRad;
      const isOutsideRight = bx > gr + ballRad;
      const isOverBar = by < gt - ballRad;

      if (isOutsideLeft || isOutsideRight || isOverBar) {
        this.handleOutcome('missed', bx, by);
        return;
      }

      // 3. Goalkeeper Save Hitbox
      const keeperHit = this.checkKeeperSave(bx, by, ballRad);
      if (keeperHit) {
        this.handleOutcome('saved', bx, by);
      } else {
        this.handleOutcome('goal', bx, by);
      }
    }

    checkKeeperSave(bx, by, ballRad) {
      if (this.keeper.state !== 'diving' && this.keeper.state !== 'idle') return false;

      const kx = this.keeper.x;
      const ky = this.keeper.y;
      const reachW = this.keeper.width * 1.35;
      const reachH = this.keeper.height * 1.25;
      const dist = Math.hypot(bx - kx, by - ky);

      return dist < (reachW * 0.5 + ballRad);
    }

    /* ==========================================================================
       Outcome Director & Celebrations
       ========================================================================== */

    handleOutcome(type, impactX, impactY) {
      if (this.resetTimer) clearTimeout(this.resetTimer);

      const players = window.arenaApp ? window.arenaApp.getPlayers() : [];
      const activeP = players.find(p => p.id === this.activePlayerId) || players[0];

      if (type === 'goal') {
        this.ball.state = 'goal';
        this.ball.vx *= 0.15;
        this.ball.vy *= 0.15;
        this.ball.vz = 0;

        this.distortNetMesh(impactX, impactY);

        this.stats.shots++;
        this.stats.goals++;
        this.stats.streak++;
        if (this.stats.streak > this.stats.bestStreak) {
          this.stats.bestStreak = this.stats.streak;
        }

        this.screenShake = 18;
        this.keeper.state = 'beaten';
        this.lastScoredPlayerId = this.activePlayerId;
        this.celebrationGlowTimer = 3.2;

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

        // Increment active player's score by +1 in the live counter!
        if (this.activePlayerId && window.arenaApp && window.arenaApp.modifyScore) {
          window.arenaApp.modifyScore(this.activePlayerId, 1);
        }

        this.setKickerStatus('goal');
        this.showOutcomeBanner('goal', activeP);

      } else if (type === 'saved') {
        this.ball.state = 'saved';
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

        this.setKickerStatus('saved');
        this.showOutcomeBanner('saved', activeP);

      } else if (type === 'post') {
        this.ball.state = 'post';
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

        this.setKickerStatus('post');
        this.showOutcomeBanner('post', activeP);

      } else if (type === 'missed') {
        this.ball.state = 'missed';
        this.stats.shots++;
        this.stats.misses++;
        this.stats.streak = 0;

        if (this.soundEnabled && window.soundEngine && window.soundEngine.playCrowdGroan) {
          window.soundEngine.playCrowdGroan();
        }

        this.setKickerStatus('missed');
        this.showOutcomeBanner('missed', activeP);
      }

      this.updateStatsUI();

      // Advance turn & reset after 2.8s
      this.resetTimer = setTimeout(() => {
        this.advanceToNextPlayer();
        this.resetBall();
        this.resetKeeper();
      }, 2800);
    }

    showOutcomeBanner(type, player) {
      const banner = document.getElementById('penalty-outcome-banner');
      const avatarEl = document.getElementById('outcome-avatar-img');
      const titleEl = document.getElementById('outcome-main-title');
      const creditEl = document.getElementById('outcome-player-credit');
      const scoreEl = document.getElementById('outcome-score-update');
      const streakEl = document.getElementById('outcome-streak-badge');

      if (!banner || !player) return;

      banner.className = `penalty-outcome-banner show ${type}`;
      if (avatarEl) avatarEl.src = player.avatar;

      if (type === 'goal') {
        if (titleEl) titleEl.innerText = 'GOAAAL! ⚽🔥';
        if (creditEl) creditEl.innerText = `SCORED BY: ${player.name.toUpperCase()}`;
        if (scoreEl) scoreEl.innerText = `ARENA SCORE: ${player.score} (+1)`;
        if (streakEl) {
          streakEl.innerText = this.stats.streak > 1 ? `🔥 ${this.stats.streak} IN A ROW!` : '⭐ SPECTACULAR FINISH!';
        }
      } else if (type === 'saved') {
        if (titleEl) titleEl.innerText = 'SAVED BY KEEPER! 🧤⛔';
        if (creditEl) creditEl.innerText = `DENIED: ${player.name.toUpperCase()}`;
        if (scoreEl) scoreEl.innerText = `SCORE REMAINS: ${player.score}`;
        if (streakEl) streakEl.innerText = 'Goalkeeper guessed the corner!';
      } else if (type === 'post') {
        if (titleEl) titleEl.innerText = 'HIT THE WOODWORK! 🔔💥';
        if (creditEl) creditEl.innerText = `${player.name.toUpperCase()} HIT THE POST`;
        if (scoreEl) scoreEl.innerText = `SCORE REMAINS: ${player.score}`;
        if (streakEl) streakEl.innerText = 'Agonizingly close to the net!';
      } else if (type === 'missed') {
        if (titleEl) titleEl.innerText = 'OFF TARGET! ❌';
        if (creditEl) creditEl.innerText = `${player.name.toUpperCase()} MISSED`;
        if (scoreEl) scoreEl.innerText = `SCORE REMAINS: ${player.score}`;
        if (streakEl) streakEl.innerText = 'Ball flew outside the posts!';
      }
    }

    hideOutcomeBanner() {
      const banner = document.getElementById('penalty-outcome-banner');
      if (banner) {
        banner.className = 'penalty-outcome-banner';
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

      // Also refresh the big broadcast score
      const players = window.arenaApp ? window.arenaApp.getPlayers() : [];
      const activeP = players.find(p => p.id === this.activePlayerId);
      const kickerScoreEl = document.getElementById('kicker-score-val');
      if (kickerScoreEl && activeP) kickerScoreEl.innerText = activeP.score;
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
        this.keeper.x = this.width / 2 + Math.sin(this.keeper.idleTimer) * (this.goal.width * 0.08);
        this.keeper.y = targetBaseY + Math.abs(Math.sin(this.keeper.idleTimer * 2)) * 6;
      } else if (this.keeper.state === 'diving') {
        const dx = this.keeper.targetX - this.keeper.x;
        const dy = this.keeper.targetY - this.keeper.y;
        this.keeper.x += dx * 0.16;
        this.keeper.y += dy * 0.16;
        this.keeper.diveProgress = Math.min(this.keeper.diveProgress + dt * 3.2, 1.0);
      } else if (this.keeper.state === 'celebrating') {
        this.keeper.y = targetBaseY - Math.abs(Math.sin(Date.now() * 0.008)) * 14;
      }
    }

    /* ==========================================================================
       Net Mesh Springs
       ========================================================================== */

    distortNetMesh(impactX, impactY) {
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
          node.dispX *= 0.90;
          node.dispY *= 0.90;
        }
      }
    }

    /* ==========================================================================
       Rendering: Stadium, Goal, Net, Keeper, Kicker, Ball, Effects
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

      // 1. Draw Stadium Night Backdrop with Crowd Covered by Player Images
      this.drawStadiumSky(ctx);

      // 2. Draw Pitch & Markings
      this.drawPitch(ctx);

      // 3. Draw 3D Net
      this.drawGoalNet(ctx);

      // 4. Draw Goalkeeper
      this.drawGoalkeeper(ctx);

      // 5. Draw Goal Frame
      this.drawGoalPosts(ctx);

      // 6. Draw Kicker Character (The active player standing on the pitch!)
      this.drawKicker(ctx);

      // 7. Draw Ball Shadow & Ball
      this.drawBall(ctx);

      // 8. Draw Aiming Reticle / Swipe Guide
      this.drawAimingGuide(ctx);

      ctx.restore();
    }

    /* ==========================================================================
       Cover Spectator Stands with Active Kicker's Images (Left & Right)
       ========================================================================== */

    drawStadiumSky(ctx) {
      const w = this.width;
      const horizon = this.goal.bottom - 20;

      // The HTML backdrop (.penalty-players-backdrop) renders all player columns side-by-side
      // with full-bleed photos, names at top, and scores at the bottom of each image (homepage style).
      // Here on canvas, the sky remains transparent so the player columns show through cleanly.

      const players = window.arenaApp ? window.arenaApp.getPlayers() : [];
      const activeP = players.find(p => p.id === this.activePlayerId) || players[0] || { name: 'Player', color: '#00f0ff' };
      const themeColor = activeP.color || '#00f0ff';

      // Cheering crowd silhouettes along the pitch horizon line
      this.drawCrowdSilhouettes(ctx, 0, horizon - 16, w, 16, themeColor);

      // Electronic LED Pitchside Ribbon Board (Animated)
      const ledY = horizon - 22;
      const ledH = 22;

      ctx.fillStyle = '#060a12';
      ctx.fillRect(0, ledY, w, ledH);
      ctx.strokeStyle = `${themeColor}66`;
      ctx.lineWidth = 1;
      ctx.strokeRect(0, ledY, w, ledH);

      // Scrolling LED text ticker
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, ledY, w, ledH);
      ctx.clip();

      ctx.font = 'bold 11px Bebas Neue, Outfit, sans-serif';
      ctx.fillStyle = themeColor;
      const tickerText = `⚡ NOW KICKING: ${activeP.name.toUpperCase()} ⚡ ARENA SCORE: ${activeP.score} ⚡ SWIPE OR TAP TO SHOOT! ⚡ ⚽ LIVE ARENA ⚡`;
      const textWidth = ctx.measureText(tickerText).width;

      const offset = (this.ledScrollOffset % textWidth);
      ctx.fillText(tickerText, -offset, ledY + 15);
      ctx.fillText(tickerText, -offset + textWidth, ledY + 15);
      ctx.fillText(tickerText, -offset + textWidth * 2, ledY + 15);
      ctx.restore();

      // Subtle atmospheric floodlight flares
      this.drawFloodlight(ctx, w * 0.08, 15);
      this.drawFloodlight(ctx, w * 0.92, 15);
    }

    drawCrowdSilhouettes(ctx, x, y, width, height, flagColor) {
      // Fan silhouettes along railing
      ctx.fillStyle = '#060912';
      for (let i = 0; i < width; i += 14) {
        const headH = 8 + (i % 6);
        ctx.beginPath();
        ctx.arc(x + i + 7, y + height - headH, 5, 0, Math.PI * 2);
        ctx.fill();

        // Waving flags
        if (i % 28 === 0) {
          ctx.strokeStyle = flagColor;
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.moveTo(x + i + 7, y + height - headH);
          ctx.lineTo(x + i + 14, y + height - headH - 10);
          ctx.stroke();

          ctx.fillStyle = flagColor;
          ctx.beginPath();
          ctx.moveTo(x + i + 14, y + height - headH - 10);
          ctx.lineTo(x + i + 24, y + height - headH - 14);
          ctx.lineTo(x + i + 14, y + height - headH - 4);
          ctx.closePath();
          ctx.fill();
        }
      }
    }

    drawFloodlight(ctx, x, y) {
      ctx.fillStyle = '#1e2840';
      ctx.fillRect(x - 14, y, 28, 12);

      const flare = ctx.createRadialGradient(x, y + 6, 0, x, y + 6, 150);
      flare.addColorStop(0, 'rgba(210, 240, 255, 0.55)');
      flare.addColorStop(0.2, 'rgba(0, 240, 255, 0.2)');
      flare.addColorStop(1, 'rgba(0, 240, 255, 0)');
      ctx.fillStyle = flare;
      ctx.beginPath();
      ctx.arc(x, y + 6, 150, 0, Math.PI * 2);
      ctx.fill();
    }

    drawPitch(ctx) {
      const w = this.width;
      const h = this.height;
      const pitchTop = this.goal.bottom - 20;

      // 3D Perspective Pitch with alternating emerald stripes
      const stripes = 12;
      for (let i = 0; i < stripes; i++) {
        const y1 = pitchTop + (i / stripes) * (h - pitchTop);
        const y2 = pitchTop + ((i + 1) / stripes) * (h - pitchTop);
        ctx.fillStyle = i % 2 === 0 ? '#114925' : '#0c3a1c';
        ctx.fillRect(0, y1, w, y2 - y1);
      }

      // Vignette
      const pitchGlow = ctx.createRadialGradient(w / 2, pitchTop + 60, 40, w / 2, h * 0.8, w * 0.7);
      pitchGlow.addColorStop(0, 'rgba(0, 255, 140, 0.12)');
      pitchGlow.addColorStop(1, 'rgba(0, 0, 0, 0.5)');
      ctx.fillStyle = pitchGlow;
      ctx.fillRect(0, pitchTop, w, h - pitchTop);

      // Pitch Markings
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.65)';
      ctx.lineWidth = 3;

      // Goal line
      ctx.beginPath();
      ctx.moveTo(this.goal.left - 60, this.goal.bottom);
      ctx.lineTo(this.goal.right + 60, this.goal.bottom);
      ctx.stroke();

      // 6-yard Goal Area Box
      const boxLeft = this.goal.left - 35;
      const boxRight = this.goal.right + 35;
      const boxBottom = this.goal.bottom + (h - this.goal.bottom) * 0.28;

      ctx.beginPath();
      ctx.moveTo(boxLeft, this.goal.bottom);
      ctx.lineTo(boxLeft - 18, boxBottom);
      ctx.lineTo(boxRight + 18, boxBottom);
      ctx.lineTo(boxRight, this.goal.bottom);
      ctx.stroke();

      // Penalty Spot
      const spotX = w / 2;
      const spotY = this.penaltySpotY || (h * 0.79);
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.ellipse(spotX, spotY, 6, 3, 0, 0, Math.PI * 2);
      ctx.fill();

      // Penalty Arc
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

      const bLeft = gl + depth * 0.25;
      const bRight = gr - depth * 0.25;
      const bTop = gt - depth * 0.35;
      const bBottom = gb - depth * 0.1;

      ctx.fillStyle = 'rgba(6, 12, 22, 0.55)';
      ctx.beginPath();
      ctx.moveTo(bLeft, bTop);
      ctx.lineTo(bRight, bTop);
      ctx.lineTo(bRight, bBottom);
      ctx.lineTo(bLeft, bBottom);
      ctx.closePath();
      ctx.fill();

      ctx.strokeStyle = 'rgba(240, 248, 255, 0.35)';
      ctx.lineWidth = 1;

      // Horizontal cords
      for (let r = 0; r <= this.netRows; r++) {
        ctx.beginPath();
        for (let c = 0; c <= this.netCols; c++) {
          const node = this.netNodes[r][c];
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

      // Left post
      const postGrad = ctx.createLinearGradient(gl - pr, 0, gl + pr, 0);
      postGrad.addColorStop(0, '#8892a0');
      postGrad.addColorStop(0.3, '#ffffff');
      postGrad.addColorStop(0.7, '#f0f3f8');
      postGrad.addColorStop(1, '#566070');
      ctx.fillStyle = postGrad;
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

      // Corner joints
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

      // Shadow
      ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
      ctx.beginPath();
      ctx.ellipse(0, h * 0.46, w * 0.65, 8, 0, 0, Math.PI * 2);
      ctx.fill();

      if (k.state === 'diving' || k.state === 'saved') {
        const angle = (k.targetX > this.width / 2 ? 1 : -1) * (k.diveProgress * 0.95);
        ctx.rotate(angle);
      }

      // Keeper Jersey
      const jerseyGrad = ctx.createLinearGradient(-w * 0.35, -h * 0.3, w * 0.35, h * 0.2);
      jerseyGrad.addColorStop(0, '#eaff00');
      jerseyGrad.addColorStop(1, '#00e575');
      ctx.fillStyle = jerseyGrad;

      // Torso
      ctx.beginPath();
      ctx.roundRect(-w * 0.32, -h * 0.28, w * 0.64, h * 0.45, 8);
      ctx.fill();

      // Head
      ctx.fillStyle = '#f1c27d';
      ctx.beginPath();
      ctx.arc(0, -h * 0.38, w * 0.22, 0, Math.PI * 2);
      ctx.fill();

      // Hair
      ctx.fillStyle = '#221915';
      ctx.beginPath();
      ctx.arc(0, -h * 0.41, w * 0.22, Math.PI, Math.PI * 2);
      ctx.fill();

      // Shorts
      ctx.fillStyle = '#111520';
      ctx.beginPath();
      ctx.roundRect(-w * 0.3, h * 0.16, w * 0.6, h * 0.22, 4);
      ctx.fill();

      // Legs & Boots
      ctx.fillStyle = '#f1c27d';
      ctx.fillRect(-w * 0.22, h * 0.36, w * 0.18, h * 0.14);
      ctx.fillRect(w * 0.04, h * 0.36, w * 0.18, h * 0.14);

      ctx.fillStyle = '#ff2a6d';
      ctx.fillRect(-w * 0.24, h * 0.46, w * 0.22, 8);
      ctx.fillRect(w * 0.02, h * 0.46, w * 0.22, 8);

      // Gloves
      ctx.fillStyle = jerseyGrad;
      ctx.save();
      const armSpread = k.state === 'diving' ? -0.8 : -0.25;
      ctx.rotate(armSpread);
      ctx.fillRect(-w * 0.55, -h * 0.26, w * 0.22, h * 0.42);
      ctx.fillStyle = '#ffffff';
      ctx.strokeStyle = '#00f0ff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(-w * 0.46, h * 0.18, 14, 11, -0.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.restore();

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

    /* ==========================================================================
       On-Pitch Physical Kicker (The Active Player Standing Behind the Ball)
       ========================================================================== */

    drawKicker(ctx) {
      const players = window.arenaApp ? window.arenaApp.getPlayers() : [];
      const activeP = players.find(p => p.id === this.activePlayerId) || players[0];
      if (!activeP) return;

      const img = this.playerImages[activeP.id];

      // Kicker position relative to penalty spot
      let kx = this.ball.x - 34;
      let ky = (this.penaltySpotY || (this.height * 0.79)) + 4;

      // Animate kicker depending on state
      if (this.ball.state === 'aiming') {
        kx -= 14 * this.kicker.legAngle;
        ky += 4;
      } else if (this.ball.state === 'flying') {
        kx += 16;
        ky -= 2;
      } else if (this.ball.state === 'goal') {
        // Jumping celebration
        ky -= Math.abs(Math.sin(Date.now() * 0.008)) * 14;
      }

      ctx.save();
      ctx.translate(kx, ky);

      // Kicker Shadow
      ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
      ctx.beginPath();
      ctx.ellipse(0, 24, 20, 7, 0, 0, Math.PI * 2);
      ctx.fill();

      // Kicking Legs & Boots
      ctx.fillStyle = '#0f172a'; // Shorts
      ctx.fillRect(-12, -2, 24, 14);

      ctx.fillStyle = '#f1c27d'; // Skin legs
      const backLegPull = this.ball.state === 'aiming' ? -this.kicker.legAngle * 18 : 0;
      ctx.fillRect(-10 + backLegPull, 10, 8, 14);
      ctx.fillRect(2, 10, 8, 14);

      // Boots
      ctx.fillStyle = activeP.color || '#00f0ff';
      ctx.fillRect(-12 + backLegPull, 22, 11, 6);
      ctx.fillRect(2, 22, 11, 6);

      // Torso in team jersey
      ctx.fillStyle = activeP.color || '#00f0ff';
      ctx.beginPath();
      ctx.roundRect(-15, -28, 30, 28, 6);
      ctx.fill();

      // Number on back/chest
      ctx.fillStyle = '#080c16';
      ctx.font = 'bold 11px Outfit, sans-serif';
      ctx.textAlign = 'center';
      const numMatch = (activeP.tag || '').match(/\d+/);
      const jerseyNum = numMatch ? numMatch[0] : (activeP.name.includes('Messi') ? '10' : '7');
      ctx.fillText(jerseyNum, 0, -10);

      // Arms
      ctx.fillStyle = activeP.color || '#00f0ff';
      ctx.fillRect(-20, -26, 6, 20);
      ctx.fillRect(14, -26, 6, 20);

      // Player Head: Circular Photo Avatar with glowing border!
      const headRadius = 18;
      const headCenterY = -headRadius - 28;

      ctx.save();
      ctx.beginPath();
      ctx.arc(0, headCenterY, headRadius, 0, Math.PI * 2);
      ctx.clip();

      if (img && img.complete && img.naturalWidth > 0) {
        ctx.drawImage(img, -headRadius, headCenterY - headRadius, headRadius * 2, headRadius * 2);
      } else {
        ctx.fillStyle = '#f1c27d';
        ctx.fillRect(-headRadius, headCenterY - headRadius, headRadius * 2, headRadius * 2);
      }
      ctx.restore();

      // Glowing Neon Avatar Ring
      ctx.strokeStyle = activeP.color || '#00f0ff';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(0, headCenterY, headRadius, 0, Math.PI * 2);
      ctx.stroke();

      // Overhead Floating Name Plate: [ 👑 LIONEL MESSI ]
      const tagText = `👑 ${activeP.name.toUpperCase()} (KICKING)`;
      ctx.font = 'bold 10px Outfit, sans-serif';
      const tagW = ctx.measureText(tagText).width + 16;
      const tagH = 18;
      const tagY = headCenterY - headRadius - 20;

      ctx.fillStyle = 'rgba(8, 14, 28, 0.9)';
      ctx.strokeStyle = activeP.color || '#00f0ff';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.roundRect(-tagW / 2, tagY, tagW, tagH, 8);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'center';
      ctx.fillText(tagText, 0, tagY + 13);

      // Small pointer arrow pointing down to kicker's head
      ctx.fillStyle = activeP.color || '#00f0ff';
      ctx.beginPath();
      ctx.moveTo(-4, tagY + tagH);
      ctx.lineTo(4, tagY + tagH);
      ctx.lineTo(0, tagY + tagH + 4);
      ctx.closePath();
      ctx.fill();

      ctx.restore();
    }

    getCurrentBallRadius() {
      const scale = 1.0 - (this.ball.z * 0.62);
      return Math.max(8, this.ball.radius * scale);
    }

    drawBall(ctx) {
      const b = this.ball;
      const currentRadius = this.getCurrentBallRadius();

      // 1. Trail
      if (b.trail.length > 1) {
        for (let i = 0; i < b.trail.length; i++) {
          const t = b.trail[i];
          ctx.fillStyle = `rgba(0, 240, 255, ${t.alpha * 0.35})`;
          ctx.beginPath();
          ctx.arc(t.x, t.y, t.radius * 0.85, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // 2. Ball Shadow
      const baseSpotY = this.penaltySpotY || (this.height * 0.79);
      const pitchGroundY = baseSpotY - (b.z * (baseSpotY - this.goal.bottom));
      const shadowY = Math.max(b.y, pitchGroundY);
      const elevation = Math.max(0, shadowY - b.y);
      const shadowScale = Math.max(0.4, 1.0 - (elevation / 200));

      ctx.fillStyle = `rgba(0, 0, 0, ${Math.max(0.12, 0.5 - elevation * 0.002)})`;
      ctx.beginPath();
      ctx.ellipse(b.x, shadowY, currentRadius * 1.15 * shadowScale, currentRadius * 0.4 * shadowScale, 0, 0, Math.PI * 2);
      ctx.fill();

      // 3. Soccer Ball Rendering
      ctx.save();
      ctx.translate(b.x, b.y);
      ctx.rotate(b.rotation);

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

      // Pentagonal/Hexagonal Panels
      ctx.fillStyle = '#161922';
      const pSize = currentRadius * 0.36;
      this.drawPolygon(ctx, 0, 0, 5, pSize);

      for (let i = 0; i < 5; i++) {
        const ang = (i * Math.PI * 2) / 5 - Math.PI / 2;
        const px = Math.cos(ang) * (currentRadius * 0.72);
        const py = Math.sin(ang) * (currentRadius * 0.72);
        this.drawPolygon(ctx, px, py, 6, pSize * 0.65);
      }

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

      let dx = curX - this.ball.dragStartX;
      let dy = curY - this.ball.dragStartY;

      if (dy > 0) {
        dx = -dx;
        dy = -dy;
      }

      const dist = Math.hypot(dx, dy);
      const power = Math.min(dist / 80, 1.5);

      const aimFactor = 2.4 * Math.max(power, 0.6);
      const targetX = bx + dx * aimFactor;
      const targetY = by + dy * aimFactor;

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

      // Target Crosshair
      ctx.setLineDash([]);
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(targetX, targetY, 14, 0, Math.PI * 2);
      ctx.stroke();

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

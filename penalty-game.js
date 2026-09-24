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

      // Auto Shoot Engine (50% Competitive Accuracy)
      this.isAutoShoot = false;
      this.autoShootTimer = null;
      this.autoShootPrepTimer = null;

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
        if (e.key === 'Escape') {
          const winnerModal = document.getElementById('winner-modal');
          if (winnerModal && winnerModal.classList.contains('show')) {
            winnerModal.classList.remove('show');
            if (window.confettiEngine) window.confettiEngine.clear();
            if (this.isOpen) {
              this.resetBall();
              this.resetKeeper();
              this.hideOutcomeBanner();
            }
            e.stopPropagation();
            return;
          }
          if (this.isOpen) {
            this.closeGame();
          }
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

      // Auto Shoot button
      const autoShootBtn = document.getElementById('penalty-auto-shoot-btn');
      if (autoShootBtn) {
        autoShootBtn.addEventListener('click', () => {
          this.toggleAutoShoot();
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

      if (window.arenaApp && window.arenaApp.onViewChange) {
        window.arenaApp.onViewChange();
      }
      window.dispatchEvent(new CustomEvent('penaltyGameOpened'));

      // Sync Auto Shoot with main Auto Play if active
      const mainAutoActive = window.arenaApp && window.arenaApp.isAutoPlayActive && window.arenaApp.isAutoPlayActive();
      if (mainAutoActive) {
        this.isAutoShoot = true;
      }
      this.updateAutoShootUI();

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

      if (this.isAutoShoot) {
        this.setKickerStatus('ready');
        this.scheduleNextAutoKick(2000);
      }
    }

    closeGame() {
      if (!this.modalEl) return;
      this.isOpen = false;
      this.modalEl.classList.remove('show');
      document.body.classList.remove('penalty-active');

      this.clearAutoShootTimers();

      if (window.arenaApp && window.arenaApp.onViewChange) {
        window.arenaApp.onViewChange();
      }
      window.dispatchEvent(new CustomEvent('penaltyGameClosed'));

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
          col.className = `penalty-player-col ${isCurrent ? 'active is-kicking' : ''}`;
          col.id = `penalty-col-${p.id}`;
          col.style.setProperty('--player-color', p.color);
          col.style.setProperty('--player-color-rgb', p.colorRgb || '0, 240, 255');
          col.setAttribute('title', `${p.name} - Score: ${p.score}`);

          // Default position: 50% 50% (Center of Image) or user-dragged position
          const posX = p.penaltyPosX !== undefined ? p.penaltyPosX : 50;
          const posY = p.penaltyPosY !== undefined ? p.penaltyPosY : 50;

          col.innerHTML = `
            <div class="penalty-rotating-border"></div>
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

        // Activate rotating colored border on current kicker's image
        this.updateKickerBorderState(false);
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
          numberEl.innerText = this.getJerseyNumber(activeP);
          numberEl.style.background = activeP.color;
        }
      }
    }

    getJerseyNumber(activeP) {
      if (!activeP) return '10';
      const rawTag = (activeP.tag || '').trim();
      if (rawTag) {
        // If tag is compact without spaces (e.g. "CR7", "10", "7", "R9", "99", "P1"), use it directly
        if (rawTag.length <= 4 && !/\s/.test(rawTag)) {
          return rawTag.toUpperCase();
        }
        // If tag has spaces (e.g. "LEO 10", "NO. 7", "PLAYER 3"), extract the number digits
        const numMatch = rawTag.match(/\d+/);
        if (numMatch) return numMatch[0];
        return rawTag.slice(0, 4).toUpperCase();
      }
      // Fallback if tag is empty
      const nameHasMessi = activeP.name && activeP.name.toLowerCase().includes('messi');
      return nameHasMessi ? '10' : '7';
    }

    updateKickerBorderState(hasResult = false) {
      const cols = document.querySelectorAll('.penalty-player-col');
      cols.forEach(col => {
        if (!hasResult && col.id === `penalty-col-${this.activePlayerId}`) {
          col.classList.add('is-kicking');
        } else {
          col.classList.remove('is-kicking');
        }
      });
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
      if (!this.autoAlternate && !this.isAutoShoot) return;
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

      // Official FIFA Regulation Proportions:
      // Goal line = 0 yds, 6-yard box = 6 yds, Penalty Spot = 12 yds (11m), 18-yard box = 18 yds (16.5m)
      const pitchDepth = this.height - goalBottom;
      const penaltyBoxDepth = pitchDepth * (isMobile ? 0.45 : 0.48);
      this.penaltySpotY = goalBottom + penaltyBoxDepth * (12 / 18);

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
      this.ball.y = this.penaltySpotY || (this.goal.bottom + (this.height - this.goal.bottom) * 0.30);
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
      this.updateKickerBorderState(false);
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
        this.clearAutoShootTimers();
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

      const deltaX = pos.x - this.ball.dragStartX;
      const deltaY = pos.y - this.ball.dragStartY;
      const swipeDistance = Math.hypot(deltaX, deltaY);

      // 1. Backward / downward drag: "ball jeno pichone marte na pare"
      // Soccer rule: Penalty kick cannot be struck backwards away from goal!
      if (deltaY >= -15) {
        this.resetBall();
        return;
      }

      // 2. Accidental tap or dropped near penalty spot: "othoba ektu dure fele dile o"
      if (swipeDistance < 25) {
        // Only allow shoot if deliberately tapped high in the goal area
        if (pos.y <= this.goal.bottom + 20) {
          this.shootTowardsTarget(pos.x, pos.y);
          return;
        }
        // Dropped near ball or on the grass -> cancel & reset to penalty spot
        this.resetBall();
        return;
      }

      // 3. Legitimate forward kick swipe towards the goal:
      this.launchBall(deltaX, deltaY, swipeDistance);
    }

    shootTowardsTarget(targetX, targetY, power = 1.0, forceKeeperDodge = false, forceKeeperSave = false) {
      // Must be aiming at or above the goal line
      if (targetY > this.goal.bottom + 25) {
        this.resetBall();
        return;
      }

      this.ball.state = 'flying';
      this.lastKickTimestamp = Date.now();
      this.setKickerStatus('kicked');
      this.kicker.kickProgress = 1.0;

      const clampedPower = Math.min(Math.max(power, 0.7), 1.5);
      this.ball.vz = 0.024 * (0.8 + clampedPower * 0.4);

      // Aesthetic Magnus spin curl
      let spin = 0;
      if (forceKeeperDodge) {
        spin = (targetX > this.width / 2 ? 1 : -1) * 0.16;
      } else if (!forceKeeperSave) {
        spin = ((targetX - this.width / 2) / 100) * 0.12;
      }
      this.ball.spin = spin;

      // Ballistic integration: calculate exact flight steps, gravity and Magnus curve drift
      let simZ = 0;
      let steps = 0;
      let totalGravY = 0;
      let curVyGrav = 0;
      while (simZ < 1.0) {
        totalGravY += curVyGrav;
        simZ += this.ball.vz;
        curVyGrav += 0.12 * (simZ * 1.5);
        steps++;
      }
      const totalSpinX = (steps * (steps + 1) / 2) * (this.ball.spin * 0.35);

      // Calibrate initial vx and vy so ball arrives precisely at targetX and targetY when ball.z reaches 1.0
      this.ball.vx = (targetX - this.ball.x - totalSpinX) / steps;
      this.ball.vy = (targetY - this.ball.y - totalGravY) / steps;

      if (this.soundEnabled && window.soundEngine && window.soundEngine.playKick) {
        window.soundEngine.playKick(clampedPower);
      }

      this.triggerKeeperDive(targetX, targetY, clampedPower, forceKeeperDodge, forceKeeperSave);
    }

    launchBall(deltaX, deltaY, powerMag) {
      // Ensure backwards kick is strictly rejected
      if (deltaY >= -15) {
        this.resetBall();
        return;
      }

      this.ball.state = 'flying';
      this.lastKickTimestamp = Date.now();
      this.setKickerStatus('kicked');
      this.kicker.kickProgress = 1.0;

      // Reference swipe distance: swipe of ~85px maps directly to goal center
      const refSwipe = Math.max(65, Math.min(130, this.height * 0.13));

      // Vertical aim mapping from forward swipe (deltaY is negative):
      // Ratio = 1.0 -> center of the goal
      // Ratio < 0.6 -> shot is short / into the ground (missed)
      // Ratio > 1.4 -> shot blazes over the crossbar (missed)
      const verticalAimRatio = (-deltaY) / refSwipe;
      const targetScreenY = this.goal.bottom - (this.goal.bottom - this.goal.top) * ((verticalAimRatio - 0.55) / 0.75);

      // Horizontal aim mapping:
      // deltaX = 0 -> center of goal
      // deltaX / (refSwipe * 0.7) = +/- 1.0 -> left/right posts
      const horizontalAimRatio = deltaX / (refSwipe * 0.7);
      const targetScreenX = (this.width / 2) + horizontalAimRatio * (this.goal.width * 0.52);

      const clampedPower = Math.min(Math.max(powerMag / 80, 0.65), 1.5);
      this.ball.vz = 0.024 * (0.8 + clampedPower * 0.4);
      this.ball.vx = (targetScreenX - this.ball.x) * this.ball.vz;
      this.ball.vy = (targetScreenY - this.ball.y) * this.ball.vz;
      this.ball.spin = (deltaX / 100) * 0.7;

      if (this.soundEnabled && window.soundEngine && window.soundEngine.playKick) {
        window.soundEngine.playKick(clampedPower);
      }

      this.triggerKeeperDive(targetScreenX, targetScreenY, clampedPower);
    }

    /* ==========================================================================
       Goalkeeper AI & Trajectory Prediction
       ========================================================================== */

    triggerKeeperDive(targetX, targetY, power, forceKeeperDodge = false, forceKeeperSave = false) {
      let reactionDelay;
      let diveTargetX = targetX;
      let diveTargetY = targetY;

      if (forceKeeperSave) {
        reactionDelay = 35 + Math.random() * 35; // Fast keeper reaction to reach and save the ball
        diveTargetX = targetX;
        diveTargetY = targetY;
      } else if (forceKeeperDodge) {
        reactionDelay = 100 + Math.random() * 60;
        // Dive convincingly in the opposite direction or lower so the strike scores cleanly
        const wrongSide = targetX > this.width / 2 ? -1 : 1;
        diveTargetX = this.width / 2 + wrongSide * (this.goal.width * 0.32);
        diveTargetY = this.goal.bottom - this.goal.height * 0.28;
      } else {
        reactionDelay = 80 + Math.random() * 80;
        const readsCorrect = Math.random() < 0.66;
        if (!readsCorrect) {
          const wrongDirection = targetX > this.width / 2 ? -1 : 1;
          diveTargetX = this.width / 2 + wrongDirection * (this.goal.width * 0.35);
          diveTargetY = this.goal.bottom - Math.random() * this.goal.height * 0.6;
        }
      }

      setTimeout(() => {
        if (this.ball.state !== 'flying') return;

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
      } else if (this.ball.state === 'post' || this.ball.state === 'saved' || this.ball.state === 'missed') {
        this.ball.x += this.ball.vx;
        this.ball.y += this.ball.vy;
        this.ball.vy += 0.4;
        if (this.ball.y > this.height - 20) {
          this.ball.y = this.height - 20;
          this.ball.vy = -this.ball.vy * 0.4;
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

      // 2. Off target - "goal post e na dhukle kokhonoi goal hobena"
      // Ball must strictly enter within the goal frame:
      // - horizontally inside left post (gl) and right post (gr)
      // - vertically below crossbar (gt) and above goal line/ground (gb)
      const isOutsideLeft = bx < gl + ballRad * 0.15;
      const isOutsideRight = bx > gr - ballRad * 0.15;
      const isOverBar = by < gt + ballRad * 0.15;
      const isBelowGoalLine = by > gb + ballRad * 0.35; // Ball below goal line/ground -> MISSED!

      if (isOutsideLeft || isOutsideRight || isOverBar || isBelowGoalLine) {
        this.handleOutcome('missed', bx, by);
        return;
      }

      // 3. Goalkeeper Save Hitbox
      const keeperHit = this.checkKeeperSave(bx, by, ballRad);
      if (keeperHit) {
        this.handleOutcome('saved', bx, by);
      } else {
        // Certified legitimate goal inside the goal post!
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

      // Kick result arrived! Stop rotating border while outcome banner displays
      this.updateKickerBorderState(true);

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

        this.screenShake = 10;
        this.keeper.state = 'beaten';
        this.lastScoredPlayerId = this.activePlayerId;
        this.celebrationGlowTimer = 1.5;

        if (this.soundEnabled && window.soundEngine) {
          if (window.soundEngine.playGoalCelebration) {
            window.soundEngine.playGoalCelebration(activeP);
          } else if (window.soundEngine.playGoalSoundForPlayer) {
            window.soundEngine.playGoalSoundForPlayer(activeP);
          } else if (window.soundEngine.playRandomGoalSound) {
            window.soundEngine.playRandomGoalSound(activeP);
          }
        }

        // Minimal, light celebration burst directly over the goal net (reduced particle count)
        if (window.confettiEngine && window.confettiEngine.burst) {
          const burstX = this.goal ? (this.goal.left + this.goal.width / 2) : (this.width / 2);
          const burstY = this.goal ? (this.goal.top + this.goal.height / 2) : (this.height * 0.45);
          window.confettiEngine.burst(burstX, burstY, 22);
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
        this.screenShake = 8;

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

      // Physical & logical celebration duration before reset (longer for goals to celebrate)
      const celebrationDuration = type === 'goal' ? 2800 : 2300;

      // Advance turn & reset cleanly after celebration finishes
      this.resetTimer = setTimeout(() => {
        const targetScore = window.arenaApp ? window.arenaApp.getTargetScore() : 0;
        const currentActiveP = players.find(p => p.id === this.activePlayerId);
        const matchWon = targetScore > 0 && currentActiveP && currentActiveP.score >= targetScore;

        if (!matchWon) {
          this.advanceToNextPlayer();
          this.resetBall();
          this.resetKeeper();
          if (this.isAutoShoot) {
            this.setKickerStatus('ready');
            this.scheduleNextAutoKick(2200);
          }
        } else {
          // Target complete! Match won!
          const winName = currentActiveP ? currentActiveP.name.toUpperCase() : 'CHAMPION';
          this.setKickerStatus('goal', `🏆 ${winName} WON THE MATCH!`);
          if (!this.isAutoShoot) {
            this.updateAutoShootUI();
          }
        }
      }, celebrationDuration);
    }

    showOutcomeBanner(type, player) {
      const banner = document.getElementById('penalty-outcome-banner');
      const titleEl = document.getElementById('outcome-main-title');
      const creditEl = document.getElementById('outcome-player-credit');

      if (!banner || !player) return;

      banner.className = `penalty-outcome-banner show ${type}`;
      if (creditEl) creditEl.innerText = player.name.toUpperCase();

      if (type === 'goal') {
        if (titleEl) titleEl.innerText = 'GOAL!';
      } else if (type === 'saved') {
        if (titleEl) titleEl.innerText = 'SAVED';
      } else if (type === 'post') {
        if (titleEl) titleEl.innerText = 'POST';
      } else if (type === 'missed') {
        if (titleEl) titleEl.innerText = 'MISSED';
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
       Penalty Auto Shootout Engine (50% Competitive Accuracy)
       ========================================================================== */

    toggleAutoShoot(forceVal = null) {
      if (forceVal !== null) {
        this.isAutoShoot = !!forceVal;
      } else {
        this.isAutoShoot = !this.isAutoShoot;
      }

      this.updateAutoShootUI();

      // Synchronize with main arena Auto Play state
      if (window.arenaApp && window.arenaApp.toggleAutoPlay && window.arenaApp.isAutoPlayActive) {
        if (window.arenaApp.isAutoPlayActive() !== this.isAutoShoot) {
          window.arenaApp.toggleAutoPlay(this.isAutoShoot);
        }
      }

      if (this.isAutoShoot) {
        if (this.isOpen && this.ball.state === 'ready') {
          this.setKickerStatus('ready');
          this.scheduleNextAutoKick(1800);
        }
      } else {
        this.clearAutoShootTimers();
        if (window.arenaApp && window.arenaApp.clearAutoRematchTimer) {
          window.arenaApp.clearAutoRematchTimer();
        }
      }
    }

    clearAutoShootTimers() {
      if (this.autoShootTimer) {
        clearTimeout(this.autoShootTimer);
        this.autoShootTimer = null;
      }
      if (this.autoShootPrepTimer) {
        clearTimeout(this.autoShootPrepTimer);
        this.autoShootPrepTimer = null;
      }
    }

    updateAutoShootUI() {
      const btn = document.getElementById('penalty-auto-shoot-btn');
      if (btn) {
        btn.classList.toggle('active', this.isAutoShoot);
        btn.innerHTML = this.isAutoShoot ? '⚡ Auto Shoot: ON' : '⚡ Auto Shoot: OFF';
      }
    }

    scheduleNextAutoKick(delay = 2200) {
      this.clearAutoShootTimers();

      if (!this.isOpen || !this.isAutoShoot) return;

      // Halfway through preparation, show aiming anticipation & run-up posture
      const prepDelay = Math.max(700, Math.floor(delay * 0.52));
      this.autoShootPrepTimer = setTimeout(() => {
        this.autoShootPrepTimer = null;
        if (!this.isOpen || !this.isAutoShoot || this.ball.state !== 'ready') return;
        this.setKickerStatus('aiming');
        this.kicker.legAngle = 0.28;
      }, prepDelay);

      this.autoShootTimer = setTimeout(() => {
        this.autoShootTimer = null;
        if (!this.isOpen || !this.isAutoShoot) return;
        this.executeAutoKick();
      }, delay);
    }

    executeAutoKick() {
      if (!this.isOpen || !this.isAutoShoot) return;
      if (this.ball.state !== 'ready') return;
      if (!this.goal || this.goal.width <= 0) return;

      const gl = this.goal.left;
      const gr = this.goal.right;
      const gt = this.goal.top;
      const gb = this.goal.bottom;
      const gw = this.goal.width;
      const gh = this.goal.height;

      // 50% accurate strike rate as explicitly requested by user
      const isGoal = Math.random() < 0.50;

      let targetX, targetY, power;
      let forceKeeperDodge = false;
      let forceKeeperSave = false;

      if (isGoal) {
        // --- 50% GOAL: Precision corner strike that beats the keeper ---
        const cornerPicks = [
          // Top Left Corner (Upper 90)
          { x: gl + gw * (0.12 + Math.random() * 0.06), y: gt + gh * (0.15 + Math.random() * 0.08) },
          // Top Right Corner (Upper 90)
          { x: gr - gw * (0.12 + Math.random() * 0.06), y: gt + gh * (0.15 + Math.random() * 0.08) },
          // Bottom Left Corner
          { x: gl + gw * (0.12 + Math.random() * 0.06), y: gb - gh * (0.14 + Math.random() * 0.08) },
          // Bottom Right Corner
          { x: gr - gw * (0.12 + Math.random() * 0.06), y: gb - gh * (0.14 + Math.random() * 0.08) }
        ];
        const chosen = cornerPicks[Math.floor(Math.random() * cornerPicks.length)];
        targetX = chosen.x;
        targetY = chosen.y;
        power = 1.15 + Math.random() * 0.2;
        forceKeeperDodge = true;
      } else {
        // --- 50% NON-GOAL: Goalkeeper save, woodwork clang, or close miss ---
        const nonGoalType = Math.random();

        if (nonGoalType < 0.70) {
          // Goalkeeper Save (~35% overall)
          const diveSide = Math.random() < 0.5 ? -1 : 1;
          targetX = (this.width / 2) + diveSide * (gw * (0.18 + Math.random() * 0.16));
          targetY = gt + gh * (0.35 + Math.random() * 0.35);
          power = 0.95 + Math.random() * 0.18;
          forceKeeperSave = true;
        } else if (nonGoalType < 0.88) {
          // Woodwork Post / Crossbar (~9% overall)
          const woodPick = Math.random();
          if (woodPick < 0.45) {
            targetX = gl;
            targetY = gt + gh * (0.2 + Math.random() * 0.5);
          } else if (woodPick < 0.90) {
            targetX = gr;
            targetY = gt + gh * (0.2 + Math.random() * 0.5);
          } else {
            targetX = gl + gw * (0.25 + Math.random() * 0.5);
            targetY = gt;
          }
          power = 1.1 + Math.random() * 0.15;
        } else {
          // Missed Wide / Over (~6% overall)
          const missSide = Math.random() < 0.5 ? -1 : 1;
          if (Math.random() < 0.6) {
            targetX = (this.width / 2) + missSide * (gw * 0.56 + Math.random() * 16);
            targetY = gt + gh * (0.2 + Math.random() * 0.4);
          } else {
            targetX = gl + gw * (0.2 + Math.random() * 0.6);
            targetY = gt - (gh * 0.12 + Math.random() * 14);
          }
          power = 1.2 + Math.random() * 0.2;
        }
      }

      this.shootTowardsTarget(targetX, targetY, power, forceKeeperDodge, forceKeeperSave);
    }

    /* ==========================================================================
       Goalkeeper Updates & Physics
       ========================================================================== */

    updateKeeper(dt) {
      const targetBaseY = this.goal.bottom - this.keeper.height * 0.52;
      const isShooterAiming = this.ball.state === 'aiming';

      if (this.keeper.state === 'idle' || this.keeper.state === 'anticipating') {
        if (isShooterAiming) {
          this.keeper.state = 'anticipating';
          // Tense crouch & subtle lateral shuffle reacting to shooter's aim
          this.keeper.idleTimer += dt * 6.5;
          const aimBiasX = (this.ball.dragCurrentX - this.width / 2) * 0.12;
          const targetX = this.width / 2 + aimBiasX + Math.sin(this.keeper.idleTimer) * (this.goal.width * 0.035);
          this.keeper.x += (targetX - this.keeper.x) * 0.12;
          this.keeper.y = targetBaseY + 8 + Math.abs(Math.sin(this.keeper.idleTimer * 2)) * 3;
        } else {
          this.keeper.state = 'idle';
          this.keeper.idleTimer += dt * 4.2;
          // Athletic keeper bounce and lateral shuffle
          const targetX = this.width / 2 + Math.sin(this.keeper.idleTimer) * (this.goal.width * 0.07);
          this.keeper.x += (targetX - this.keeper.x) * 0.1;
          this.keeper.y = targetBaseY + Math.abs(Math.sin(this.keeper.idleTimer * 2)) * 6;
        }
      } else if (this.keeper.state === 'diving') {
        const dx = this.keeper.targetX - this.keeper.x;
        const dy = this.keeper.targetY - this.keeper.y;
        this.keeper.x += dx * 0.26;
        this.keeper.y += dy * 0.26;
        this.keeper.diveProgress = Math.min(this.keeper.diveProgress + dt * 3.8, 1.0);
      } else if (this.keeper.state === 'celebrating') {
        this.keeper.y = targetBaseY - Math.abs(Math.sin(Date.now() * 0.008)) * 14;
      } else if (this.keeper.state === 'beaten') {
        const beatenTargetY = targetBaseY + 10;
        this.keeper.y += (beatenTargetY - this.keeper.y) * 0.1;
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

      const pitchDepth = h - this.goal.bottom;
      const isMobile = w < 768;
      const penaltyBoxDepth = pitchDepth * (isMobile ? 0.45 : 0.48);

      // 1. 6-yard Goal Area Box (5.5m from goal line = exactly 1/3 of penalty box)
      const sixYardDepth = penaltyBoxDepth * (6 / 18);
      const sixYardBottom = this.goal.bottom + sixYardDepth;
      const sixYardSpread = this.goal.width * 0.28;
      const sixYardLeft = this.goal.left - sixYardSpread;
      const sixYardRight = this.goal.right + sixYardSpread;

      ctx.beginPath();
      ctx.moveTo(sixYardLeft, this.goal.bottom);
      ctx.lineTo(sixYardLeft - 12, sixYardBottom);
      ctx.lineTo(sixYardRight + 12, sixYardBottom);
      ctx.lineTo(sixYardRight, this.goal.bottom);
      ctx.stroke();

      // 2. 18-yard Penalty Area Box (16.5m from goal line = full penalty box)
      const penBoxBottom = this.goal.bottom + penaltyBoxDepth;
      const penBoxSpread = this.goal.width * 0.65;
      const penBoxLeft = this.goal.left - penBoxSpread;
      const penBoxRight = this.goal.right + penBoxSpread;

      ctx.beginPath();
      ctx.moveTo(penBoxLeft, this.goal.bottom);
      ctx.lineTo(penBoxLeft - 28, penBoxBottom);
      ctx.lineTo(penBoxRight + 28, penBoxBottom);
      ctx.lineTo(penBoxRight, this.goal.bottom);
      ctx.stroke();

      // 3. Official FIFA Penalty Mark (11m / 12 yards from goal line = exactly 2/3 of penalty box)
      const spotX = w / 2;
      const spotY = this.penaltySpotY || (this.goal.bottom + penaltyBoxDepth * (12 / 18));
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.ellipse(spotX, spotY, 6.5, 3.5, 0, 0, Math.PI * 2);
      ctx.fill();

      // 4. Official Penalty Arc ("The D" - 10-yard radius from Penalty Mark outside the 18-yard box)
      const arcRadiusY = penaltyBoxDepth * (10 / 18);
      const arcRadiusX = arcRadiusY * (isMobile ? 1.55 : 1.75);
      const intersectAngle = Math.asin(6 / 10); // sin(θ) = 6 yards / 10 yards = 0.6

      ctx.beginPath();
      ctx.ellipse(spotX, spotY, arcRadiusX, arcRadiusY, 0, intersectAngle, Math.PI - intersectAngle);
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

      // Goal line on pitch for ground shadow
      const groundY = this.goal.bottom - 4;

      // 1. Realistic 3D Ground Drop Shadow on the pitch
      ctx.save();
      const heightOffGround = Math.max(0, groundY - (y + h * 0.44));
      const shadowScale = Math.max(0.4, 1 - heightOffGround / 120);
      const shadowAlpha = Math.max(0.12, 0.55 * (1 - heightOffGround / 160));
      ctx.fillStyle = `rgba(0, 0, 0, ${shadowAlpha.toFixed(2)})`;
      ctx.beginPath();
      ctx.ellipse(x, groundY, w * 0.55 * shadowScale, 9 * shadowScale, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      ctx.save();
      ctx.translate(x, y);

      // Rotation for diving or saved
      const isDive = k.state === 'diving' || k.state === 'saved';
      const isDiveRight = k.targetX > this.width / 2;
      if (isDive) {
        const diveAngle = (isDiveRight ? 1 : -1) * (k.diveProgress * 0.95);
        ctx.rotate(diveAngle);
      } else if (k.state === 'beaten') {
        ctx.rotate(0.05);
      }

      // Athletic Crouch & Breathing animation
      const isCrouching = k.state === 'anticipating';
      const crouchFactor = isCrouching ? 6 : 0;
      const breath = Math.sin(k.idleTimer * 2) * 1.5;

      // Palette: Modern Elite Goalkeeper Kit (Hyper-Volt & Carbon with Metallic Accents)
      const primaryColor = '#00f576';
      const secondaryColor = '#00a84e';
      const darkColor = '#090d16';
      const trimColor = '#00f0ff';
      const skinTone = '#e5aa70';
      const skinShadow = '#c48b52';
      const tightsColor = '#101726';
      const bootColor = '#ff2a6d';
      const gloveLatex = '#ffffff';

      // -------------------------------------------------------------
      // 2. LEGS, BASE-LAYER COMPRESSION TIGHTS & BOOTS
      // -------------------------------------------------------------
      const legSpread = isDive ? 0.35 : (isCrouching ? 0.28 : 0.22);
      const lLegX = -w * legSpread;
      const rLegX = w * legSpread;
      const legW = w * 0.17;
      const legTopY = h * 0.18 + crouchFactor;
      const legBottomY = h * 0.44;

      // Compression Tights (Left & Right)
      ctx.fillStyle = tightsColor;
      ctx.beginPath();
      ctx.moveTo(lLegX - legW * 0.5, legTopY);
      ctx.lineTo(lLegX + legW * 0.5, legTopY);
      ctx.lineTo(lLegX + legW * 0.4, legBottomY);
      ctx.lineTo(lLegX - legW * 0.4, legBottomY);
      ctx.closePath();
      ctx.fill();

      ctx.beginPath();
      ctx.moveTo(rLegX - legW * 0.5, legTopY);
      ctx.lineTo(rLegX + legW * 0.5, legTopY);
      ctx.lineTo(rLegX + legW * 0.4, legBottomY);
      ctx.lineTo(rLegX - legW * 0.4, legBottomY);
      ctx.closePath();
      ctx.fill();

      // Padded Knee Protectors on Tights
      ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
      ctx.beginPath();
      ctx.roundRect(lLegX - legW * 0.35, legTopY + (legBottomY - legTopY) * 0.35, legW * 0.7, 10, 3);
      ctx.roundRect(rLegX - legW * 0.35, legTopY + (legBottomY - legTopY) * 0.35, legW * 0.7, 10, 3);
      ctx.fill();

      // Match Socks (Goalkeeper Calf Rings)
      ctx.fillStyle = secondaryColor;
      ctx.fillRect(lLegX - legW * 0.38, legBottomY - 14, legW * 0.76, 12);
      ctx.fillRect(rLegX - legW * 0.38, legBottomY - 14, legW * 0.76, 12);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(lLegX - legW * 0.38, legBottomY - 12, legW * 0.76, 2);
      ctx.fillRect(rLegX - legW * 0.38, legBottomY - 12, legW * 0.76, 2);
      ctx.fillRect(lLegX - legW * 0.38, legBottomY - 8, legW * 0.76, 2);
      ctx.fillRect(rLegX - legW * 0.38, legBottomY - 8, legW * 0.76, 2);

      // Goalkeeper Cleats / Boots (Detailed soccer boots with studs)
      const bootW = legW * 1.35;
      const bootH = 9;
      const lBootGrad = ctx.createLinearGradient(lLegX - bootW * 0.6, legBottomY, lLegX + bootW * 0.6, legBottomY + bootH);
      lBootGrad.addColorStop(0, bootColor);
      lBootGrad.addColorStop(1, '#990033');
      ctx.fillStyle = lBootGrad;
      ctx.beginPath();
      ctx.roundRect(lLegX - bootW * 0.65, legBottomY, bootW, bootH, [2, 4, 3, 2]);
      ctx.fill();

      const rBootGrad = ctx.createLinearGradient(rLegX - bootW * 0.35, legBottomY, rLegX + bootW * 0.65, legBottomY + bootH);
      rBootGrad.addColorStop(0, bootColor);
      rBootGrad.addColorStop(1, '#990033');
      ctx.fillStyle = rBootGrad;
      ctx.beginPath();
      ctx.roundRect(rLegX - bootW * 0.35, legBottomY, bootW, bootH, [4, 2, 2, 3]);
      ctx.fill();

      // Cleat Soles & Studs
      ctx.fillStyle = '#00f0ff';
      ctx.fillRect(lLegX - bootW * 0.65, legBottomY + bootH - 2, bootW, 2);
      ctx.fillRect(rLegX - bootW * 0.35, legBottomY + bootH - 2, bootW, 2);
      if (isDive || heightOffGround > 8) {
        ctx.fillStyle = '#ffffff';
        for (let s = 0; s < 3; s++) {
          ctx.fillRect(lLegX - bootW * 0.6 + s * 6, legBottomY + bootH, 2.5, 2.5);
          ctx.fillRect(rLegX - bootW * 0.3 + s * 6, legBottomY + bootH, 2.5, 2.5);
        }
      }

      // -------------------------------------------------------------
      // 3. GOALKEEPER SHORTS
      // -------------------------------------------------------------
      const shortsY = h * 0.12 + crouchFactor * 0.5;
      const shortsH = h * 0.22;
      const shortsW = w * 0.64;

      const shortsGrad = ctx.createLinearGradient(0, shortsY, 0, shortsY + shortsH);
      shortsGrad.addColorStop(0, '#101624');
      shortsGrad.addColorStop(1, '#080c14');
      ctx.fillStyle = shortsGrad;

      ctx.beginPath();
      ctx.moveTo(-shortsW * 0.48, shortsY);
      ctx.lineTo(shortsW * 0.48, shortsY);
      ctx.lineTo(shortsW * 0.54, shortsY + shortsH);
      ctx.lineTo(0, shortsY + shortsH * 0.88);
      ctx.lineTo(-shortsW * 0.54, shortsY + shortsH);
      ctx.closePath();
      ctx.fill();

      ctx.strokeStyle = primaryColor;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-shortsW * 0.48, shortsY);
      ctx.lineTo(-shortsW * 0.54, shortsY + shortsH);
      ctx.moveTo(shortsW * 0.48, shortsY);
      ctx.lineTo(shortsW * 0.54, shortsY + shortsH);
      ctx.stroke();

      // -------------------------------------------------------------
      // 4. GOALKEEPER TORSO & PRO JERSEY
      // -------------------------------------------------------------
      const torsoY = -h * 0.26 + crouchFactor * 0.2 + breath;
      const torsoH = h * 0.42;
      const torsoTopW = w * 0.72;
      const torsoWaistW = w * 0.56;

      const jerseyGrad = ctx.createLinearGradient(-torsoTopW * 0.5, torsoY, torsoTopW * 0.5, torsoY + torsoH);
      jerseyGrad.addColorStop(0, '#22ff88');
      jerseyGrad.addColorStop(0.3, primaryColor);
      jerseyGrad.addColorStop(1, secondaryColor);
      ctx.fillStyle = jerseyGrad;

      ctx.beginPath();
      ctx.moveTo(-torsoTopW * 0.5, torsoY);
      ctx.lineTo(torsoTopW * 0.5, torsoY);
      ctx.lineTo(torsoWaistW * 0.5, torsoY + torsoH);
      ctx.lineTo(-torsoWaistW * 0.5, torsoY + torsoH);
      ctx.closePath();
      ctx.fill();

      // Dark Ergonomic Flank Panels
      ctx.fillStyle = darkColor;
      ctx.beginPath();
      ctx.moveTo(-torsoTopW * 0.5, torsoY + torsoH * 0.2);
      ctx.lineTo(-torsoTopW * 0.38, torsoY + torsoH * 0.2);
      ctx.lineTo(-torsoWaistW * 0.38, torsoY + torsoH);
      ctx.lineTo(-torsoWaistW * 0.5, torsoY + torsoH);
      ctx.closePath();
      ctx.fill();

      ctx.beginPath();
      ctx.moveTo(torsoTopW * 0.5, torsoY + torsoH * 0.2);
      ctx.lineTo(torsoTopW * 0.38, torsoY + torsoH * 0.2);
      ctx.lineTo(torsoWaistW * 0.38, torsoY + torsoH);
      ctx.lineTo(torsoWaistW * 0.5, torsoY + torsoH);
      ctx.closePath();
      ctx.fill();

      // Sublimated Chevron Stripes
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.22)';
      ctx.lineWidth = 1.5;
      for (let c = 1; c <= 3; c++) {
        const cy = torsoY + torsoH * (0.28 + c * 0.16);
        ctx.beginPath();
        ctx.moveTo(-torsoWaistW * 0.32, cy - 4);
        ctx.lineTo(0, cy + 3);
        ctx.lineTo(torsoWaistW * 0.32, cy - 4);
        ctx.stroke();
      }

      // Goalkeeper Crest Badge
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(-torsoTopW * 0.22, torsoY + torsoH * 0.24, 4.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = trimColor;
      ctx.beginPath();
      ctx.arc(-torsoTopW * 0.22, torsoY + torsoH * 0.24, 2.5, 0, Math.PI * 2);
      ctx.fill();

      // Ribbed V-Neck Collar
      ctx.fillStyle = darkColor;
      ctx.beginPath();
      ctx.moveTo(-torsoTopW * 0.18, torsoY);
      ctx.lineTo(0, torsoY + 9);
      ctx.lineTo(torsoTopW * 0.18, torsoY);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1;
      ctx.stroke();

      // -------------------------------------------------------------
      // 5. HEAD, HAIR & ACTIVE BALL-TRACKING EYES
      // -------------------------------------------------------------
      const headY = torsoY - w * 0.28;
      const headR = w * 0.20;

      // Neck
      ctx.fillStyle = skinShadow;
      ctx.fillRect(-headR * 0.45, headY + headR * 0.5, headR * 0.9, headR * 0.7);

      // Head Base
      const headGrad = ctx.createLinearGradient(-headR, headY - headR, headR, headY + headR);
      headGrad.addColorStop(0, skinTone);
      headGrad.addColorStop(1, skinShadow);
      ctx.fillStyle = headGrad;
      ctx.beginPath();
      ctx.ellipse(0, headY, headR * 0.92, headR * 1.05, 0, 0, Math.PI * 2);
      ctx.fill();

      // Modern Textured Haircut (High fade sides, textured top)
      ctx.fillStyle = '#1c1512';
      ctx.beginPath();
      ctx.arc(0, headY - headR * 0.25, headR * 0.98, Math.PI * 0.9, Math.PI * 2.1);
      ctx.lineTo(headR * 0.88, headY - headR * 0.1);
      ctx.lineTo(0, headY - headR * 0.85);
      ctx.lineTo(-headR * 0.88, headY - headR * 0.1);
      ctx.closePath();
      ctx.fill();

      // Active Ball Tracking Eyes (Pupils dynamically follow ball in real time!)
      const eyeLevelY = headY + 1;
      const eyeSpacingX = headR * 0.42;

      const ballRelX = this.ball.x - x;
      const ballRelY = this.ball.y - (y + headY);
      const ballDist = Math.hypot(ballRelX, ballRelY) || 1;
      const pupilShiftX = Math.max(-2.5, Math.min(2.5, (ballRelX / ballDist) * 2.8));
      const pupilShiftY = Math.max(-1.5, Math.min(1.5, (ballRelY / ballDist) * 2.2));

      // Left Eye
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.ellipse(-eyeSpacingX, eyeLevelY, 3.8, 2.5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#111111';
      ctx.beginPath();
      ctx.arc(-eyeSpacingX + pupilShiftX, eyeLevelY + pupilShiftY, 1.6, 0, Math.PI * 2);
      ctx.fill();

      // Right Eye
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.ellipse(eyeSpacingX, eyeLevelY, 3.8, 2.5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#111111';
      ctx.beginPath();
      ctx.arc(eyeSpacingX + pupilShiftX, eyeLevelY + pupilShiftY, 1.6, 0, Math.PI * 2);
      ctx.fill();

      // Eyebrows
      ctx.strokeStyle = '#181210';
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.moveTo(-eyeSpacingX - 4, eyeLevelY - 3.5);
      ctx.lineTo(-eyeSpacingX + 4, eyeLevelY - 2.5);
      ctx.moveTo(eyeSpacingX + 4, eyeLevelY - 3.5);
      ctx.lineTo(eyeSpacingX - 4, eyeLevelY - 2.5);
      ctx.stroke();

      // Nose & Mouth
      ctx.fillStyle = skinShadow;
      ctx.fillRect(-1, eyeLevelY + 3.5, 2, 3);
      if (k.state === 'beaten') {
        ctx.fillStyle = '#441111';
        ctx.beginPath();
        ctx.arc(0, eyeLevelY + 9, 3, 0, Math.PI);
        ctx.fill();
      } else {
        ctx.strokeStyle = skinShadow;
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.moveTo(-3.5, eyeLevelY + 9);
        ctx.lineTo(3.5, eyeLevelY + 9);
        ctx.stroke();
      }

      // -------------------------------------------------------------
      // 6. ARMS & PRO GOALKEEPER GLOVES
      // -------------------------------------------------------------
      const shoulderY = torsoY + 4;
      const lShoulderX = -torsoTopW * 0.46;
      const rShoulderX = torsoTopW * 0.46;

      let lArmAngle = -0.35;
      let rArmAngle = 0.35;
      let lArmLen = h * 0.36;
      let rArmLen = h * 0.36;

      if (isDive) {
        if (isDiveRight) {
          rArmAngle = -0.95 - (k.diveProgress * 0.5);
          lArmAngle = 0.2;
          rArmLen = h * 0.44;
        } else {
          lArmAngle = 0.95 + (k.diveProgress * 0.5);
          rArmAngle = -0.2;
          lArmLen = h * 0.44;
        }
      } else if (k.state === 'anticipating') {
        lArmAngle = -0.55;
        rArmAngle = 0.55;
      } else if (k.state === 'celebrating') {
        lArmAngle = -2.2;
        rArmAngle = 2.2;
      }

      const renderArmAndGlove = (shoulderX, isLeft, armAngle, armLen) => {
        ctx.save();
        ctx.translate(shoulderX, shoulderY);
        ctx.rotate(armAngle);

        const armWidth = w * 0.16;

        // Jersey Sleeve
        ctx.fillStyle = jerseyGrad;
        ctx.beginPath();
        ctx.roundRect(-armWidth * 0.5, 0, armWidth, armLen * 0.72, 4);
        ctx.fill();

        // Padded Honeycomb Elbow Pad
        ctx.fillStyle = darkColor;
        ctx.fillRect(-armWidth * 0.4, armLen * 0.42, armWidth * 0.8, armLen * 0.22);
        ctx.strokeStyle = primaryColor;
        ctx.lineWidth = 1;
        ctx.strokeRect(-armWidth * 0.4, armLen * 0.42, armWidth * 0.8, armLen * 0.22);

        // Forearm / Wrist
        ctx.fillStyle = skinTone;
        ctx.fillRect(-armWidth * 0.38, armLen * 0.70, armWidth * 0.76, armLen * 0.22);

        // Neoprene Wrist Bandage
        const wristY = armLen * 0.90;
        ctx.fillStyle = '#0e1626';
        ctx.fillRect(-armWidth * 0.45, wristY, armWidth * 0.9, 7);
        ctx.fillStyle = trimColor;
        ctx.fillRect(-armWidth * 0.45, wristY + 2, armWidth * 0.9, 2.5);

        // PRO GOALKEEPER GLOVE HAND
        const handY = wristY + 7;
        const gloveW = armWidth * 1.55;
        const gloveH = armWidth * 1.45;

        // Latex Palm Base
        ctx.fillStyle = gloveLatex;
        ctx.beginPath();
        ctx.roundRect(-gloveW * 0.5, handY, gloveW, gloveH, 6);
        ctx.fill();

        // Silicone Punch-Zone Knuckles
        ctx.fillStyle = primaryColor;
        ctx.fillRect(-gloveW * 0.4, handY + 2, gloveW * 0.8, gloveH * 0.38);

        // Finger Spines
        ctx.strokeStyle = darkColor;
        ctx.lineWidth = 1.2;
        const fingerW = gloveW * 0.2;
        for (let f = 0; f < 4; f++) {
          const fx = -gloveW * 0.38 + f * fingerW;
          ctx.strokeRect(fx, handY + gloveH * 0.4, fingerW, gloveH * 0.55);
        }

        // Thumb wrap
        ctx.fillStyle = gloveLatex;
        const thumbDir = isLeft ? 1 : -1;
        ctx.beginPath();
        ctx.ellipse(thumbDir * gloveW * 0.48, handY + gloveH * 0.35, 4.5, 7, thumbDir * 0.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = darkColor;
        ctx.lineWidth = 1;
        ctx.stroke();

        ctx.restore();
      };

      renderArmAndGlove(lShoulderX, true, lArmAngle, lArmLen);
      renderArmAndGlove(rShoulderX, false, rArmAngle, rArmLen);

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
      let ky = (this.penaltySpotY || (this.goal.bottom + (this.height - this.goal.bottom) * 0.30)) + 4;

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

      // Number on back/chest - taken directly from player tag
      const jerseyNum = this.getJerseyNumber(activeP);

      // Dynamic font sizing based on length to fit torso gracefully
      let fontSize = 12;
      if (jerseyNum.length === 1) fontSize = 13;
      else if (jerseyNum.length === 2) fontSize = 11.5;
      else if (jerseyNum.length === 3) fontSize = 10;
      else fontSize = 9;

      ctx.font = `bold ${fontSize}px Outfit, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      // High contrast jersey number color (crisp white on dark kits, dark on light kits)
      const isLightColor = (hex) => {
        if (!hex || !hex.startsWith('#')) return false;
        const c = hex.replace('#', '');
        const r = parseInt(c.substr(0, 2), 16) || 0;
        const g = parseInt(c.substr(2, 2), 16) || 0;
        const b = parseInt(c.substr(4, 2), 16) || 0;
        return (r * 299 + g * 587 + b * 114) / 1000 > 155;
      };
      ctx.fillStyle = isLightColor(activeP.color) ? '#080c16' : '#ffffff';
      ctx.fillText(jerseyNum, 0, -14);

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

      // Rotating Colored Border around Kicker Head Avatar on Pitch (until result arrives)
      const hasOutcomeArrived = ['goal', 'saved', 'post', 'missed'].includes(this.ball.state);
      if (!hasOutcomeArrived) {
        ctx.save();
        ctx.translate(0, headCenterY);
        const spinAngle = (Date.now() * 0.0035) % (Math.PI * 2);
        ctx.rotate(spinAngle);
        ctx.setLineDash([7, 5]);
        ctx.strokeStyle = activeP.color || '#00f0ff';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(0, 0, headRadius + 3.5, 0, Math.PI * 2);
        ctx.stroke();

        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([3, 9]);
        ctx.beginPath();
        ctx.arc(0, 0, headRadius + 3.5, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }

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
      const baseSpotY = this.penaltySpotY || (this.goal.bottom + (this.height - this.goal.bottom) * 0.30);
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

      const dx = curX - this.ball.dragStartX;
      const dy = curY - this.ball.dragStartY;

      // If user drags backwards/downwards (dy >= -10):
      if (dy >= -10) {
        ctx.save();
        ctx.strokeStyle = 'rgba(255, 42, 109, 0.7)';
        ctx.fillStyle = 'rgba(255, 42, 109, 0.2)';
        ctx.lineWidth = 2;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.arc(bx, by, this.ball.radius * 1.6, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fill();

        ctx.font = '700 12px Inter, sans-serif';
        ctx.fillStyle = '#ff2a6d';
        ctx.textAlign = 'center';
        ctx.fillText('SWIPE FORWARD TO SHOOT ⬆', bx, by + 40);
        ctx.restore();
        return;
      }

      const dist = Math.hypot(dx, dy);
      const power = Math.min(dist / 80, 1.5);

      const refSwipe = Math.max(65, Math.min(130, this.height * 0.13));
      const verticalAimRatio = (-dy) / refSwipe;
      const targetY = this.goal.bottom - (this.goal.bottom - this.goal.top) * ((verticalAimRatio - 0.55) / 0.75);

      const horizontalAimRatio = dx / (refSwipe * 0.7);
      const targetX = (this.width / 2) + horizontalAimRatio * (this.goal.width * 0.52);

      ctx.save();
      ctx.setLineDash([8, 8]);
      ctx.strokeStyle = power > 1.2 ? '#ff2a6d' : (power > 0.8 ? '#ffc837' : '#00f0ff');
      ctx.lineWidth = 3;

      ctx.beginPath();
      ctx.moveTo(bx, by);
      ctx.quadraticCurveTo(
        (bx + targetX) / 2 + (dx * 0.15),
        Math.min(by, targetY) - 30,
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

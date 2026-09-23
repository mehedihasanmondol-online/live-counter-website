/**
 * Live Counter Assistant - Core Application Logic
 * Interactive Swipe, Gestures, Web Audio, Confetti & OBS Streaming Tools
 */

(function () {
  'use strict';

  // Available vibrant player colors
  const PALETTE = [
    { hex: '#00f0ff', rgb: '0, 240, 255', name: 'Electric Cyan' },
    { hex: '#ff2a6d', rgb: '255, 42, 109', name: 'Neon Rose' },
    { hex: '#05ffa1', rgb: '5, 255, 161', name: 'Cyber Emerald' },
    { hex: '#ffc837', rgb: '255, 200, 55', name: 'Tournament Gold' },
    { hex: '#b537f2', rgb: '181, 55, 242', name: 'Ultra Violet' },
    { hex: '#ff7700', rgb: '255, 119, 0', name: 'Blaze Orange' }
  ];

  // Default initial players (Messi vs Ronaldo)
  const DEFAULT_PLAYERS = [
    {
      id: 'p1',
      name: 'Lionel Messi',
      tag: 'LEO 10',
      avatar: 'assets/messi.jpg',
      score: 0,
      color: PALETTE[0].hex,
      colorRgb: PALETTE[0].rgb
    },
    {
      id: 'p2',
      name: 'Cristiano Ronaldo',
      tag: 'CR7',
      avatar: 'assets/ronaldo.jpg',
      score: 0,
      color: PALETTE[1].hex,
      colorRgb: PALETTE[1].rgb
    }
  ];

  // State
  let players = [];
  let targetScore = 100; // 0 or Infinity = Endless
  let undoStack = [];
  let winner = null;
  let isStreamMode = false;
  let currentTheme = 'default'; // 'default', 'chroma-green', 'chroma-blue', 'transparent'
  
  // Timer state
  let timerSeconds = 0;
  let timerInterval = null;
  let isTimerRunning = false;

  // Editing state
  let editingPlayerId = null;

  // DOM Elements
  const arenaGrid = document.getElementById('arena-grid');
  const targetButtons = document.querySelectorAll('.target-btn');
  const targetCustomInput = document.getElementById('target-custom-input');
  const timerDisplay = document.getElementById('timer-display');
  const timerToggleBtn = document.getElementById('timer-toggle-btn');
  const timerResetBtn = document.getElementById('timer-reset-btn');
  const undoBtn = document.getElementById('undo-btn');
  const resetBtn = document.getElementById('reset-btn');
  const addPlayerBtn = document.getElementById('add-player-btn');
  const soundToggleBtn = document.getElementById('sound-toggle-btn');
  const streamToggleBtn = document.getElementById('stream-toggle-btn');
  const themeSelect = document.getElementById('theme-select');
  const shortcutsBtn = document.getElementById('shortcuts-btn');
  const fullscreenBtn = document.getElementById('fullscreen-btn');
  const exitStreamBtn = document.getElementById('exit-stream-btn');

  // Modals
  const winnerModal = document.getElementById('winner-modal');
  const winnerAvatar = document.getElementById('winner-avatar');
  const winnerName = document.getElementById('winner-name');
  const winnerScore = document.getElementById('winner-score');
  const rematchBtn = document.getElementById('rematch-btn');
  const closeWinnerBtn = document.getElementById('close-winner-btn');

  const playerModal = document.getElementById('player-modal');
  const playerNameInput = document.getElementById('player-name-input');
  const playerTagInput = document.getElementById('player-tag-input');
  const playerAvatarInput = document.getElementById('player-avatar-input');
  const avatarUploadFile = document.getElementById('avatar-upload-file');
  const previewAvatarCircle = document.getElementById('preview-avatar-circle');
  const colorSwatchesContainer = document.getElementById('color-swatches');
  const savePlayerBtn = document.getElementById('save-player-btn');
  const deletePlayerBtn = document.getElementById('delete-player-btn');
  const cancelPlayerBtn = document.getElementById('cancel-player-btn');

  const shortcutsModal = document.getElementById('shortcuts-modal');
  const closeShortcutsBtn = document.getElementById('close-shortcuts-btn');

  /* ==========================================================================
     Initialization & Storage
     ========================================================================== */

  function init() {
    loadState();
    renderArena();
    updateTimerDisplay();
    updateSoundButton();
    setupEventListeners();
    setupKeyboardHotkeys();
  }

  function saveState() {
    try {
      localStorage.setItem('live_counter_players', JSON.stringify(players));
      localStorage.setItem('live_counter_target', targetScore.toString());
      localStorage.setItem('live_counter_theme', currentTheme);
    } catch (e) {
      console.warn('Storage save failed:', e);
    }
  }

  function loadState() {
    try {
      const savedPlayers = localStorage.getItem('live_counter_players');
      if (savedPlayers) {
        players = JSON.parse(savedPlayers);
      } else {
        players = JSON.parse(JSON.stringify(DEFAULT_PLAYERS));
      }

      const savedTarget = localStorage.getItem('live_counter_target');
      if (savedTarget !== null) {
        targetScore = parseInt(savedTarget, 10);
      }

      const savedTheme = localStorage.getItem('live_counter_theme');
      if (savedTheme) {
        setTheme(savedTheme);
      }
    } catch (e) {
      players = JSON.parse(JSON.stringify(DEFAULT_PLAYERS));
    }

    // Sync target button UI
    let matchedPreset = false;
    targetButtons.forEach(btn => {
      const val = parseInt(btn.dataset.target, 10);
      if (val === targetScore) {
        btn.classList.add('active');
        matchedPreset = true;
      } else {
        btn.classList.remove('active');
      }
    });

    if (targetCustomInput) {
      if (!matchedPreset && targetScore > 0) {
        targetCustomInput.value = targetScore;
        targetCustomInput.classList.add('active');
      } else {
        targetCustomInput.value = '';
        targetCustomInput.classList.remove('active');
      }
    }
  }

  /* ==========================================================================
     Arena & Cards Rendering
     ========================================================================== */

  function renderArena() {
    arenaGrid.innerHTML = '';

    // Update grid column classes
    arenaGrid.className = 'arena-grid';
    if (players.length === 1) {
      arenaGrid.classList.add('players-1');
    } else if (players.length === 2) {
      arenaGrid.classList.add('players-2');
    } else if (players.length === 3) {
      arenaGrid.classList.add('players-3');
    } else if (players.length === 4) {
      arenaGrid.classList.add('players-4');
    } else {
      arenaGrid.classList.add('players-many');
    }

    // Determine current leader
    const maxScore = Math.max(...players.map(p => p.score));
    const hasLeader = maxScore > 0 && players.filter(p => p.score === maxScore).length === 1;

    // Render each player card
    players.forEach((player, index) => {
      const isLeader = hasLeader && player.score === maxScore;
      const isTension = targetScore > 0 && (targetScore - player.score <= 5) && (targetScore - player.score > 0);
      const progressPercent = targetScore > 0 ? Math.min(100, Math.max(0, (player.score / targetScore) * 100)) : 0;

      const card = document.createElement('div');
      card.className = `player-card ${isLeader ? 'is-leader' : ''} ${isTension ? 'tension-mode' : ''}`;
      card.id = `player-card-${player.id}`;
      card.style.setProperty('--player-color', player.color);
      card.style.setProperty('--player-color-rgb', player.colorRgb);

      card.innerHTML = `
        <div class="card-header">
          <div class="player-meta">
            <div class="avatar-wrapper">
              <img src="${player.avatar}" alt="${player.name}" class="avatar-img" onerror="this.src='data:image/svg+xml;utf8,<svg xmlns=\\'http://www.w3.org/2000/svg\\' width=\\'58\\' height=\\'58\\' viewBox=\\'0 0 24 24\\' fill=\\'%2354627d\\'><path d=\\'M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z\\'/></svg>'">
              <div class="leader-badge" title="Match Leader">👑</div>
            </div>
            <div class="player-details">
              <div class="player-title-row">
                <span class="player-name">${escapeHtml(player.name)}</span>
              </div>
              <span class="player-tag">${escapeHtml(player.tag || `PLAYER ${index + 1}`)}</span>
            </div>
          </div>
          <div class="card-actions">
            <button class="card-icon-btn edit-player-btn" title="Edit Player" data-id="${player.id}">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
            </button>
          </div>
        </div>

        <div class="score-zone" data-id="${player.id}">
          <div class="swipe-hint hint-up">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="18 15 12 9 6 15"></polyline></svg>
            <span>Swipe Up +1</span>
          </div>

          <div class="score-display-wrapper">
            <div class="score-number" id="score-text-${player.id}">${player.score}</div>
          </div>

          <div class="swipe-hint hint-down">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"></polyline></svg>
            <span>Swipe Down -1</span>
          </div>
        </div>

        <div class="card-footer">
          ${targetScore > 0 ? `
            <div class="target-progress-bar" title="${Math.round(progressPercent)}% to target">
              <div class="target-progress-fill" style="width: ${progressPercent}%;"></div>
            </div>
          ` : ''}
          <div class="quick-controls">
            <button class="quick-btn dec" data-id="${player.id}" data-delta="-1" title="Subtract 1">
              -1
            </button>
            <button class="quick-btn inc" data-id="${player.id}" data-delta="1" title="Add 1">
              +1
            </button>
            <button class="quick-btn inc" data-id="${player.id}" data-delta="5" title="Add 5">
              +5
            </button>
          </div>
        </div>
      `;

      arenaGrid.appendChild(card);
      bindCardGestures(card, player);
    });

    // Add VS divider if exactly 2 players
    if (players.length === 2) {
      const vs = document.createElement('div');
      vs.className = 'vs-divider';
      vs.innerText = 'VS';
      arenaGrid.appendChild(vs);
    }
  }

  /* ==========================================================================
     Touch, Drag & Swipe Gestures (Up: +1, Down: -1, Click: +1)
     ========================================================================== */

  function bindCardGestures(card, player) {
    let startY = 0;
    let startX = 0;
    let isDragging = false;
    let hasMovedSignificantly = false;
    const threshold = 35; // Pixels needed for swipe

    const scoreZone = card.querySelector('.score-zone');

    // Pointer events handle both Touch and Mouse seamlessly
    scoreZone.addEventListener('pointerdown', (e) => {
      startY = e.clientY;
      startX = e.clientX;
      isDragging = true;
      hasMovedSignificantly = false;
      scoreZone.setPointerCapture(e.pointerId);
    });

    scoreZone.addEventListener('pointermove', (e) => {
      if (!isDragging) return;
      const diffY = e.clientY - startY;

      if (Math.abs(diffY) > 12) {
        hasMovedSignificantly = true;
      }

      if (diffY < -15) {
        card.classList.add('swipe-up-active');
        card.classList.remove('swipe-down-active');
      } else if (diffY > 15) {
        card.classList.add('swipe-down-active');
        card.classList.remove('swipe-up-active');
      } else {
        card.classList.remove('swipe-up-active', 'swipe-down-active');
      }
    });

    const finishGesture = (e) => {
      if (!isDragging) return;
      isDragging = false;
      card.classList.remove('swipe-up-active', 'swipe-down-active');

      const diffY = e.clientY - startY;

      if (hasMovedSignificantly) {
        if (diffY < -threshold) {
          // Swiped UP -> +1
          modifyScore(player.id, 1, e.clientX, e.clientY);
        } else if (diffY > threshold) {
          // Swiped DOWN -> -1
          modifyScore(player.id, -1, e.clientX, e.clientY);
        }
      } else {
        // Simple Click / Tap on card -> +1
        modifyScore(player.id, 1, e.clientX, e.clientY);
      }
    };

    scoreZone.addEventListener('pointerup', finishGesture);
    scoreZone.addEventListener('pointercancel', () => {
      isDragging = false;
      card.classList.remove('swipe-up-active', 'swipe-down-active');
    });

    // Mouse wheel support (Wheel Up -> +1, Wheel Down -> -1)
    card.addEventListener('wheel', (e) => {
      e.preventDefault();
      if (e.deltaY < 0) {
        modifyScore(player.id, 1, e.clientX, e.clientY);
      } else if (e.deltaY > 0) {
        modifyScore(player.id, -1, e.clientX, e.clientY);
      }
    }, { passive: false });
  }

  /* ==========================================================================
     Score Modification & Sound / Animation Trigger
     ========================================================================== */

  function modifyScore(playerId, delta, clientX = null, clientY = null) {
    const player = players.find(p => p.id === playerId);
    if (!player) return;

    const prevScore = player.score;
    const newScore = Math.max(0, player.score + delta);

    if (prevScore === newScore && delta < 0) return; // Can't go below 0

    // Push to undo stack
    undoStack.push({
      playerId,
      prevScore,
      newScore
    });

    player.score = newScore;
    saveState();

    // Trigger audio
    if (delta > 0) {
      if (window.soundEngine) window.soundEngine.playIncrement(player.score);
    } else {
      if (window.soundEngine) window.soundEngine.playDecrement();
    }

    // Animate score element
    const scoreTextEl = document.getElementById(`score-text-${playerId}`);
    if (scoreTextEl) {
      scoreTextEl.innerText = player.score;
      scoreTextEl.classList.remove('pop-up', 'pop-down');
      void scoreTextEl.offsetWidth; // Force reflow
      scoreTextEl.classList.add(delta > 0 ? 'pop-up' : 'pop-down');
    }

    // Spawn floating particle badge
    spawnParticle(playerId, delta, clientX, clientY);

    // Check if target reached
    if (targetScore > 0 && player.score >= targetScore) {
      triggerWin(player);
      return;
    }

    // Check for near-target tension sound
    if (targetScore > 0 && targetScore - player.score <= 3 && targetScore - player.score > 0 && delta > 0) {
      if (window.soundEngine) window.soundEngine.playTension();
    }

    // Refresh arena state (leaders, progress bars, tension mode)
    renderArena();
  }

  function spawnParticle(playerId, delta, clientX, clientY) {
    const card = document.getElementById(`player-card-${playerId}`);
    if (!card) return;

    const particle = document.createElement('div');
    particle.className = `floating-particle ${delta > 0 ? 'increment' : 'decrement'}`;
    particle.innerText = delta > 0 ? `+${delta}` : `${delta}`;

    if (clientX !== null && clientY !== null) {
      particle.style.left = `${clientX}px`;
      particle.style.top = `${clientY}px`;
      document.body.appendChild(particle);
    } else {
      const rect = card.getBoundingClientRect();
      particle.style.left = `${rect.left + rect.width / 2}px`;
      particle.style.top = `${rect.top + rect.height / 2}px`;
      document.body.appendChild(particle);
    }

    setTimeout(() => {
      if (particle.parentNode) {
        particle.parentNode.removeChild(particle);
      }
    }, 750);
  }

  /* ==========================================================================
     Win Celebration & Fanfare
     ========================================================================== */

  function triggerWin(player) {
    winner = player;

    // Victory fanfare & Confetti Cannon Blasts
    if (window.soundEngine) window.soundEngine.playFanfare();
    if (window.confettiEngine) window.confettiEngine.fireworks();

    // Show celebration modal
    winnerName.innerText = player.name;
    winnerAvatar.src = player.avatar;
    winnerScore.innerText = `FINAL SCORE: ${player.score}`;
    winnerModal.classList.add('show');
  }

  /* ==========================================================================
     Timer / Stopwatch Engine
     ========================================================================== */

  function updateTimerDisplay() {
    const mins = Math.floor(timerSeconds / 60);
    const secs = timerSeconds % 60;
    timerDisplay.innerText = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }

  function toggleTimer() {
    if (isTimerRunning) {
      clearInterval(timerInterval);
      isTimerRunning = false;
      timerToggleBtn.classList.remove('active');
      timerToggleBtn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>`;
    } else {
      isTimerRunning = true;
      timerToggleBtn.classList.add('active');
      timerToggleBtn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect></svg>`;
      timerInterval = setInterval(() => {
        timerSeconds++;
        updateTimerDisplay();
      }, 1000);
    }
  }

  function resetTimer() {
    clearInterval(timerInterval);
    isTimerRunning = false;
    timerSeconds = 0;
    timerToggleBtn.classList.remove('active');
    timerToggleBtn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>`;
    updateTimerDisplay();
  }

  /* ==========================================================================
     Undo Stack
     ========================================================================== */

  function handleUndo() {
    if (undoStack.length === 0) return;
    const lastAction = undoStack.pop();
    const player = players.find(p => p.id === lastAction.playerId);
    if (!player) return;

    player.score = lastAction.prevScore;
    saveState();
    if (window.soundEngine) window.soundEngine.playDecrement();
    renderArena();
  }

  /* ==========================================================================
     Theme & OBS Overlay
     ========================================================================== */

  function setTheme(themeName) {
    currentTheme = themeName;
    document.body.classList.remove('theme-chroma-green', 'theme-chroma-blue', 'theme-transparent');

    if (themeName === 'chroma-green') {
      document.body.classList.add('theme-chroma-green');
    } else if (themeName === 'chroma-blue') {
      document.body.classList.add('theme-chroma-blue');
    } else if (themeName === 'transparent') {
      document.body.classList.add('theme-transparent');
    }

    if (themeSelect) {
      themeSelect.value = themeName;
    }
    saveState();
  }

  function toggleStreamMode() {
    isStreamMode = !isStreamMode;
    if (isStreamMode) {
      document.body.classList.add('stream-mode');
    } else {
      document.body.classList.remove('stream-mode');
    }
  }

  function updateSoundButton() {
    const muted = window.soundEngine ? window.soundEngine.isMuted() : false;
    soundToggleBtn.innerHTML = muted
      ? `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="1" y1="1" x2="23" y2="23"></line><path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6"></path><path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23"></path><line x1="12" y1="19" x2="12" y2="23"></line><line x1="8" y1="23" x2="16" y2="23"></line></svg>`
      : `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path></svg>`;
  }

  /* ==========================================================================
     Player Editor & Creation Modal
     ========================================================================== */

  let selectedColor = PALETTE[0].hex;
  let selectedColorRgb = PALETTE[0].rgb;

  function renderColorSwatches() {
    colorSwatchesContainer.innerHTML = '';
    PALETTE.forEach(c => {
      const swatch = document.createElement('div');
      swatch.className = `color-swatch ${c.hex === selectedColor ? 'active' : ''}`;
      swatch.style.backgroundColor = c.hex;
      swatch.style.color = c.hex;
      swatch.addEventListener('click', () => {
        selectedColor = c.hex;
        selectedColorRgb = c.rgb;
        renderColorSwatches();
        previewAvatarCircle.style.borderColor = c.hex;
      });
      colorSwatchesContainer.appendChild(swatch);
    });
  }

  function openPlayerModal(playerId = null) {
    editingPlayerId = playerId;
    renderColorSwatches();

    if (playerId) {
      const p = players.find(x => x.id === playerId);
      if (p) {
        playerNameInput.value = p.name;
        playerTagInput.value = p.tag || '';
        playerAvatarInput.value = p.avatar;
        previewAvatarCircle.src = p.avatar;
        selectedColor = p.color;
        selectedColorRgb = p.colorRgb;
        renderColorSwatches();
        deletePlayerBtn.style.display = players.length > 1 ? 'block' : 'none';
      }
    } else {
      // Adding new player
      const nextIndex = players.length + 1;
      const nextColor = PALETTE[(players.length) % PALETTE.length];
      selectedColor = nextColor.hex;
      selectedColorRgb = nextColor.rgb;
      renderColorSwatches();

      playerNameInput.value = `Player ${nextIndex}`;
      playerTagInput.value = `P${nextIndex}`;
      playerAvatarInput.value = '';
      previewAvatarCircle.src = 'data:image/svg+xml;utf8,<svg xmlns=\'http://www.w3.org/2000/svg\' width=\'64\' height=\'64\' viewBox=\'0 0 24 24\' fill=\'%2354627d\'><circle cx=\'12\' cy=\'12\' r=\'10\'/></svg>';
      deletePlayerBtn.style.display = 'none';
    }

    previewAvatarCircle.style.borderColor = selectedColor;
    playerModal.classList.add('show');
  }

  function savePlayer() {
    const name = playerNameInput.value.trim() || 'Player';
    const tag = playerTagInput.value.trim() || 'PRO';
    const avatar = playerAvatarInput.value.trim() || 'data:image/svg+xml;utf8,<svg xmlns=\'http://www.w3.org/2000/svg\' width=\'58\' height=\'58\' viewBox=\'0 0 24 24\' fill=\'%2354627d\'><circle cx=\'12\' cy=\'12\' r=\'10\'/></svg>';

    if (editingPlayerId) {
      const p = players.find(x => x.id === editingPlayerId);
      if (p) {
        p.name = name;
        p.tag = tag;
        p.avatar = avatar;
        p.color = selectedColor;
        p.colorRgb = selectedColorRgb;
      }
    } else {
      // Add new
      const newId = 'p_' + Date.now();
      players.push({
        id: newId,
        name,
        tag,
        avatar,
        score: 0,
        color: selectedColor,
        colorRgb: selectedColorRgb
      });
    }

    saveState();
    renderArena();
    playerModal.classList.remove('show');
  }

  function deletePlayer() {
    if (!editingPlayerId || players.length <= 1) return;
    players = players.filter(p => p.id !== editingPlayerId);
    saveState();
    renderArena();
    playerModal.classList.remove('show');
  }

  /* ==========================================================================
     Event Listeners
     ========================================================================== */

  function setupEventListeners() {
    // Arena delegate for quick buttons and edit triggers
    arenaGrid.addEventListener('click', (e) => {
      const quickBtn = e.target.closest('.quick-btn');
      if (quickBtn) {
        e.stopPropagation();
        const id = quickBtn.dataset.id;
        const delta = parseInt(quickBtn.dataset.delta, 10);
        modifyScore(id, delta, e.clientX, e.clientY);
        return;
      }

      const editBtn = e.target.closest('.edit-player-btn');
      if (editBtn) {
        e.stopPropagation();
        const id = editBtn.dataset.id;
        openPlayerModal(id);
      }
    });

    // Target buttons
    targetButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        targetButtons.forEach(b => b.classList.remove('active'));
        if (targetCustomInput) {
          targetCustomInput.classList.remove('active');
          targetCustomInput.value = '';
        }
        btn.classList.add('active');
        targetScore = parseInt(btn.dataset.target, 10);
        saveState();
        renderArena();
      });
    });

    // Manual custom target input
    if (targetCustomInput) {
      const applyCustomTarget = () => {
        const val = parseInt(targetCustomInput.value, 10);
        if (!isNaN(val) && val > 0) {
          targetButtons.forEach(b => b.classList.remove('active'));
          targetCustomInput.classList.add('active');
          targetScore = val;
          saveState();
          renderArena();
        } else if (targetCustomInput.value.trim() === '') {
          // If cleared, default to 0 / endless until typed
          targetScore = 0;
          saveState();
          renderArena();
        }
      };

      targetCustomInput.addEventListener('focus', () => {
        targetButtons.forEach(b => b.classList.remove('active'));
        targetCustomInput.classList.add('active');
      });

      targetCustomInput.addEventListener('input', applyCustomTarget);
      targetCustomInput.addEventListener('change', applyCustomTarget);

      targetCustomInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          applyCustomTarget();
          targetCustomInput.blur();
        }
      });
    }

    // Timer controls
    timerToggleBtn.addEventListener('click', toggleTimer);
    timerResetBtn.addEventListener('click', resetTimer);

    // Undo button
    undoBtn.addEventListener('click', handleUndo);

    // Reset Match Scores
    resetBtn.addEventListener('click', () => {
      if (confirm('Are you sure you want to reset all scores to 0?')) {
        players.forEach(p => p.score = 0);
        undoStack = [];
        saveState();
        if (window.soundEngine) window.soundEngine.playReset();
        if (window.confettiEngine) window.confettiEngine.clear();
        renderArena();
      }
    });

    // Add Player button
    addPlayerBtn.addEventListener('click', () => openPlayerModal(null));

    // Sound toggle button
    soundToggleBtn.addEventListener('click', () => {
      if (window.soundEngine) {
        window.soundEngine.toggleMute();
        updateSoundButton();
      }
    });

    // Stream overlay toggle
    streamToggleBtn.addEventListener('click', toggleStreamMode);
    exitStreamBtn.addEventListener('click', toggleStreamMode);

    // Theme selector
    if (themeSelect) {
      themeSelect.addEventListener('change', (e) => {
        setTheme(e.target.value);
      });
    }

    // Fullscreen toggle
    fullscreenBtn.addEventListener('click', () => {
      if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(() => {});
      } else {
        document.exitFullscreen().catch(() => {});
      }
    });

    // Shortcuts modal
    shortcutsBtn.addEventListener('click', () => shortcutsModal.classList.add('show'));
    closeShortcutsBtn.addEventListener('click', () => shortcutsModal.classList.remove('show'));

    // Winner modal buttons
    rematchBtn.addEventListener('click', () => {
      players.forEach(p => p.score = 0);
      undoStack = [];
      saveState();
      winnerModal.classList.remove('show');
      if (window.confettiEngine) window.confettiEngine.clear();
      renderArena();
    });

    closeWinnerBtn.addEventListener('click', () => {
      winnerModal.classList.remove('show');
      if (window.confettiEngine) window.confettiEngine.clear();
    });

    // Player editor modal buttons
    savePlayerBtn.addEventListener('click', savePlayer);
    deletePlayerBtn.addEventListener('click', deletePlayer);
    cancelPlayerBtn.addEventListener('click', () => playerModal.classList.remove('show'));

    // Avatar preview input update
    playerAvatarInput.addEventListener('input', () => {
      previewAvatarCircle.src = playerAvatarInput.value || '';
    });

    // File upload for avatar
    avatarUploadFile.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = (event) => {
          playerAvatarInput.value = event.target.result;
          previewAvatarCircle.src = event.target.result;
        };
        reader.readAsDataURL(file);
      }
    });
  }

  /* ==========================================================================
     Streamer Keyboard Hotkeys
     ========================================================================== */

  function setupKeyboardHotkeys() {
    window.addEventListener('keydown', (e) => {
      // Don't trigger hotkeys if user is currently typing in an input field
      if (['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName)) {
        return;
      }

      // Hotkeys 1 - 9 (Increment Player 1 - 9) / Shift + 1 - 9 (Decrement)
      if (e.key >= '1' && e.key <= '9') {
        const index = parseInt(e.key, 10) - 1;
        if (index < players.length) {
          const delta = e.shiftKey ? -1 : 1;
          modifyScore(players[index].id, delta);
          e.preventDefault();
        }
        return;
      }

      // Undo with Z or Ctrl+Z
      if ((e.key === 'z' || e.key === 'Z') && !e.altKey) {
        handleUndo();
        e.preventDefault();
        return;
      }

      // Space -> Start/Stop Timer
      if (e.code === 'Space') {
        toggleTimer();
        e.preventDefault();
        return;
      }

      // H -> Stream Overlay Mode
      if (e.key === 'h' || e.key === 'H') {
        toggleStreamMode();
        e.preventDefault();
        return;
      }

      // M -> Mute / Unmute
      if (e.key === 'm' || e.key === 'M') {
        if (window.soundEngine) {
          window.soundEngine.toggleMute();
          updateSoundButton();
        }
        e.preventDefault();
        return;
      }

      // R -> Reset Scores
      if (e.key === 'r' || e.key === 'R') {
        resetBtn.click();
        e.preventDefault();
        return;
      }

      // F -> Fullscreen
      if (e.key === 'f' || e.key === 'F') {
        fullscreenBtn.click();
        e.preventDefault();
        return;
      }

      // ? or / -> Shortcuts modal
      if (e.key === '?' || e.key === '/') {
        shortcutsModal.classList.toggle('show');
        e.preventDefault();
      }
    });
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.innerText = str;
    return div.innerHTML;
  }

  // Run on DOM load
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();

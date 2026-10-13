(() => {
  'use strict';

  // ---------- constants ----------

  const COLS = 10;
  const ROWS = 22;
  const HIDDEN = 2;
  const VISIBLE = ROWS - HIDDEN;
  const CELL = 30;

  const DAS = 167;
  const ARR = 33;
  const SOFT_DROP_FACTOR = 20;
  const LOCK_DELAY = 500;
  const MAX_LOCK_RESETS = 15;
  const CLEAR_TIME = 320;
  const MAX_START_LEVEL = 15;

  const LINE_SCORES = [0, 100, 300, 500, 800];
  const LINE_NAMES = ['', 'Single', 'Double', 'Triple', 'TETRIS!'];

  // [base, light, dark]
  const COLORS = {
    I: ['#00d8f0', '#8af3ff', '#00869c'],
    O: ['#ffd23f', '#fff0a6', '#c49a00'],
    T: ['#a55cff', '#d6b0ff', '#6a25c2'],
    S: ['#3ddc84', '#a2f5c6', '#1d9654'],
    Z: ['#ff4d6d', '#ffa3b3', '#b81f3d'],
    J: ['#3d7bff', '#9cbcff', '#1d48b8'],
    L: ['#ff9233', '#ffc999', '#c25e0a'],
    X: ['#4a5170', '#6d7596', '#2c3047'],
  };

  const SHAPES = {
    I: [[0, 0, 0, 0], [1, 1, 1, 1], [0, 0, 0, 0], [0, 0, 0, 0]],
    J: [[1, 0, 0], [1, 1, 1], [0, 0, 0]],
    L: [[0, 0, 1], [1, 1, 1], [0, 0, 0]],
    O: [[1, 1], [1, 1]],
    S: [[0, 1, 1], [1, 1, 0], [0, 0, 0]],
    T: [[0, 1, 0], [1, 1, 1], [0, 0, 0]],
    Z: [[1, 1, 0], [0, 1, 1], [0, 0, 0]],
  };

  // Super Rotation System wall kicks, (x right, y up).
  const KICKS = {
    '0>1': [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]],
    '1>0': [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]],
    '1>2': [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]],
    '2>1': [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]],
    '2>3': [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]],
    '3>2': [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],
    '3>0': [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],
    '0>3': [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]],
  };
  const KICKS_I = {
    '0>1': [[0, 0], [-2, 0], [1, 0], [-2, -1], [1, 2]],
    '1>0': [[0, 0], [2, 0], [-1, 0], [2, 1], [-1, -2]],
    '1>2': [[0, 0], [-1, 0], [2, 0], [-1, 2], [2, -1]],
    '2>1': [[0, 0], [1, 0], [-2, 0], [1, -2], [-2, 1]],
    '2>3': [[0, 0], [2, 0], [-1, 0], [2, 1], [-1, -2]],
    '3>2': [[0, 0], [-2, 0], [1, 0], [-2, -1], [1, 2]],
    '3>0': [[0, 0], [1, 0], [-2, 0], [1, -2], [-2, 1]],
    '0>3': [[0, 0], [-1, 0], [2, 0], [-1, 2], [2, -1]],
  };

  // ---------- state ----------

  let board;
  let bag = [];
  let queue = [];
  let piece = null;
  let holdType = null;
  let canHold = true;
  let score = 0;
  let lines = 0;
  let level = 1;
  let startLevel = 1;
  let backToBack = false;
  let state = 'menu'; // menu | playing | clearing | paused | over
  let pausedFrom = 'playing';
  let elapsed = 0;
  let gravityAcc = 0;
  let lockTimer = 0;
  let lockResets = 0;
  let lowestY = 0;
  let clearingRows = [];
  let clearTimer = 0;
  let softDrop = false;
  const held = { left: false, right: false };
  let das = { dir: 0, timer: 0, arr: 0 };
  let savedRank = null;

  // ---------- core rules ----------

  const emptyRow = () => Array(COLS).fill(null);
  const emptyBoard = () => Array.from({ length: ROWS }, emptyRow);

  function rotateCW(m) {
    const n = m.length;
    return m.map((row, y) => row.map((_, x) => m[n - 1 - x][y]));
  }

  function shuffle(a) {
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function nextFromBag() {
    if (!bag.length) bag = shuffle(Object.keys(SHAPES));
    return bag.pop();
  }

  function fillQueue() {
    while (queue.length < 6) queue.push(nextFromBag());
  }

  function collides(m, px, py) {
    for (let y = 0; y < m.length; y++) {
      for (let x = 0; x < m[y].length; x++) {
        if (!m[y][x]) continue;
        const bx = px + x;
        const by = py + y;
        if (bx < 0 || bx >= COLS || by >= ROWS) return true;
        if (by >= 0 && board[by][bx]) return true;
      }
    }
    return false;
  }

  const grounded = () => collides(piece.m, piece.x, piece.y + 1);

  function gravityMs() {
    const l = Math.min(level, 20);
    return Math.pow(0.8 - (l - 1) * 0.007, l - 1) * 1000;
  }

  function spawn(type) {
    const m = SHAPES[type].map((r) => r.slice());
    piece = { type, m, rot: 0, x: Math.floor((COLS - m.length) / 2), y: 0 };
    if (collides(piece.m, piece.x, piece.y)) {
      gameOver();
      return;
    }
    if (!grounded()) piece.y++;
    lowestY = piece.y;
    lockTimer = 0;
    lockResets = 0;
    gravityAcc = 0;
  }

  function spawnNext() {
    fillQueue();
    const type = queue.shift();
    fillQueue();
    canHold = true;
    spawn(type);
    drawPreviews();
  }

  function noteDescent() {
    if (piece.y > lowestY) {
      lowestY = piece.y;
      lockTimer = 0;
      lockResets = 0;
    }
  }

  function noteShift(wasGrounded) {
    if (wasGrounded && lockResets < MAX_LOCK_RESETS) {
      lockTimer = 0;
      lockResets++;
    }
  }

  function shift(dx) {
    if (!piece || collides(piece.m, piece.x + dx, piece.y)) return false;
    const wasGrounded = grounded();
    piece.x += dx;
    noteShift(wasGrounded);
    noteDescent();
    return true;
  }

  function rotate(dir) {
    if (!piece || piece.type === 'O') return false;
    let m = rotateCW(piece.m);
    if (dir < 0) m = rotateCW(rotateCW(m));
    const from = piece.rot;
    const to = (from + dir + 4) % 4;
    const kicks = (piece.type === 'I' ? KICKS_I : KICKS)[from + '>' + to];
    const wasGrounded = grounded();
    for (const [kx, ky] of kicks) {
      const nx = piece.x + kx;
      const ny = piece.y - ky;
      if (!collides(m, nx, ny)) {
        piece.m = m;
        piece.x = nx;
        piece.y = ny;
        piece.rot = to;
        noteShift(wasGrounded);
        noteDescent();
        return true;
      }
    }
    return false;
  }

  function dropDistance() {
    let d = 0;
    while (!collides(piece.m, piece.x, piece.y + d + 1)) d++;
    return d;
  }

  function hardDrop() {
    if (!piece) return;
    const d = dropDistance();
    piece.y += d;
    score += d * 2;
    lock();
  }

  function hold() {
    if (!piece || !canHold) return;
    const current = piece.type;
    if (holdType) {
      const swap = holdType;
      holdType = current;
      spawn(swap);
    } else {
      holdType = current;
      fillQueue();
      spawn(queue.shift());
      fillQueue();
    }
    canHold = false;
    drawPreviews();
  }

  function lock() {
    let aboveField = true;
    const { m, x: px, y: py, type } = piece;
    for (let y = 0; y < m.length; y++) {
      for (let x = 0; x < m[y].length; x++) {
        if (!m[y][x]) continue;
        const by = py + y;
        if (by >= 0) board[by][px + x] = type;
        if (by >= HIDDEN) aboveField = false;
      }
    }
    piece = null;
    if (aboveField) {
      gameOver();
      return;
    }
    const full = [];
    for (let y = 0; y < ROWS; y++) if (board[y].every(Boolean)) full.push(y);
    if (full.length) {
      award(full.length);
      clearingRows = full;
      clearTimer = 0;
      state = 'clearing';
    } else {
      spawnNext();
    }
  }

  function award(n) {
    const prevLevel = level;
    let points = LINE_SCORES[n] * level;
    const b2b = n === 4 && backToBack;
    if (b2b) points = Math.floor(points * 1.5);
    backToBack = n === 4;
    score += points;
    lines += n;
    level = Math.max(startLevel, Math.floor(lines / 10) + 1);
    toast(b2b ? 'Back-to-Back TETRIS!' : LINE_NAMES[n], n === 4 ? 'big' : '');
    if (level > prevLevel) toast('Level ' + level, 'level');
  }

  function finishClear() {
    for (const y of clearingRows) {
      board.splice(y, 1);
      board.unshift(emptyRow());
    }
    clearingRows = [];
    state = 'playing';
    spawnNext();
  }

  function update(dt) {
    elapsed += dt;

    if (das.dir) {
      das.timer += dt;
      if (das.timer >= DAS) {
        das.arr += dt;
        while (das.arr >= ARR) {
          das.arr -= ARR;
          if (!shift(das.dir)) {
            das.arr = 0;
            break;
          }
        }
      }
    }
    if (!piece) return;

    const g = softDrop ? gravityMs() / SOFT_DROP_FACTOR : gravityMs();
    gravityAcc += dt;
    let steps = 0;
    while (gravityAcc >= g && steps < ROWS) {
      gravityAcc -= g;
      steps++;
      if (grounded()) {
        gravityAcc = 0;
        break;
      }
      piece.y++;
      if (softDrop) score += 1;
      noteDescent();
    }

    if (grounded()) {
      lockTimer += dt;
      if (lockTimer >= LOCK_DELAY) lock();
    }
  }

  function newGame() {
    board = emptyBoard();
    bag = [];
    queue = [];
    holdType = null;
    score = 0;
    lines = 0;
    level = startLevel;
    backToBack = false;
    elapsed = 0;
    clearingRows = [];
    softDrop = false;
    savedRank = null;
    das = { dir: held.left ? -1 : held.right ? 1 : 0, timer: 0, arr: 0 };
    document.querySelectorAll('.toast').forEach((t) => t.remove());
    state = 'playing';
    showPane(null);
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    spawnNext();
  }

  function gameOver() {
    piece = null;
    state = 'over';
    softDrop = false;
    ui.finalScore.textContent = score.toLocaleString();
    ui.finalLines.textContent = lines.toLocaleString();
    ui.finalLevel.textContent = level;
    ui.saveForm.hidden = false;
    ui.savedBox.hidden = true;
    ui.nameInput.value = localStorage.getItem('tetris.lastName') || '';
    showPane('over');
    setTimeout(() => { ui.nameInput.focus(); ui.nameInput.select(); }, 50);
  }

  function togglePause() {
    if (state === 'playing' || state === 'clearing') {
      pausedFrom = state;
      state = 'paused';
      softDrop = false;
      showPane('pause');
    } else if (state === 'paused') {
      state = pausedFrom;
      showPane(null);
      if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    }
  }

  // ---------- rendering ----------

  const DPR = Math.min(window.devicePixelRatio || 1, 3);
  const boardCanvas = document.getElementById('board');
  const bctx = setupCanvas(boardCanvas, COLS * CELL, VISIBLE * CELL);
  const holdCanvas = document.getElementById('hold');
  const nextCanvas = document.getElementById('next');
  const hctx = setupCanvas(holdCanvas, +holdCanvas.dataset.w, +holdCanvas.dataset.h);
  const nctx = setupCanvas(nextCanvas, +nextCanvas.dataset.w, +nextCanvas.dataset.h);
  const sprites = new Map();

  function setupCanvas(cv, w, h) {
    cv.width = Math.round(w * DPR);
    cv.height = Math.round(h * DPR);
    cv.style.aspectRatio = w + ' / ' + h;
    const c = cv.getContext('2d');
    c.scale(DPR, DPR);
    return c;
  }

  function roundRect(c, x, y, w, h, r) {
    c.beginPath();
    c.moveTo(x + r, y);
    c.arcTo(x + w, y, x + w, y + h, r);
    c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r);
    c.arcTo(x, y, x + w, y, r);
    c.closePath();
  }

  function sprite(type, size, ghost) {
    const key = type + size + (ghost ? 'g' : '');
    if (sprites.has(key)) return sprites.get(key);
    const cv = document.createElement('canvas');
    cv.width = cv.height = Math.round(size * DPR);
    const c = cv.getContext('2d');
    c.scale(DPR, DPR);
    const [base, light, dark] = COLORS[type];
    const p = 1;
    const s = size - 2 * p;
    const r = size * 0.18;
    if (ghost) {
      roundRect(c, p + 1, p + 1, s - 2, s - 2, r);
      c.fillStyle = base + '22';
      c.fill();
      c.lineWidth = 2;
      c.strokeStyle = base + 'aa';
      c.stroke();
    } else {
      const g = c.createLinearGradient(0, 0, size, size);
      g.addColorStop(0, light);
      g.addColorStop(0.45, base);
      g.addColorStop(1, dark);
      roundRect(c, p, p, s, s, r);
      c.fillStyle = g;
      c.fill();
      const inset = size * 0.2;
      roundRect(c, p + inset, p + inset, s - 2 * inset, s - 2 * inset, r * 0.6);
      c.fillStyle = 'rgba(255,255,255,0.10)';
      c.fill();
      const shine = c.createLinearGradient(0, 0, 0, size * 0.5);
      shine.addColorStop(0, 'rgba(255,255,255,0.55)');
      shine.addColorStop(1, 'rgba(255,255,255,0)');
      roundRect(c, p + 2, p + 2, s - 4, s * 0.42, r * 0.8);
      c.fillStyle = shine;
      c.fill();
      roundRect(c, p + 0.5, p + 0.5, s - 1, s - 1, r);
      c.lineWidth = 1;
      c.strokeStyle = 'rgba(0,0,0,0.35)';
      c.stroke();
    }
    sprites.set(key, cv);
    return cv;
  }

  function drawCell(c, type, x, y, size, ghost) {
    c.drawImage(sprite(type, size, ghost), x, y, size, size);
  }

  function drawBoard() {
    const c = bctx;
    const W = COLS * CELL;
    const H = VISIBLE * CELL;
    const bg = c.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, '#0d1130');
    bg.addColorStop(1, '#070918');
    c.fillStyle = bg;
    c.fillRect(0, 0, W, H);

    c.strokeStyle = 'rgba(140,160,255,0.06)';
    c.lineWidth = 1;
    c.beginPath();
    for (let x = 1; x < COLS; x++) { c.moveTo(x * CELL + 0.5, 0); c.lineTo(x * CELL + 0.5, H); }
    for (let y = 1; y < VISIBLE; y++) { c.moveTo(0, y * CELL + 0.5); c.lineTo(W, y * CELL + 0.5); }
    c.stroke();

    if (!board) return;
    const over = state === 'over';
    for (let y = HIDDEN; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        const t = board[y][x];
        if (t) drawCell(c, over ? 'X' : t, x * CELL, (y - HIDDEN) * CELL, CELL);
      }
    }

    if (clearingRows.length) {
      const p = Math.min(clearTimer / CLEAR_TIME, 1);
      const w = W * (1 - p);
      for (const y of clearingRows) {
        const top = (y - HIDDEN) * CELL;
        c.fillStyle = 'rgba(7,9,24,' + Math.min(p * 1.6, 1) + ')';
        c.fillRect(0, top, W, CELL);
        c.fillStyle = 'rgba(255,255,255,' + (0.9 * (1 - p)) + ')';
        c.fillRect((W - w) / 2, top + 2, w, CELL - 4);
      }
    }

    if (piece) {
      const d = dropDistance();
      eachCell(piece, (x, y) => drawCell(c, piece.type, x * CELL, (y + d - HIDDEN) * CELL, CELL, true));
      eachCell(piece, (x, y) => drawCell(c, piece.type, x * CELL, (y - HIDDEN) * CELL, CELL));
    }
  }

  function eachCell(p, fn) {
    for (let y = 0; y < p.m.length; y++) {
      for (let x = 0; x < p.m[y].length; x++) {
        if (p.m[y][x]) fn(p.x + x, p.y + y);
      }
    }
  }

  function drawMini(c, type, cx, cy, size, dim) {
    const m = SHAPES[type];
    let minX = 9, maxX = -1, minY = 9, maxY = -1;
    m.forEach((row, y) => row.forEach((v, x) => {
      if (!v) return;
      minX = Math.min(minX, x); maxX = Math.max(maxX, x);
      minY = Math.min(minY, y); maxY = Math.max(maxY, y);
    }));
    const ox = cx - ((maxX - minX + 1) * size) / 2;
    const oy = cy - ((maxY - minY + 1) * size) / 2;
    c.globalAlpha = dim ? 0.35 : 1;
    m.forEach((row, y) => row.forEach((v, x) => {
      if (v) drawCell(c, dim ? 'X' : type, ox + (x - minX) * size, oy + (y - minY) * size, size);
    }));
    c.globalAlpha = 1;
  }

  function drawPreviews() {
    const hw = +holdCanvas.dataset.w, hh = +holdCanvas.dataset.h;
    hctx.clearRect(0, 0, hw, hh);
    if (holdType) drawMini(hctx, holdType, hw / 2, hh / 2, 22, !canHold);

    const nw = +nextCanvas.dataset.w, nh = +nextCanvas.dataset.h;
    nctx.clearRect(0, 0, nw, nh);
    const slot = nh / 5;
    for (let i = 0; i < 5 && i < queue.length; i++) {
      drawMini(nctx, queue[i], nw / 2, slot * i + slot / 2, i === 0 ? 22 : 18);
    }
  }

  // ---------- HUD & overlays ----------

  const $ = (id) => document.getElementById(id);
  const ui = {
    wrap: $('boardWrap'), overlay: $('overlay'),
    score: $('score'), level: $('level'), lines: $('lines'), time: $('time'),
    best: $('best'), liveRank: $('liveRank'),
    panes: { menu: $('paneMenu'), pause: $('panePause'), over: $('paneOver') },
    finalScore: $('finalScore'), finalLines: $('finalLines'), finalLevel: $('finalLevel'),
    saveForm: $('saveForm'), nameInput: $('nameInput'), savedBox: $('savedBox'), savedRank: $('savedRank'),
    lvlValue: $('lvlValue'),
  };
  const shown = {};

  function setText(el, value) {
    const v = String(value);
    if (shown[el.id] !== v) {
      shown[el.id] = v;
      el.textContent = v;
    }
  }

  function formatTime(ms) {
    const s = Math.floor(ms / 1000);
    return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
  }

  function updateHud() {
    setText(ui.score, score.toLocaleString());
    setText(ui.level, level);
    setText(ui.lines, lines);
    setText(ui.time, formatTime(elapsed));
    setText(ui.best, Math.max(HallOfFame.best(), score).toLocaleString());
    const rank = savedRank || HallOfFame.rankFor(score);
    setText(ui.liveRank, state === 'menu' ? '–' : '#' + rank.toLocaleString());
  }

  function showPane(name) {
    ui.overlay.hidden = !name;
    for (const [key, el] of Object.entries(ui.panes)) el.hidden = key !== name;
  }

  function toast(text, cls) {
    if (!text) return;
    const el = document.createElement('div');
    el.className = 'toast ' + (cls || '');
    el.textContent = text;
    ui.wrap.appendChild(el);
    el.addEventListener('animationend', () => el.remove());
  }

  function setStartLevel(n) {
    startLevel = Math.min(MAX_START_LEVEL, Math.max(1, n));
    ui.lvlValue.textContent = startLevel;
    if (state === 'menu') level = startLevel;
  }

  // ---------- input ----------

  const CODE_ACTIONS = {
    ArrowLeft: 'left', ArrowRight: 'right', ArrowDown: 'soft', ArrowUp: 'cw',
    Space: 'hard', ShiftLeft: 'hold', ShiftRight: 'hold', ControlLeft: 'ccw', ControlRight: 'ccw',
    Escape: 'pause', Enter: 'start', NumpadEnter: 'start',
  };
  const KEY_ACTIONS = { x: 'cw', z: 'ccw', y: 'ccw', c: 'hold', p: 'pause' };
  const GAME_ACTIONS = new Set(['left', 'right', 'soft', 'hard', 'cw', 'ccw', 'hold']);

  function actionFor(e) {
    return CODE_ACTIONS[e.code] || KEY_ACTIONS[(e.key || '').toLowerCase()] || null;
  }

  function press(action) {
    if (action === 'left' || action === 'right') {
      held[action] = true;
      const dir = action === 'left' ? -1 : 1;
      das = { dir, timer: 0, arr: 0 };
      if (state === 'playing') shift(dir);
      return;
    }
    if (action === 'pause') { togglePause(); return; }
    if (action === 'start') {
      if (state === 'menu') newGame();
      else if (state === 'paused') togglePause();
      return;
    }
    if (state !== 'playing') return;
    switch (action) {
      case 'soft': softDrop = true; break;
      case 'hard': hardDrop(); break;
      case 'cw': rotate(1); break;
      case 'ccw': rotate(-1); break;
      case 'hold': hold(); break;
    }
  }

  function release(action) {
    if (action === 'left' || action === 'right') {
      held[action] = false;
      const dir = action === 'left' ? -1 : 1;
      if (das.dir === dir) {
        const other = action === 'left' ? 'right' : 'left';
        das = { dir: held[other] ? -dir : 0, timer: 0, arr: 0 };
      }
    } else if (action === 'soft') {
      softDrop = false;
    }
  }

  document.addEventListener('keydown', (e) => {
    const tag = e.target.tagName;
    if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
    const action = actionFor(e);
    if (!action) return;
    const inGame = state === 'playing' || state === 'clearing' || state === 'paused';
    if (action === 'start' && tag === 'BUTTON') return;
    if (GAME_ACTIONS.has(action) && inGame) e.preventDefault();
    if (action === 'hard' && state === 'menu') e.preventDefault();
    if (e.repeat) return;
    press(action === 'hard' && state === 'menu' ? 'start' : action);
  });

  document.addEventListener('keyup', (e) => {
    const action = actionFor(e);
    if (action) release(action);
  });

  window.addEventListener('blur', () => {
    held.left = held.right = false;
    das = { dir: 0, timer: 0, arr: 0 };
    softDrop = false;
    if (state === 'playing' || state === 'clearing') togglePause();
  });

  document.querySelectorAll('#touch button').forEach((btn) => {
    const action = btn.dataset.action;
    btn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      btn.setPointerCapture(e.pointerId);
      press(action);
    });
    const up = () => release(action);
    btn.addEventListener('pointerup', up);
    btn.addEventListener('pointercancel', up);
    btn.addEventListener('contextmenu', (e) => e.preventDefault());
  });

  $('btnStart').addEventListener('click', newGame);
  $('btnResume').addEventListener('click', togglePause);
  $('btnRestart').addEventListener('click', newGame);
  $('btnEnd').addEventListener('click', gameOver);
  $('btnAgain').addEventListener('click', newGame);
  $('btnSkip').addEventListener('click', () => { state = 'menu'; board = emptyBoard(); showPane('menu'); });
  $('btnShowHof').addEventListener('click', () => HallOfFame.reveal());
  $('lvlDown').addEventListener('click', () => setStartLevel(startLevel - 1));
  $('lvlUp').addEventListener('click', () => setStartLevel(startLevel + 1));

  ui.saveForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const name = ui.nameInput.value.trim();
    if (name) localStorage.setItem('tetris.lastName', name);
    const rank = HallOfFame.add({ name, score, lines, level, time: elapsed / 1000 });
    savedRank = rank;
    ui.savedRank.textContent = '#' + rank.toLocaleString() + ' of ' + HallOfFame.count().toLocaleString();
    ui.saveForm.hidden = true;
    ui.savedBox.hidden = false;
    $('btnAgain').focus();
  });

  // ---------- main loop ----------

  let last = performance.now();
  function frame(now) {
    const dt = Math.min(now - last, 100);
    last = now;
    if (state === 'playing') {
      update(dt);
    } else if (state === 'clearing') {
      elapsed += dt;
      clearTimer += dt;
      if (clearTimer >= CLEAR_TIME) finishClear();
    }
    drawBoard();
    updateHud();
    requestAnimationFrame(frame);
  }

  HallOfFame.init();
  board = emptyBoard();
  setStartLevel(1);
  showPane('menu');
  drawPreviews();
  requestAnimationFrame(frame);
})();

// محرّك الألعاب — كل لعبة ترجع دالة init(container, onEnd)
const Games = {};

/* ============ 1) الأفعى ============ */
Games.snake = function (el, onEnd) {
  el.innerHTML = `<div class="hud"><span>النقاط: <b id="sc">0</b></span><span>اسحب أو استخدم الأسهم</span></div>
    <canvas id="board" width="320" height="320"></canvas>`;
  const c = el.querySelector('#board'), x = c.getContext('2d'), G = 16, N = 20;
  let snake = [{ x: 8, y: 8 }], dir = { x: 1, y: 0 }, food = rnd(), score = 0, dead = false;
  function rnd() { return { x: (Math.random() * N) | 0, y: (Math.random() * N) | 0 }; }
  const key = e => {
    const m = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] }[e.key];
    if (m && !(m[0] === -dir.x && m[1] === -dir.y)) { dir = { x: m[0], y: m[1] }; e.preventDefault(); }
  };
  document.addEventListener('keydown', key);
  let sx, sy;
  c.addEventListener('touchstart', e => { sx = e.touches[0].clientX; sy = e.touches[0].clientY; });
  c.addEventListener('touchmove', e => {
    e.preventDefault(); if (sx == null) return;
    const dx = e.touches[0].clientX - sx, dy = e.touches[0].clientY - sy;
    if (Math.abs(dx) + Math.abs(dy) < 24) return;
    const n = Math.abs(dx) > Math.abs(dy) ? { x: Math.sign(dx), y: 0 } : { x: 0, y: Math.sign(dy) };
    if (!(n.x === -dir.x && n.y === -dir.y)) dir = n;
    sx = null;
  });
  const t = setInterval(step, 110);
  function step() {
    const h = { x: (snake[0].x + dir.x + N) % N, y: (snake[0].y + dir.y + N) % N };
    if (snake.some(s => s.x === h.x && s.y === h.y)) return end();
    snake.unshift(h);
    if (h.x === food.x && h.y === food.y) { score += 10; el.querySelector('#sc').textContent = score; food = rnd(); }
    else snake.pop();
    draw();
  }
  function draw() {
    x.fillStyle = '#0a0f1c'; x.fillRect(0, 0, 320, 320);
    x.fillStyle = '#ffc531'; x.fillRect(food.x * G + 2, food.y * G + 2, G - 4, G - 4);
    snake.forEach((s, i) => { x.fillStyle = i ? '#22d3a6' : '#7c5cff'; x.fillRect(s.x * G + 1, s.y * G + 1, G - 2, G - 2); });
  }
  function end() { if (dead) return; dead = true; clearInterval(t); document.removeEventListener('keydown', key); onEnd(score); }
  draw();
  return () => { dead = true; clearInterval(t); document.removeEventListener('keydown', key); };
};

/* ============ 2) الذاكرة ============ */
Games.memory = function (el, onEnd) {
  const ic = ['🍉', '🚀', '🐱', '⚽', '🎧', '🔥', '🌙', '💎'];
  const deck = [...ic, ...ic].sort(() => Math.random() - .5);
  el.innerHTML = `<div class="hud"><span>المحاولات: <b id="mv">0</b></span><span>الوقت: <b id="tm">0</b>ث</span></div>
    <div class="mgrid" id="g"></div>`;
  const g = el.querySelector('#g'); let open = [], moves = 0, done = 0, lock = false, t0 = Date.now();
  const timer = setInterval(() => el.querySelector('#tm').textContent = ((Date.now() - t0) / 1000) | 0, 500);
  deck.forEach((v, i) => {
    const d = document.createElement('div'); d.className = 'mcell'; d.dataset.v = v;
    d.onclick = () => {
      if (lock || d.classList.contains('open') || d.classList.contains('done')) return;
      d.classList.add('open'); d.textContent = v; open.push(d);
      if (open.length === 2) {
        moves++; el.querySelector('#mv').textContent = moves; lock = true;
        setTimeout(() => {
          if (open[0].dataset.v === open[1].dataset.v) { open.forEach(o => o.className = 'mcell done'); done += 2; }
          else open.forEach(o => { o.className = 'mcell'; o.textContent = ''; });
          open = []; lock = false;
          if (done === deck.length) { clearInterval(timer); const sec = (Date.now() - t0) / 1000; onEnd(Math.max(50, Math.round(2000 - sec * 15 - moves * 20))); }
        }, 520);
      }
    };
    g.appendChild(d);
  });
  return () => clearInterval(timer);
};

/* ============ 3) سرعة البديهة ============ */
Games.reaction = function (el, onEnd) {
  el.innerHTML = `<div class="hud"><span>الجولة: <b id="rn">1</b>/5</span><span>المتوسط: <b id="av">-</b></span></div>
    <div id="rbox">انتظر اللون الأخضر...</div>`;
  const b = el.querySelector('#rbox'); let round = 0, times = [], ready = false, t0 = 0, to;
  function next() {
    round++; if (round > 5) { const avg = times.reduce((a, c) => a + c, 0) / times.length; return onEnd(Math.max(50, Math.round(100000 / avg))); }
    el.querySelector('#rn').textContent = round;
    b.style.background = '#2a3350'; b.textContent = 'استعد...'; ready = false;
    to = setTimeout(() => { ready = true; t0 = performance.now(); b.style.background = '#22d3a6'; b.style.color = '#04140f'; b.textContent = 'اضغط الآن!'; }, 900 + Math.random() * 2200);
  }
  b.onclick = () => {
    if (!ready) { clearTimeout(to); b.style.background = '#c0392b'; b.textContent = 'مبكر جدًا! أعد المحاولة'; round--; return setTimeout(next, 800); }
    const d = performance.now() - t0; times.push(d);
    b.style.background = '#2a3350'; b.style.color = '#fff'; b.textContent = Math.round(d) + ' ملّي ثانية';
    el.querySelector('#av').textContent = Math.round(times.reduce((a, c) => a + c, 0) / times.length) + 'ms';
    setTimeout(next, 800);
  };
  next();
  return () => clearTimeout(to);
};

/* ============ 4) 2048 ============ */
Games.merge2048 = function (el, onEnd) {
  el.innerHTML = `<div class="hud"><span>النقاط: <b id="sc">0</b></span><span>أسهم أو سحب</span></div>
    <canvas id="board" width="320" height="320"></canvas>`;
  const c = el.querySelector('#board'), x = c.getContext('2d');
  let b = Array.from({ length: 4 }, () => [0, 0, 0, 0]), score = 0, over = false;
  const COL = { 2: '#233052', 4: '#2c3d63', 8: '#7c5cff', 16: '#8e6bff', 32: '#ff9f1c', 64: '#ff8000', 128: '#ffc531', 256: '#ffd75e', 512: '#22d3a6', 1024: '#12b48a', 2048: '#ff3b6b' };
  function add() { const f = []; b.forEach((r, i) => r.forEach((v, j) => !v && f.push([i, j]))); if (!f.length) return false; const [i, j] = f[(Math.random() * f.length) | 0]; b[i][j] = Math.random() < .9 ? 2 : 4; return true; }
  function draw() {
    x.fillStyle = '#0a0f1c'; x.fillRect(0, 0, 320, 320);
    for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
      const v = b[i][j], px = j * 80 + 5, py = i * 80 + 5;
      x.fillStyle = v ? (COL[v] || '#ff3b6b') : '#111726';
      x.beginPath(); x.roundRect(px, py, 70, 70, 10); x.fill();
      if (v) { x.fillStyle = '#fff'; x.font = 'bold ' + (v > 512 ? 20 : 26) + 'px sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(v, px + 35, py + 36); }
    }
  }
  const slide = row => { const a = row.filter(v => v); for (let i = 0; i < a.length - 1; i++) if (a[i] === a[i + 1]) { a[i] *= 2; score += a[i]; a.splice(i + 1, 1); } while (a.length < 4) a.push(0); return a; };
  const rot = m => m[0].map((_, i) => m.map(r => r[i]).reverse());
  function move(d) {
    if (over) return; const before = JSON.stringify(b);
    for (let k = 0; k < d; k++) b = rot(b);
    b = b.map(slide);
    for (let k = 0; k < (4 - d) % 4; k++) b = rot(b);
    if (JSON.stringify(b) !== before) { add(); el.querySelector('#sc').textContent = score; }
    draw();
    if (!canMove()) { over = true; onEnd(score); }
  }
  function canMove() { for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) { if (!b[i][j]) return true; if (j < 3 && b[i][j] === b[i][j + 1]) return true; if (i < 3 && b[i][j] === b[i + 1][j]) return true; } return false; }
  const key = e => { const m = { ArrowLeft: 0, ArrowUp: 1, ArrowRight: 2, ArrowDown: 3 }[e.key]; if (m !== undefined) { e.preventDefault(); move(m); } };
  document.addEventListener('keydown', key);
  let sx, sy;
  c.addEventListener('touchstart', e => { sx = e.touches[0].clientX; sy = e.touches[0].clientY; });
  c.addEventListener('touchend', e => {
    if (sx == null) return; const dx = e.changedTouches[0].clientX - sx, dy = e.changedTouches[0].clientY - sy;
    if (Math.abs(dx) + Math.abs(dy) < 24) return;
    move(Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 0 : 2) : (dy < 0 ? 1 : 3)); sx = null;
  });
  add(); add(); draw();
  return () => document.removeEventListener('keydown', key);
};

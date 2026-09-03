const track = (type, meta = {}) => fetch('/api/track', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type, ...meta }) }).catch(() => { });
const isPro = () => localStorage.getItem('pro') === '1';
let GAMES = [], cleanup = null, current = null;
const modal = document.getElementById('modal'), sheet = document.getElementById('sheet');

function goPro(src) {
  track('upgrade_click', { src });
  sheet.innerHTML = `<h3>💎 ترقية إلى PRO</h3>
    <p>أزل الإعلانات نهائيًا واحصل على شارة ذهبية وسمات حصرية.</p>
    <div class="pricing" style="grid-template-columns:1fr 1fr">
      <div class="plan"><h3>شهري</h3><div class="price">4.99$</div><button class="btn btn-gold" style="width:100%" onclick="pay('monthly')">اشترك</button></div>
      <div class="plan pro"><h3>سنوي</h3><div class="price">39$</div><button class="btn btn-gold" style="width:100%" onclick="pay('yearly')">وفّر 35%</button></div>
    </div>
    <button class="btn btn-ghost" style="width:100%;margin-top:8px" onclick="closeModal()">لاحقًا</button>`;
  modal.classList.add('on');
}
function pay(plan) {
  track('checkout_start', { plan });
  // اربط هنا بوابة الدفع (Stripe / Paddle / تابي). حاليًا وضع تجريبي.
  localStorage.setItem('pro', '1');
  sheet.innerHTML = `<h3>✅ تم التفعيل (وضع تجريبي)</h3><p>PRO مفعّل — لا إعلانات بعد الآن. اربط Stripe في app.js لتحصيل حقيقي.</p>
    <button class="btn btn-gold" onclick="closeModal()">تم</button>`;
  document.querySelectorAll('.ad').forEach(a => a.remove());
}
function closeModal() { modal.classList.remove('on'); if (cleanup) { cleanup(); cleanup = null; } }
modal.addEventListener('click', e => { if (e.target === modal) closeModal(); });

async function boot() {
  GAMES = await (await fetch('/api/games')).json();
  document.getElementById('grid').innerHTML = GAMES.map(g => `
    <div class="card" onclick="play('${g.id}')">
      <span class="tag">${g.tag}</span>
      <div class="ico">${g.emoji}</div><h3>${g.name}</h3><p>${g.desc}</p>
      <button class="btn btn-gold" style="width:100%">العب الآن</button>
    </div>`).join('');
  const s = await (await fetch('/api/stats')).json();
  document.getElementById('s-plays').textContent = s.plays;
  document.getElementById('s-scores').textContent = s.totalScores;
  if (isPro()) document.querySelectorAll('.ad').forEach(a => a.remove());
  else track('ad_view', { slot: 'home_banner' });
}

function play(id) {
  current = GAMES.find(g => g.id === id);
  track('play', { game: id });
  sheet.innerHTML = `<h3>${current.emoji} ${current.name}</h3><div id="stage"></div>`;
  modal.classList.add('on');
  cleanup = Games[id](document.getElementById('stage'), score => finish(id, score));
}

async function finish(id, score) {
  if (cleanup) { cleanup(); cleanup = null; }
  const adBlock = isPro() ? '' : `<div class="ad" id="interstitial"><b>إعلان بيني 336×280</b>ترقّ إلى PRO لإزالة الإعلانات</div>`;
  if (!isPro()) track('ad_view', { slot: 'interstitial' });
  sheet.innerHTML = `<h3>انتهت الجولة!</h3><p>نتيجتك: <b style="color:var(--acc);font-size:24px">${score}</b></p>
    ${adBlock}
    <input id="nm" placeholder="اسمك للوحة الصدارة" value="${localStorage.getItem('nm') || ''}"
      style="width:100%;padding:12px;border-radius:12px;border:1px solid var(--line);background:var(--card2);color:var(--txt);font-family:inherit;text-align:center">
    <div style="display:flex;gap:8px;margin-top:12px">
      <button class="btn btn-gold" style="flex:1" onclick="submitScore('${id}',${score})">احفظ النتيجة</button>
      <button class="btn btn-ghost" style="flex:1" onclick="play('${id}')">إعادة</button>
    </div>
    ${isPro() ? '' : `<button class="btn btn-ghost" style="width:100%;margin-top:8px" onclick="goPro('endgame')">💎 إزالة الإعلانات — PRO</button>`}
    <div class="lb" id="lb">جارٍ تحميل لوحة الصدارة...</div>`;
  loadLB(id);
}

async function submitScore(id, score) {
  const name = document.getElementById('nm').value || 'لاعب';
  localStorage.setItem('nm', name);
  const r = await (await fetch('/api/score', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ game: id, name, score }) })).json();
  loadLB(id);
  document.getElementById('lb').insertAdjacentHTML('beforebegin', `<p style="color:var(--ok);margin-top:10px">✅ ترتيبك #${r.rank}</p>`);
}

async function loadLB(id) {
  const t = await (await fetch('/api/leaderboard/' + id)).json();
  document.getElementById('lb').innerHTML = '<h4 style="margin:14px 0 6px">🏆 أفضل 10</h4>' +
    (t.length ? t.map((s, i) => `<div><span>${i + 1}. ${s.name}</span><b>${s.score}</b></div>`).join('') : '<div>كن أول لاعب!</div>');
}
boot();

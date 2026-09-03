const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const DB = path.join(__dirname, 'data.json');
const load = () => { try { return JSON.parse(fs.readFileSync(DB, 'utf8')); } catch { return { scores: [], users: {}, events: [] }; } };
const save = (d) => fs.writeFileSync(DB, JSON.stringify(d, null, 2));

// ألعاب المنصة
const GAMES = [
  { id: 'snake', name: 'الأفعى الذهبية', desc: 'كل، اكبر، ولا تصطدم.', emoji: '🐍', tag: 'كلاسيكي' },
  { id: 'memory', name: 'ذاكرة الرموز', desc: 'اعثر على الأزواج بأسرع وقت.', emoji: '🧠', tag: 'ذكاء' },
  { id: 'reaction', name: 'سرعة البديهة', desc: 'اضغط بأسرع ما يمكن.', emoji: '⚡', tag: 'سرعة' },
  { id: 'merge2048', name: '2048 دمج', desc: 'ادمج الأرقام للوصول إلى 2048.', emoji: '🔢', tag: 'ألغاز' }
];

app.get('/api/games', (_, res) => res.json(GAMES));

app.get('/api/leaderboard/:game', (req, res) => {
  const d = load();
  const top = d.scores.filter(s => s.game === req.params.game)
    .sort((a, b) => b.score - a.score).slice(0, 10);
  res.json(top);
});

app.post('/api/score', (req, res) => {
  const { game, name, score } = req.body || {};
  if (!game || typeof score !== 'number') return res.status(400).json({ error: 'bad' });
  const d = load();
  d.scores.push({ game, name: (name || 'لاعب').slice(0, 16), score: Math.round(score), at: Date.now() });
  save(d);
  const rank = d.scores.filter(s => s.game === game && s.score > score).length + 1;
  res.json({ ok: true, rank });
});

// تتبّع أحداث الربح (مشاهدات إعلانات / نقرات ترقية)
app.post('/api/track', (req, res) => {
  const d = load();
  d.events.push({ ...req.body, at: Date.now() });
  if (d.events.length > 5000) d.events = d.events.slice(-5000);
  save(d);
  res.json({ ok: true });
});

app.get('/api/stats', (_, res) => {
  const d = load();
  const adViews = d.events.filter(e => e.type === 'ad_view').length;
  const upgrades = d.events.filter(e => e.type === 'upgrade_click').length;
  const plays = d.events.filter(e => e.type === 'play').length;
  const eCPM = 4.5; // تقدير الدخل لكل ألف ظهور بالدولار
  res.json({
    plays, adViews, upgrades,
    estimatedAdRevenue: +(adViews / 1000 * eCPM).toFixed(2),
    estimatedSubRevenue: +(upgrades * 0.12 * 4.99).toFixed(2), // تحويل مقدّر 12%
    totalScores: d.scores.length
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => console.log('Gametey running on ' + PORT));

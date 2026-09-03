'use strict';
const crypto = require('crypto');

/** تنسيق المبلغ بالدينار العراقي: 1,500,000 د.ع */
function formatIQD(n) {
  const v = Math.round(Number(n) || 0);
  return v.toLocaleString('en-US') + ' د.ع';
}

function toInt(v, fallback = 0) {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : fallback;
}

function slugify(text) {
  const s = String(text || '')
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '');
  return s || 'item';
}

function uniqueSlug(base, existsFn) {
  let slug = slugify(base);
  let candidate = slug;
  let i = 2;
  while (existsFn(candidate)) {
    candidate = `${slug}-${i++}`;
  }
  return candidate;
}

/** رقم طلب فريد: AM-YYMMDD-XXXX */
function generateOrderNumber(existsFn) {
  const d = new Date();
  const ymd = [String(d.getFullYear()).slice(2), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')].join('');
  for (let i = 0; i < 25; i++) {
    const rand = crypto.randomInt(1000, 10000);
    const num = `AM-${ymd}-${rand}`;
    if (!existsFn(num)) return num;
  }
  throw new Error('تعذر إنشاء رقم طلب فريد');
}

/** التحقق من رقم هاتف عراقي وتوحيده إلى 07XXXXXXXXX */
function normalizeIraqiPhone(raw) {
  if (!raw) return null;
  let p = String(raw).replace(/[\s\-().]/g, '');
  if (/^\+?9647\d{9}$/.test(p)) p = '0' + p.replace(/^\+?964/, '');
  if (/^07\d{9}$/.test(p)) return p;
  return null;
}

const NAME_RE = /^[\p{L}\p{M}\s.'-]{3,80}$/u;

function validateOrderInput(input) {
  const errors = {};
  const name = String(input.name || '').trim();
  const phoneRaw = String(input.phone || '').trim();
  const governorate = String(input.governorate || '').trim();
  const area = String(input.area || '').trim();
  const landmark = String(input.landmark || '').trim().slice(0, 200);
  const address = String(input.address || '').trim().slice(0, 500);
  const locationLink = String(input.location_link || '').trim().slice(0, 500);
  const notes = String(input.notes || '').trim().slice(0, 1000);

  if (!NAME_RE.test(name)) errors.name = 'يرجى إدخال الاسم الكامل بشكل صحيح (3 أحرف على الأقل).';
  const phone = normalizeIraqiPhone(phoneRaw);
  if (!phone) errors.phone = 'يرجى إدخال رقم هاتف عراقي صحيح، مثال: 07701234567';
  if (!governorate) errors.governorate = 'يرجى اختيار المحافظة.';
  if (!area || area.length < 2) errors.area = 'يرجى إدخال المنطقة.';
  if (locationLink && !/^https:\/\/(maps\.google\.com|maps\.app\.goo\.gl|www\.google\.com\/maps|google\.com\/maps)\//.test(locationLink)) {
    errors.location_link = 'رابط الموقع غير صالح.';
  }

  return {
    ok: Object.keys(errors).length === 0,
    errors,
    value: { name, phone, governorate, area, landmark, address, location_link: locationLink, notes },
  };
}

function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function fmtDate(isoStr, withTime = true) {
  if (!isoStr) return '';
  try {
    const d = new Date(isoStr.replace(' ', 'T') + (isoStr.includes('T') ? '' : 'Z'));
    const date = d.toLocaleDateString('ar-IQ-u-nu-latn', { year: 'numeric', month: '2-digit', day: '2-digit' });
    if (!withTime) return date;
    const time = d.toLocaleTimeString('ar-IQ-u-nu-latn', { hour: '2-digit', minute: '2-digit' });
    return `${date} - ${time}`;
  } catch {
    return isoStr;
  }
}

/** مهل بسيط في الذاكرة لحماية نقاط النهاية الحساسة */
class WindowLimiter {
  constructor({ windowMs, max }) {
    this.windowMs = windowMs;
    this.max = max;
    this.map = new Map();
  }
  hit(key) {
    const now = Date.now();
    let rec = this.map.get(key);
    if (!rec || now > rec.resetAt) {
      rec = { count: 0, resetAt: now + this.windowMs };
      this.map.set(key, rec);
    }
    rec.count += 1;
    if (this.map.size > 5000) {
      for (const [k, v] of this.map) if (now > v.resetAt) this.map.delete(k);
    }
    return rec.count <= this.max;
  }
}

/** توقيع قصير (HMAC) لروابط صفحة النجاح — يتيح تجهيز رابط واتساب من الخادم دون تخزين محلي */
function signToken(value) {
  return crypto.createHmac('sha256', require('./config').jwtSecret).update(String(value)).digest('hex').slice(0, 24);
}
function verifyToken(value, token) {
  if (!token) return false;
  const expected = signToken(value);
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(String(token).padEnd(24, '0').slice(0, 24)));
  } catch {
    return false;
  }
}

module.exports = {
  formatIQD, toInt, slugify, uniqueSlug, generateOrderNumber,
  normalizeIraqiPhone, validateOrderInput, escapeHtml, fmtDate, WindowLimiter,
  signToken, verifyToken,
};

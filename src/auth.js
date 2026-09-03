'use strict';
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const config = require('./config');
const { db, audit } = require('./db');

const PUBLIC_PATH = '/admin/login';

/** التحقق من توكن الجلسة (كوكي) وتحميل بيانات المدير */
function loadAdminFromRequest(req) {
  const token = req.cookies && req.cookies[config.cookieName];
  if (!token) return null;
  try {
    const payload = jwt.verify(token, config.jwtSecret);
    if (payload.typ !== 'admin') return null;
    const user = db.prepare('SELECT * FROM admin_users WHERE id = ?').get(payload.sub);
    if (!user || !user.is_active) return null;
    // جلسات صادرة قبل آخر تسجيل خروج (أو في ثانيته) تُرفض (إبطال فعلي)
    if (user.revoked_at && payload.iat && payload.iat <= Math.floor(new Date(user.revoked_at.replace(' ', 'T') + 'Z').getTime() / 1000)) return null;
    return user;
  } catch {
    return null;
  }
}

function issueToken(user) {
  return jwt.sign(
    { typ: 'admin', sub: user.id, role: user.role, username: user.username },
    config.jwtSecret,
    { expiresIn: config.jwtExpiresIn }
  );
}

function cookieOptions(req) {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: !!(req && (req.secure || process.env.PROD_SECURE === 'true')), // د2: secure خلف HTTPS
    path: '/',
    maxAge: 10 * 60 * 60 * 1000,
  };
}

/** يتطلب تسجيل دخول — يعيد توجيه الزوار إلى صفحة الدخول */
function requireAuth(req, res, next) {
  const user = loadAdminFromRequest(req);
  if (!user) {
    if (req.originalUrl.startsWith('/api/')) return res.status(401).json({ error: 'غير مصرح. يرجى تسجيل الدخول.' });
    return res.redirect(PUBLIC_PATH + '?next=' + encodeURIComponent(req.originalUrl));
  }
  req.admin = user;
  next();
}

/**
 * RBAC حقيقي على مستوى الخادم — صلاحية موحدة:
 * الحسابات الإدارية الثلاثة كلها ADMIN بنفس الصلاحيات الكاملة لإدارة المتجر.
 */
const FULL_PERMISSIONS = new Set([
  'dashboard.view',
  'products.view', 'products.create', 'products.update', 'products.delete',
  'images.upload', 'images.delete',
  'categories.manage',
  'prices.manage', 'installments.manage', 'discounts.manage',
  'options.manage',
  'products.toggle',
  'orders.view', 'orders.update_status', 'orders.internal_notes', 'orders.export',
  'customers.view',
  'files.view', 'files.manage', 'files.payments',
  'users.manage',
  'settings.manage',
  'audit.view', 'audit.clear',
]);

const PERMISSIONS = { ADMIN: FULL_PERMISSIONS };

function can(user, permission) {
  if (!user) return false;
  const set = PERMISSIONS[user.role];
  return !!(set && set.has(permission));
}

/** وسيط يفرض صلاحية محددة — يمنع أي تجاوز حتى مع الاستدعاء اليدوي للـ API */
function requirePermission(permission) {
  return (req, res, next) => {
    if (!req.admin) return res.status(401).json({ error: 'غير مصرح.' });
    if (!can(req.admin, permission)) {
      if (req.path.startsWith('/api/') || req.originalUrl.startsWith('/api/')) {
        return res.status(403).json({ error: 'ليست لديك صلاحية لتنفيذ هذه العملية.' });
      }
      return res.status(403).render('admin/error', {
        title: 'غير مصرح',
        message: 'ليست لديك صلاحية للوصول إلى هذه الصفحة.',
        admin: req.admin,
      });
    }
    next();
  };
}

function hashPassword(plain) {
  return bcrypt.hashSync(plain, 10);
}

function verifyPassword(plain, hash) {
  return bcrypt.compareSync(plain, hash);
}

/** تسجيل دخول مع حماية من التخمين */
const loginAttempts = new Map();
function checkLoginLimit(ip) {
  const now = Date.now();
  const rec = loginAttempts.get(ip);
  if (!rec || now > rec.resetAt) return true;
  return rec.count < config.loginMaxAttempts;
}
function registerLoginFail(ip) {
  const now = Date.now();
  const rec = loginAttempts.get(ip);
  if (!rec || now > rec.resetAt) loginAttempts.set(ip, { count: 1, resetAt: now + config.loginWindowMs });
  else rec.count += 1;
}
function clearLoginLimit(ip) {
  loginAttempts.delete(ip);
}

async function login(identifier, password, ip) {
  if (!checkLoginLimit(ip)) {
    return { ok: false, error: 'تم تجاوز عدد محاولات الدخول المسموح. حاول لاحقًا.' };
  }
  const user = db.prepare(
    'SELECT * FROM admin_users WHERE username = ? OR email = ?'
  ).get(String(identifier || '').trim(), String(identifier || '').trim());

  if (!user) {
    registerLoginFail(ip);
    return { ok: false, error: 'بيانات الدخول غير صحيحة.' };
  }

  // التحقق من كلمة المرور: Supabase Auth أولًا إن كان مفعّلًا، وإلا التحقق المحلي bcrypt
  const supabase = require('./supabase');
  let verified = null;
  if (supabase.isConfigured()) {
    verified = await supabase.verifyWithSupabase(user.email, String(password || ''));
  }
  if (verified === null) {
    verified = verifyPassword(String(password || ''), user.password_hash);
  }
  if (!verified) {
    registerLoginFail(ip);
    return { ok: false, error: 'بيانات الدخول غير صحيحة.' };
  }

  if (!user.is_active) {
    return { ok: false, error: 'هذا الحساب معطل. تواصل مع المدير الرئيسي.' };
  }
  clearLoginLimit(ip);
  db.prepare("UPDATE admin_users SET last_login_at = datetime('now') WHERE id = ?").run(user.id);
  audit({ admin: user, action: 'LOGIN', entityType: 'admin_user', entityId: user.id, ip, newValue: { via: verified && supabase.isConfigured() ? 'supabase' : 'local' } });
  return { ok: true, user, token: issueToken(user) };
}

function logout(req, res) {
  if (req.admin) {
    // إبطال كل الجلسات الصادرة قبل هذه اللحظة لهذا الحساب
    db.prepare("UPDATE admin_users SET revoked_at = datetime('now') WHERE id = ?").run(req.admin.id);
    audit({ admin: req.admin, action: 'LOGOUT', entityType: 'admin_user', entityId: req.admin.id, ip: req.ip });
  }
  res.clearCookie(config.cookieName, { path: '/' });
}

module.exports = {
  loadAdminFromRequest, issueToken, cookieOptions,
  requireAuth, requirePermission, can, PERMISSIONS,
  hashPassword, verifyPassword, login, logout,
};

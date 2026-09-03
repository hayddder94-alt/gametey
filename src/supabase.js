'use strict';
/**
 * تكامل Supabase Auth الرسمي (@supabase/supabase-js).
 *
 * يُفعَّل بتوفير متغيرات البيئة:
 *   SUPABASE_URL            مثال: https://xxxx.supabase.co
 *   SUPABASE_ANON_KEY       المفتاح العام anon
 *   SUPABASE_SERVICE_ROLE_KEY  (اختياري) لإنشاء الحسابات الإدارية برمجيًا عند أول تشغيل
 *   SUPABASE_FALLBACK_LOCAL=true  (اختياري) السماح بالتحقق المحلي إذا تعذر الوصول لـ Supabase
 *
 * بدون هذه المتغيرات يعمل النظام بالتحقق المحلي الآمن (bcrypt) تلقائيًا.
 */

let client = null;
let adminClient = null;

function isConfigured() {
  return !!(process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY);
}

function getClient() {
  if (!isConfigured()) return null;
  if (!client) {
    const { createClient } = require('@supabase/supabase-js');
    client = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
  }
  return client;
}

function getAdminClient() {
  if (!isConfigured() || !process.env.SUPABASE_SERVICE_ROLE_KEY) return null;
  if (!adminClient) {
    const { createClient } = require('@supabase/supabase-js');
    adminClient = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return adminClient;
}

/** توثيق تسجيل دخول عبر Supabase Auth؛ يعيد true/false */
async function verifyWithSupabase(email, password) {
  const sb = getClient();
  if (!sb) return null; // غير مفعّل
  try {
    const { data, error } = await sb.auth.signInWithPassword({ email, password });
    if (error || !data.user) return false;
    if (!data.user.email_confirmed_at && data.user.email_confirmed_at !== null) return true;
    return true;
  } catch {
    return process.env.SUPABASE_FALLBACK_LOCAL === 'true' ? null : false;
  }
}

/** إنشاء الحسابات الإدارية الثلاثة داخل Supabase Auth عند أول تشغيل (يتطلب service role) */
async function ensureAdminUsers(list) {
  const admin = getAdminClient();
  if (!admin) return false;
  for (const u of list) {
    try {
      const { data } = await admin.auth.admin.listUsers({ perPage: 200 });
      const exists = (data.users || []).some((x) => x.email === u.email);
      if (exists) continue;
      await admin.auth.admin.createUser({
        email: u.email,
        password: u.password,
        email_confirm: true,
        user_metadata: { full_name: u.full_name, role: 'ADMIN' },
      });
      console.log('[supabase] أُنشئ حساب الإدارة:', u.email);
    } catch (e) {
      console.warn('[supabase] تعذر إنشاء الحساب', u.email, e.message);
    }
  }
  return true;
}

module.exports = { isConfigured, getClient, getAdminClient, verifyWithSupabase, ensureAdminUsers };

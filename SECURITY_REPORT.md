# SECURITY REPORT
- secret-scan (شجرة+تاريخ): لا أسرار حية متتبعة؛ الحرفيات القديمة ميتة ومرفوضة (E3).
- تدوير: كلمة المالك المسربة في دردشة سابقة دُوِّرت؛ قديمة مرفوضة 401؛ جديدة تعمل (غير مطبوعة؛ بملف data خارج Git).
- JWT: سر مولّد 96 hex خارج Git؛ توكن بالسر القديم مرفوض 302.
- Headers: CSP nonce + HSTS(env) + nosniff + Referrer + Permissions-Policy (أدلة curl محفوظة).
- AuthN/AuthZ: 401/403 matrix PASS؛ إبطال جلسات revoked_at PASS.
- Input: zod + escaping + رفض وسوم بالاسم؛ SQLi آمن؛ upload magic-bytes.
- semgrep (قواعد محلية): 0 findings. zizmor على CI: 0 findings بعد تثبيت SHA + permissions: contents: read.
- npm audit: 0. SBOM: artifacts/sbom.spdx.json (368).

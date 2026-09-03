import re, subprocess, sys
PATTERNS = {
 'private-key': r'-----BEGIN [A-Z ]*PRIVATE KEY-----',
 'aws-akid': r'\bAKIA[0-9A-Z]{16}\b',
 'aws-secret': r'(?i)aws_secret_access_key\s*[=:]\s*\S{20,}',
 'generic-assign': r'(?i)(password|passwd|secret|token|api[_-]?key)\s*[=:]\s*["\']?[A-Za-z0-9@#%$!_\-]{8,}["\']?',
 'jwt-default': r'almuammal-store-secret-change-me-in-production',
 'wa-hardcoded': r'WHATSAPP[^=]*=\s*["\']?9647\d{9}',
}
EXCL = re.compile(r'(node_modules|package-lock|\.min\.js|sw\.js|icons\.svg|\.map$|leaflet|chart\.umd|dompurify|cleave|aos|swiper|socket\.io)')
def scan_text(name, text, out):
    for k, p in PATTERNS.items():
        for m in re.finditer(p, text):
            line = text[:m.start()].count('\n') + 1
            ctx = m.group(0)[:60]
            # استثناءات مقبولة: أسماء حقول بدون قيمة حقيقية، ملفات توثيق تشرح الأنماط
            if 'example' in name or name.endswith('.md'): continue
            if re.search(r'(password|secret|token)\s*[=:]\s*["\']?\$', ctx): continue  # متغيرات بيئة
            if "process.env" in ctx: continue
            out.append(f'{name}:{line} [{k}] {ctx}')
hits = []
# working tree
files = subprocess.run(['git','ls-files'], capture_output=True, text=True).stdout.split()
for f in files:
    if EXCL.search(f): continue
    try:
        t = open(f, encoding='utf8', errors='ignore').read()
    except OSError: continue
    scan_text(f, t, hits)
# git history
log = subprocess.run(['git','log','-p','--no-color'], capture_output=True, text=True).stdout
for k, p in PATTERNS.items():
    for m in re.finditer(p, log):
        ctx = m.group(0)[:50]
        if 'process.env' in ctx or 'example' in ctx: continue
        hits.append(f'HISTORY [{k}] {ctx}')
print('\n'.join(hits) if hits else 'NO SECRETS FOUND')
sys.exit(0)

# DEPLOYMENT REPORT
- Dockerfile: node:22-alpine، non-root، HEALTHCHECK /healthz، npm ci --omit=dev.
- docker-compose: volume db-data، env إلزامي JWT_SECRET (?err)، healthcheck.
- داخل البيئة: docker ABSENT → BUILD/IMAGE/TRIVY = BLOCKED BY EXTERNAL RESOURCE (لم يُدَّعَ نجاح).
- Rollback: إجراء موثق (tag بالـ SHA + docker tag digest + git revert) = VERIFIED STATICALLY فقط.
- Staging smoke (بديل مؤقت): home/checkout/admin/health PASS داخل المعاينة (artifacts/e2e-evidence.txt).

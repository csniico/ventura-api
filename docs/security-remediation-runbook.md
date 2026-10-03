# Security remediation — deploy runbook

Sequence for getting the Sept–Oct 2026 assessment fixes onto staging and prod.

**Why the order matters.** Two of the changes break the service if deployed
before their environment is ready: certificate verification on the Postgres
connection (SEC-008) and the new `verification_codes.attempts` column
(SEC-006). Both must be in place *before* the image that needs them is live.

Treat this as single-use. Once staging and prod are both verified, the CI and
post-deploy smoke steps in `.github/workflows/` carry the verification
forward automatically.

---

## 0. Contain (do this first, before anything else)

Staging is exploitable right now and will stay that way until step 4 finishes.

Restrict network access to the staging Render service — IP allow-list, or take
it offline if nobody is relying on it. Everything below takes time; this does
not.

Also delete the assessment's disposable accounts once you have DB access
(step 2 gives you a session):

```sql
DELETE FROM users
WHERE email LIKE 'victim+%@example.com'
   OR email LIKE 'tenantB+%@example.com'
   OR email LIKE 'raw%@example.com';
```

---

## 1. Set the environment variables

On the **staging** Render service, then later the same for **prod**:

| Variable | Value | Why |
|---|---|---|
| `PG_SSL_CA` | The Postgres provider's CA certificate, as a PEM literal | SEC-008. Without it the app cannot connect at all once verification is on. |
| `ENABLE_SWAGGER` | `false` | SEC-013. Defaults to off outside development, but set it explicitly so it is visible. |
| `ALLOWED_ORIGINS` | Comma-separated origins for any browser client, e.g. `https://app.venturabiz.online` | SEC-013. CORS is now fail-closed outside `development`; unset means CORS is **disabled**, not `*`. |
| `NODE_ENV` | `staging` / `production` | Confirm it is already set. The CORS and Swagger defaults key off it. |

Get the CA from your provider:

- **Neon / Supabase / RDS** — they publish a CA bundle for download.
- **Render Postgres** — the connection details panel offers the CA certificate.

If the CA genuinely cannot be obtained in time, `PG_SSL_REJECT_UNAUTHORIZED=false`
restores the old unverified behaviour so the deploy is not blocked. It logs a
warning on every boot by design. Treat it as a temporary hold, not a decision.

Verify locally against the staging DB before touching the service:

```bash
PG_URI='<staging uri>' PG_SSL_CA="$(cat ca.pem)" pnpm start
```

A successful boot means the CA is right. A `self-signed certificate in chain`
or `unable to verify the first certificate` error means it is not — fix that
here, not after the deploy.

---

## 2. Run the migration

Against the **staging** database, before the new image is live. Adding a column
with a default is backwards-compatible, so the currently-deployed build keeps
working between this step and step 4.

```bash
PG_URI='<staging uri>' pnpm migration:up
```

Confirm:

```sql
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'verification_codes' AND column_name = 'attempts';
```

Expect one row: `attempts | integer | 0`.

---

## 3. Add the smoke-test variables, then merge

The post-deploy smoke step reads a repo variable per environment. Add both
before merging, or the first deploy fails at the last step with an empty URL:

- `STAGING_BASE_URL` → `https://api.staging.venturabiz.online`
- `PROD_BASE_URL` → the production API origin

Settings → Secrets and variables → Actions → **Variables** (not Secrets — these
are not sensitive).

Then merge the PR:

```bash
gh pr merge 11 --repo csniico/ventura-api --squash
```

This lands on `dev` and deploys the dev service. Watch that run first — it is
the cheapest place to find out something is wrong.

---

## 4. Promote to staging

This is the step that actually closes SEC-011 and SEC-012.

```bash
git fetch origin
git checkout staging
git merge --ff-only origin/dev
git push origin staging
```

If `--ff-only` refuses, `staging` has commits `dev` does not (it is currently
1 ahead, 20 behind). Inspect them before deciding:

```bash
git log origin/dev..origin/staging --oneline
```

If that commit is just an old promotion marker, `git merge origin/dev` and
resolve. Do not force-push.

The push triggers `deploy-staging.yml`, which now waits for Render to report
`live` and then runs the smoke test. **A green run is the evidence the
findings are closed.**

---

## 5. Verify independently

Do not rely only on the pipeline's own check:

```bash
BASE_URL=https://api.staging.venturabiz.online pnpm smoke:auth
```

All 13 probes must pass. Then re-run the assessment's own reproductions by
hand — they should now answer 401/403/404:

```bash
curl -i https://api.staging.venturabiz.online/admin/users          # 401
curl -i https://api.staging.venturabiz.online/api/docs             # 404
curl -i -X POST https://api.staging.venturabiz.online/files/presign \
  -H 'Content-Type: application/json' \
  -d '{"contentType":"image/png","filename":"x.png"}'              # 401
```

Then exercise the app against staging: sign in with an emailed code, upload a
business logo, send an invoice. Those three cover every behavioural change —
OTP lockout, the scoped file keys, and the invoice recipient restriction.

---

## 6. Prod

Repeat steps 1, 2 and 4 against prod, substituting the prod service, database
and `prod` branch. Only after staging has been verified and exercised.

---

## If something breaks

| Symptom | Cause | Action |
|---|---|---|
| Boot loop, TLS/certificate error in logs | `PG_SSL_CA` missing or wrong | Set `PG_SSL_REJECT_UNAUTHORIZED=false` to restore service, then fix the CA properly. |
| Sign-in codes rejected for everyone | Migration not run | Run step 2. |
| Browser client gets CORS errors | `ALLOWED_ORIGINS` unset | Set it. Unset now means disabled, not `*`. |
| Logo/avatar upload fails with 403 on delete | Ownership check on a key shape not anticipated | Keys written before this change are allowed through with a warning; check the logs for `Legacy unscoped file key`. |
| Deploy workflow fails at the smoke step | A finding is live on the deployed build | Read which probe failed. **Do not merge past it** — that step is the whole point. |

Rolling back is a Render redeploy of the previous image tag. The migration does
not need reverting: the old build ignores the extra column.

---

## Separately: rotate the leaked credential

`scripts/automation/_lib/config.ts` carried `adminUser!234` as a default
Postgres password and it is in git history. If that password was ever used on a
real instance, rotate it. Removing the fallback stops it being used by
accident; it does not un-leak it.

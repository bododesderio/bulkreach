# BulkReach — production deploy (shared-Traefik VPS)

BulkReach runs on the shared VPS (`195.110.59.36`, `srv1806304.hstgr.cloud`) behind a
**single shared Traefik edge** that owns `:80`/`:443`, terminates TLS, and issues
Let's Encrypt certificates via its ACME resolver (`le`). Each web-facing service is
routed by Host label over the external `web` network and publishes **no host ports**.

## Hosts

| Host | → service | internal port | notes |
| --- | --- | --- | --- |
| `bulkreach.ug` + `www.bulkreach.ug` | `web` (Next.js) | 3100 | landing + client `/dashboard/*` |
| `admin.bulkreach.ug` | `web` (Next.js `/admin`) | 3100 | **Basic-Auth gated at the edge** |
| `api.bulkreach.ug` | `api` (FastAPI) | 3101 | `/api/v1/*`, `/health` |
| `api.bulkreach.ug/docs` · `/redoc` · `/openapi.json` | `api` | 3101 | **Basic-Auth gated at the edge** |

`.ug` DNS is **not** on Hostinger — add these at the registrar/DNS host for `bulkreach.ug`.

## 1. DNS (A records → 195.110.59.36)

| Type | Name | Value | TTL |
| --- | --- | --- | --- |
| A | `@` (bulkreach.ug) | `195.110.59.36` | 3600 |
| A | `www` | `195.110.59.36` | 3600 |
| A | `admin` | `195.110.59.36` | 3600 |
| A | `api` | `195.110.59.36` | 3600 |

(Optionally `www` as a CNAME → `bulkreach.ug` instead of an A record.)

## 2. Confirm the shared edge

```bash
docker network ls | grep -w web         # the external `web` network must exist
docker ps --filter name=traefik         # the shared Traefik container is running
```
If the network name differs from `web`, update `networks.web` + `traefik.docker.network`
in `docker-compose.prod.yml`. If the ACME resolver isn't named `le`, update the
`certresolver=le` labels.

## 3. Edge Basic-Auth hashes

Generate on the VPS (single-quote the password so the shell doesn't touch `$`):

```bash
printf '%s\n' "ADMIN_BASICAUTH=admin:$(openssl passwd -apr1 'STRONG_ADMIN_PASS')" >> .env.production
printf '%s\n' "DOCS_BASICAUTH=docs:$(openssl passwd -apr1 'STRONG_DOCS_PASS')"   >> .env.production
```
The value is an APR1 hash (safe to store); `.env.production` is git-ignored. Traefik's
Docker provider consumes the `$`-signs as-is when the value comes from the env var.

## 4. Deploy

```bash
cd /opt/bulkreach
git checkout -B main origin/main        # ensure correct branch + upstream (see gotchas)
git pull
git log --oneline -1                     # confirm the new commit actually landed
cp .env.production.example .env.production   # first time only — then fill in secrets
docker compose --env-file .env.production -f docker-compose.prod.yml up -d --build
```

The `api` container runs Alembic migrations on start (`backend/entrypoint.prod.sh`).
First HTTPS hit to each new host triggers the ACME certificate (retry after ~15s if TLS errors).

## 5. Verify

```bash
for h in bulkreach.ug www.bulkreach.ug api.bulkreach.ug; do
  echo -n "$h → "; curl -sS -o /dev/null -w "%{http_code}\n" "https://$h/"
done
curl -sS -o /dev/null -w "admin (no auth) → %{http_code}\n" https://admin.bulkreach.ug/      # expect 401
curl -sS -o /dev/null -w "admin (auth)    → %{http_code}\n" -u admin:STRONG_ADMIN_PASS https://admin.bulkreach.ug/
curl -sS -o /dev/null -w "docs (no auth)  → %{http_code}\n" https://api.bulkreach.ug/docs     # expect 401
curl -sS -o /dev/null -w "health          → %{http_code}\n" https://api.bulkreach.ug/health   # expect 200
```

## Notes & gotchas

- **No in-stack nginx.** Traefik streams SSE natively (campaign progress works with no
  extra config) and imposes no request-body cap, so the old nginx `proxy_buffering off` /
  50m-body settings are unnecessary at the edge.
- **`TRUSTED_PROXY_COUNT=1`** — client → Traefik → container is one trusted hop. The backend's
  `client_ip()` trusts exactly that many `X-Forwarded-For` hops.
- **Same-origin API.** The Next.js `web` container proxies `/api` → `api:3101` internally, so
  browsers on `bulkreach.ug` / `admin.bulkreach.ug` call the API same-origin — no CORS needed
  for the app. `api.bulkreach.ug` is for direct API use, provider webhooks, and Swagger.
- **Verify the VPS branch + tracking.** A repo on the wrong branch / no upstream makes
  `git pull` a silent no-op and ships a cached build of old code. Always check
  `git log --oneline -1` after pull.
- **Small VPS + Next.js build.** `mem_limit` does not cap the build itself; rebuild only the
  changed service under memory pressure (`... up -d --build web`).
- **Provider webhooks** post to `https://api.bulkreach.ug/api/v1/payments/webhooks/<provider>` —
  set each provider's callback/IPN URL accordingly in `/admin/settings/payments`.

# Verifying Supabase (Auth + Sync) and the AI Assistant

Replace `<ref>` (Supabase project ref), `<user>` (GitHub user), `<worker-url>` (e.g. `https://healthmate-assistant.<subdomain>.workers.dev`).
`ORIGIN=https://<user>.github.io` (no path, no trailing slash — must equal `ALLOWED_ORIGIN` in `worker/wrangler.toml`).

## 0. One-time setup checklist (cannot be done from code)

Do these in order. Names are exact and case-sensitive. The repository must be named `HEALTHMATE` (the build base path is `/HEALTHMATE/`). If you publish under another GitHub account, also update `ALLOWED_ORIGIN` in `worker/wrangler.toml`, the issue URLs in `worker/src/fallback.js`, and the default URLs in `playwright.config.ts` and `tests/e2e/*.spec.ts`.

### A. Supabase dashboard

| # | Where | Action |
|---|---|---|
| A1 | SQL Editor | Run all of `supabase/schema.sql` (idempotent). Creates `healthmate_user_data` with RLS (anon has no access) and `delete_my_account()`. |
| A2 | Project Settings -> API | Copy the **Project URL** and the **publishable/anon** key. Never use `service_role` / `sb_secret_...` (the build refuses it). |
| A3 | Authentication -> URL Configuration | **Site URL** = `https://<user>.github.io/HEALTHMATE/`. **Redirect URLs** += `https://<user>.github.io/HEALTHMATE/**` and `http://localhost:5173/HEALTHMATE/**`. |
| A4 | Authentication -> Sign In / Providers | Email enabled. Decide on "Confirm email": Supabase's built-in email sender is heavily rate-limited, so for a judged demo either disable confirmation, configure custom SMTP, or pre-create a demo account. Google is optional and also needs `VITE_GOOGLE_AUTH=true` at build time, which `deploy.yml` does **not** set. |
| A5 | Project home | Free-tier projects pause after a period of inactivity. Confirm the project is **active** right before submitting and during the judging window. |

### B. Cloudflare (only for the AI assistant; the app works without it)

| # | Where | Action |
|---|---|---|
| B1 | Workers & Pages | Make sure the account has a `workers.dev` subdomain (the CI smoke test reads the Worker URL from the `workers.dev` deploy output). |
| B2 | KV | `npx wrangler kv namespace create RATE_KV` (or Dashboard -> Storage -> KV). Copy the 32-character namespace id -> GitHub variable `RATE_KV_NAMESPACE_ID`. |
| B3 | My Profile -> API Tokens | Create a token that can edit Workers scripts and Workers KV (the "Edit Cloudflare Workers" template works) -> GitHub secret `CLOUDFLARE_API_TOKEN`. |
| B4 | Workers & Pages overview | Copy the **Account ID** -> GitHub variable `CLOUDFLARE_ACCOUNT_ID` (a secret of the same name is also accepted). |
| B5 | Google AI Studio / Google Cloud | Create a Gemini API key -> GitHub secret `GEMINI_API_KEY`. Optional second provider: a Groq key -> `GROQ_API_KEY`. |
| B6 | `worker/wrangler.toml` | Set `ALLOWED_ORIGIN` to the exact Pages origin (scheme + host, no path, no trailing slash; comma-separate several). The committed value is `https://steven556-maker.github.io`. |
| B7 | (nothing to do) | CI injects the KV id, then runs `wrangler deploy`, then stores `GEMINI_API_KEY`, `GROQ_API_KEY` (if set), `SUPABASE_URL`, `SUPABASE_ANON_KEY` as Worker secrets. Secrets persist between deploys. |

Web Push (reminders when the app is closed) is optional and off by default: it needs `node scripts/gen-vapid.mjs`, `VAPID_PUBLIC_KEY` + `VAPID_SUBJECT` in `wrangler.toml` (the committed values are placeholders), the `VAPID_PRIVATE_JWK` Worker secret, and `VITE_PUSH_PUBLIC_KEY` at build time (not passed by `deploy.yml`). See the README.

### C. GitHub (Settings -> Secrets and variables -> Actions -> **Repository** secrets/variables, not Environment ones)

| Kind | Name | Needed for | Value |
|---|---|---|---|
| Secret *or* variable | `VITE_SUPABASE_URL` | Pages build (build **fails** if missing) | Project URL |
| Secret *or* variable | `VITE_SUPABASE_ANON_KEY` | Pages build (build **fails** if missing) | publishable/anon key |
| Variable *or* secret | `VITE_ASSISTANT_URL` | Pages build (assistant is disabled with a warning if empty) | Worker URL, set **after** the first Worker deploy |
| Variable | `DEPLOY_WORKER` | Worker deploy job | `true` |
| Variable | `RATE_KV_NAMESPACE_ID` | Worker deploy job | 32-hex KV id from B2 |
| Variable (or secret) | `CLOUDFLARE_ACCOUNT_ID` | Worker deploy job | from B4 |
| Secret | `CLOUDFLARE_API_TOKEN` | Worker deploy job | from B3 |
| Secret | `GEMINI_API_KEY` | Worker deploy job | from B5 |
| Secret (optional) | `GROQ_API_KEY` | Worker deploy job | second provider |

Also: Settings -> Pages -> **Source = GitHub Actions**. Issues should be enabled (the assistant's static fallback links to them).

### D. Order of operations (first deployment)

1. Do A1-A4, B1-B6 and add every item in table C **except** `VITE_ASSISTANT_URL`.
2. Push to `main` (or Actions -> "Deploy HealthMate to GitHub Pages" -> Run workflow). The `build` job must pass `check-build-env`; `deploy-worker` prints a notice with the Worker URL and must pass its `/api/health` smoke test (`kv`, `supabase`, `gemini` all `true`).
3. Add the Worker URL as variable `VITE_ASSISTANT_URL`, then **re-run the workflow** (the value is baked in at build time).
4. Run the smoke tests in section 2 and the final browser check at the end of this file.

## 1. Local

```bash
npm ci
npm run check:env            # must print "✓ build config OK"
npm run typecheck && npm test && npm run lint
```

Terminal A: `npm run dev:worker`   Terminal B: `npm run dev`  → open `http://localhost:5173/HEALTHMATE/`

Worker health (local):
```bash
curl -s -H "Origin: http://localhost:5173" http://localhost:8787/api/health
# → {"ok":true,"configured":{"kv":true,"supabase":true,"gemini":true,"groq":false}}   (groq optional)
```

Supabase reachability + key validity. The auth health call must return `200`. The table call is *expected* to return `401` / `permission denied` because `schema.sql` revokes all access from `anon` (RLS closed); a `200` with rows there would mean the schema was not applied correctly:
```bash
set -a; . ./.env; set +a
curl -s -o /dev/null -w "auth health: %{http_code}\n" "$VITE_SUPABASE_URL/auth/v1/health" -H "apikey: $VITE_SUPABASE_ANON_KEY"
curl -s -w "\ntable (anon, expect 401/permission denied = RLS closed): %{http_code}\n" "$VITE_SUPABASE_URL/rest/v1/healthmate_user_data?select=user_id" -H "apikey: $VITE_SUPABASE_ANON_KEY"
```
In the browser DevTools console you should see **no** `[HEALTHMATE config]` warning. Then: account button → Sign up → confirm email → Sign in → tick consent → "Sync my data" → "This account's data is synced". Any failure now prints `[cloud] <step> failed {status, code, message}` and shows a specific message.

Gemini key + model names (this tests the key itself; `AQ.` keys return 401 on some accounts):
```bash
curl -s -H "Authorization: Bearer $GEMINI_API_KEY" https://generativelanguage.googleapis.com/v1beta/openai/models | head -c 600
curl -s https://generativelanguage.googleapis.com/v1beta/openai/chat/completions -H "Authorization: Bearer $GEMINI_API_KEY" -H "Content-Type: application/json" \
  -d '{"model":"gemini-2.5-flash","max_tokens":200,"reasoning_effort":"low","messages":[{"role":"user","content":"say hi"}]}'
```
`GEMINI_MODELS` lists every free-tier model, strongest first. Ids that your key cannot use (404/429) are skipped automatically and remembered for a short time, so a stale id only costs one failed call; check the `/models` list (prefixed `models/`) if you want to prune the list. Google changes free-tier limits without notice. If you get 401, create a key from a Google Cloud project's "Gemini API" key page, or set `GROQ_API_KEY` as the second provider.

## 2. Production

```bash
# Worker (manual alternative to CI; run from the repository root)
npx wrangler kv namespace create RATE_KV        # replace __RATE_KV_NAMESPACE_ID__ in worker/wrangler.toml locally; do not commit the real id
npx wrangler deploy --config worker/wrangler.toml
npx wrangler secret put GEMINI_API_KEY    --config worker/wrangler.toml
npx wrangler secret put SUPABASE_URL      --config worker/wrangler.toml
npx wrangler secret put SUPABASE_ANON_KEY --config worker/wrangler.toml
npx wrangler secret list                  --config worker/wrangler.toml   # names only
npx wrangler tail --config worker/wrangler.toml                           # live logs: "[chat] Gemini/<model> failed {status,message}"

# Smoke tests
curl -s -H "Origin: $ORIGIN" <worker-url>/api/health
curl -s -i -X OPTIONS <worker-url>/api/chat -H "Origin: $ORIGIN" -H "Access-Control-Request-Method: POST" -H "Access-Control-Request-Headers: authorization,content-type" | head -12   # 204 + Access-Control-Allow-Origin: $ORIGIN
curl -s -X POST <worker-url>/api/chat -H "Origin: $ORIGIN" -H "Content-Type: application/json" -d '{"messages":[{"role":"user","content":"hi"}]}'   # {"error":"unauthorized"} (401) = Worker + CORS fine
```
Authenticated chat (get a token from DevTools → Application → Local Storage → `sb-<ref>-auth-token` → `access_token`):
```bash
curl -s -X POST <worker-url>/api/chat -H "Origin: $ORIGIN" -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"locale":"en","messages":[{"role":"user","content":"What is a good warm-up?"}]}'
# {"text":"…","source":"ai"}                      = working
# {"text":"…","source":"fallback","reason":"…"}   = Worker OK but provider failed; reason tells why:
#   no_provider_configured → GEMINI_API_KEY/GROQ_API_KEY secret missing
#   provider_auth          → key rejected (401/403)      provider_quota → 429 / quota
#   provider_model         → model id not found (404/400) provider_timeout / provider_error → see `wrangler tail`
#   provider_quota (every model)  → all free quotas are used up; the static reply is expected until the quota resets (daily limits reset at midnight Pacific)
```

GitHub Actions: push to `main` → the **build** job must show `✓ build config OK … values present in bundle`; the **deploy-worker** job prints `Worker URL` as a notice and a passing `/api/health`. Then set Actions variable `VITE_ASSISTANT_URL` to that URL and re-run the workflow (it is baked in at build time).

Final browser check on `https://<user>.github.io/HEALTHMATE/` (hard-reload): DevTools console has no `[HEALTHMATE config]` warning; Settings shows account UI (not "setup needed"); Assistant tab says "available" after sign-in; a message returns `source: "ai"` (no "Temporary automatic reply" badge).

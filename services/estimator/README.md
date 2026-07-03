# exFat estimator (local, paseo-backed)

Turns a natural-language meal description into structured per-item nutrition
estimates by shelling out to `paseo run` (Claude, via this machine's paseo
provider — **no API key needed**). The mobile app calls it over Tailscale.

```
phone (Expo Go, on tailnet)  ──HTTP──▶  this service (100.64.0.62:8787)
                                             │ paseo run --provider claude --model claude-haiku-4-5
                                             ▼
                                        Claude (Haiku) → JSON estimate
```

## Run

```bash
pnpm estimator          # from repo root  (= node services/estimator/server.mjs)
```

It prints the tailnet URL. The app defaults to `http://100.64.0.62:8787/estimate`
(override with `EXPO_PUBLIC_ESTIMATE_URL` in the app's env).

## Config (env)

| Var                  | Default             | Purpose                                             |
| -------------------- | ------------------- | --------------------------------------------------- |
| `EXFAT_PORT`         | `8787`              | Listen port                                          |
| `EXFAT_HOST`         | `0.0.0.0`           | Bind address (0.0.0.0 → reachable over the tailnet)  |
| `EXFAT_MODEL`        | `claude-haiku-4-5`  | paseo `claude` model (see `paseo provider models claude`) |
| `EXFAT_WORKSPACE_ID` | (auto)              | Reuse a warm paseo workspace (~8s vs ~19s cold)      |
| `EXFAT_TOKEN`        | (off)               | If set, require `x-exfat-token`/Bearer on requests   |

## Test

```bash
curl -s http://localhost:8787/estimate \
  -H 'content-type: application/json' \
  -d '{"text":"3 tbsp egg white, 68g avocado, 2 eggs, 89g cottage cheese"}' | jq
```

## Notes

- **Personal/dev backend.** It only serves while this box is up and on your
  tailnet. For App Store scale, host the LLM step elsewhere — the Supabase
  `estimate-nutrition` edge function (in `supabase/functions/`) is the cloud
  equivalent using the Anthropic API directly.
- Requests are serialized (one `paseo run` at a time) to keep a single warm
  workspace and avoid spawning duplicate cold ones.
- The endpoint is unauthenticated by default — fine on a private tailnet; set
  `EXFAT_TOKEN` if you want a shared-secret gate.

# Security Policy

This repo configures and bridges access to **Robinhood trading and banking
MCP servers** and the **Robinhood Crypto API**. It deals with API keys,
Ed25519 private keys, and access tokens. Treat every change accordingly.

## Reporting a vulnerability

Do **not** open a public issue for security problems. Report privately to the
repository owner (gitSITTI) via GitHub Security Advisories
("Security" tab → "Report a vulnerability") or direct contact. Include what you
found, how to reproduce it, and the potential impact (credential exposure,
unintended order, token leakage, etc.).

## Secret handling rules

- **Never commit secrets.** `.env`, `.env.local`, `.env.*` are git-ignored;
  only `.env.example` (placeholders) is tracked. Same for `chatgpt-app/.env*`.
- The Cloudflare Worker (`chatgpt-app/`) reads secrets from **Worker bindings /
  environment** at runtime (`ROBINHOOD_CRYPTO_*`, `APP_SHARED_SECRET`, …) — never
  hardcode them in `src/index.ts` or `wrangler.jsonc`.
- Real secret sources of truth: local untracked bundle + Cloudflare + AWS
  Secrets Manager. See `docs/SECRETS.md`, `docs/LOCAL_SECRET_SOURCE_OF_TRUTH.md`,
  and `docs/CLOUDFLARE_ONLY_RECOVERY.md`.
- `.github/workflows/sync-robinhood-secrets-from-aws.yml` reads an AWS secret
  bundle inside the job only and must **never print secret values** (it prints
  `jq 'keys'` only). CI in `ci.yml` uses **no** secrets.
- Ed25519 private keys are stored base64-encoded in env
  (`ROBINHOOD_CRYPTO_*_PRIVATE_KEY_BASE64`). Rotate on suspected exposure.

## Trade-safety conventions

- The Worker exposes **read / prepare / review** tools that never place an order
  on their own (`prepare_agentic_equity_order`, `review_equity_order`). Keep the
  confirm-before-place flow intact (see `skills/*/evals/evals.json` for the
  expected safety flow).

## Dependency hygiene

- Worker npm deps and GitHub Actions are patched by Dependabot
  (`.github/dependabot.yml`). `@noble/curves` (request signing) is security-
  sensitive — apply its bumps promptly.

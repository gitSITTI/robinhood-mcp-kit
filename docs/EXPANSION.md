# Expansion Plan — Firebase, Cloudflare free tier, sosaclaw

Shared infrastructure plan for the two trading repos (`robinhood-mcp-kit`,
`blofin-trader-kb`). The blofin copy of this plan lives at
`blofin-trader-kb/docs/ops/EXPANSION_PLAN.md`; keep the two in sync.

## ⚠️ Assumptions to confirm with the owner (flagged, not guessed)

1. **"sosaclaw"** is assumed to be an owner-controlled domain/brand (e.g.
   `sosaclaw.com`) intended as the public host for dashboards/tools —
   presumably DNS-managed (or manageable) on Cloudflare. **Confirm the exact
   domain, registrar, and what should live on it before phase 1.**
2. Firebase project = free **Spark** plan. Note the hard constraint: Spark
   **Cloud Functions cannot make outbound network calls to non-Google APIs** —
   so no Robinhood/BloFin calls from Functions without upgrading to Blaze.
   The plan below is designed to not need that.
3. Nothing in this plan ever holds trading credentials in Firebase.

## What each platform is for (division of labor)

| Platform | Free-tier reality | Role here |
|---|---|---|
| **Cloudflare Workers** (already in use) | 100k req/day, secrets, cron triggers | Anything that touches Robinhood APIs — stays here. Bridge Worker, future token-refresh cron, future BloFin read-only status Worker. |
| **Cloudflare Pages** | Unlimited static requests, custom domains | Dashboards (static HTML/JS calling the Worker) hosted on the sosaclaw domain, e.g. `trade.sosaclaw.com`. |
| **Firebase Firestore** (Spark) | 1 GiB storage, 50k reads/20k writes per day | **Sanitized** journal: no-trade-audit snapshots, trade journal entries, guardrail decisions from blofin. Written by explicit opt-in scripts run locally — never automatically, never with secrets. |
| **Firebase Hosting/Auth** (Spark) | 10 GB hosting; auth free tier | Alternative dashboard host + Google-account login gate for anything private. Pick **either** Pages or Firebase Hosting per app, don't split one app across both. |

## Phases

### Phase 1 — journal + dashboard (handoff H6 in AGENT_HANDOFF.md)
- Create Firebase project (Spark), Firestore in production mode, locked rules
  (owner-only via Firebase Auth).
- Add an opt-in script that pushes a **redacted** `run_no_trade_audit` result
  (equity/crypto summaries, masked accounts) into `audits/{date}`.
- Static dashboard (Cloudflare Pages) on the sosaclaw domain reading Firestore
  via Firebase JS SDK + Auth. No Worker changes needed.

### Phase 2 — blofin joins
- blofin `sync_trade_analytics.py` gains an optional Firestore export of the
  same aggregates the local SQLite reports produce (leverage buckets, win/loss
  summaries). Local SQLite stays the source of truth.
- Guardrail decisions (`allow|block` + reasons) logged to `guardrails/{ts}`
  for auditability.

### Phase 3 — automation (requires design review)
- Cloudflare cron Worker for the OAuth token refresh (BACKLOG RH-5).
- Alerting: a Worker cron that reads Firestore aggregates and emails/pings on
  guardrail blocks or stale-token conditions.

## Non-goals

- No order placement from anything in this plan. Dashboards and journals are
  read-only surfaces over data produced by the guarded flows.
- No secrets in Firebase, Pages, or client-side code — credentials stay in
  Cloudflare Worker secrets / AWS / the local bundle, as today.

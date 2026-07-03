# Backlog — robinhood-mcp-kit

Ticket registry for this repo. Each item is mirrored as a GitHub issue (number
in the first column once filed). Items marked **[handoff]** need live
credentials / owner accounts and have step-by-step instructions in
`docs/runbooks/AGENT_HANDOFF.md` so any agent (Codex, Claude, Cursor, human)
can execute them.

| # | Pri | Ticket | Notes |
|---|-----|--------|-------|
| RH-1 (#3) | P0 | **[handoff]** Deploy Worker v0.2.0 + smoke test | Safety fixes + new tools are not live until deployed. Handoff H1. |
| RH-2 (#4) | P0 | **[handoff]** Verify `cancel_equity_order` args against live MCP schema | Args inferred, not verified. Handoff H2. |
| RH-3 (#5) | P1 | **[handoff]** Enable inbound `/mcp` auth (`MCP_REQUIRE_AUTH=true`) | Code shipped + tested; connector coordination remains. Handoff H3. |
| RH-4 (#6) | P1 | **[handoff]** Wire banking MCP tools into the Worker | Card balance/status/transactions; completes "all account info". Handoff H4. |
| RH-5 (#7) | P1 | **[handoff]** Automate OAuth token refresh | Manual token sync is the #1 operational failure. Handoff H5. |
| RH-6 | P2 | Crypto sell + limit-order flows with guards | Mirror prepare/confirm pattern; needs guard design for sells (no zero-spread equivalent). |
| RH-7 | P2 | Real OAuth on the Worker's /mcp (replace shared secret) | Path-secret auth is interim; ChatGPT connectors support OAuth. |
| RH-8 (#8) | P2 | **[handoff]** Expansion phase 1: Firebase journal + sosaclaw dashboard | See docs/EXPANSION.md; assumptions need owner confirmation. Handoff H6. |
| RH-9 | P3 | **[handoff]** PSScriptAnalyzer findings sweep | Advisory CI job; triage on Windows. Handoff H7. |
| RH-10 | P3 | Add `get_equity_orders`/`get_equity_positions` as standalone bridge tools | Currently only inside `run_no_trade_audit`. |

**Definition of done** for any ticket: `npm run check` + `npm test` green,
trade-safety flow preserved, CHANGELOG.md updated, runbooks updated if the
operational procedure changed.

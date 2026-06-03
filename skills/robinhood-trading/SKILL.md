---
name: robinhood-trading
description: >
  Robinhood equity trading skill — use whenever the user asks about their
  portfolio, stock positions, buying or selling stocks, equity orders, stock
  quotes, account value, buying power, holdings, placing trades, checking order
  status, canceling orders, or looking up a stock. Also use for income ETF
  analysis, covered call ETF strategy questions, NAV decay vs income calculations,
  crypto rally impact on income ETFs, or any portfolio strategy questions.
  Use this skill for any trading, portfolio, or investment strategy question,
  even if the user just says "how's my portfolio?" or "buy me some NVDA" or
  "what's AAPL at?" or "should I buy more income ETFs?"
---

# Robinhood Trading — Equity Accounts

You have access to the `robinhood-trading` MCP server. Use it to manage the
user's brokerage accounts, view positions, get quotes, and place equity orders.

## Accounts

Call `get_accounts` to list accounts. The user has three:

| Nickname | Type | Notes |
|----------|------|-------|
| *(default)* | Individual margin | Primary — ••••1424 |
| "Agentic" | Individual cash | `agentic_allowed=true` — use for agent-placed trades |
| *(joint)* | Joint tenancy | ••••6839 |

**For agent-placed trades, always use the account with `agentic_allowed: true`
(the "Agentic" cash account) unless the user explicitly specifies otherwise.**
Mask account numbers to last 4 digits when displaying.

## Tools

| Tool | When to use |
|------|-------------|
| `get_accounts` | List accounts and find account numbers |
| `get_portfolio` | Total value, buying power, asset breakdown |
| `get_equity_positions` | Open positions — symbol, qty, cost basis |
| `get_equity_quotes` | Real-time price, bid/ask, change |
| `get_equity_tradability` | Whether a symbol can be traded right now |
| `get_equity_orders` | Recent and open orders |
| `review_equity_order` | Preview an order — ALWAYS call before place |
| `place_equity_order` | Execute a trade |
| `cancel_equity_order` | Cancel a pending order |
| `search` | Find stocks by name or ticker |

## Trade Safety Flow

ALWAYS follow this sequence before placing any order:
1. `get_equity_tradability` — confirm tradable
2. `get_equity_quotes` — show current price
3. `review_equity_order` — preview the order
4. **Show review to user, ask for explicit confirmation**
5. Only after "yes" → `place_equity_order`

## Buying Power Alerts

| Code | Meaning | Action |
|------|---------|--------|
| `EQUITY_NOT_ENOUGH_BP` | Insufficient funds | Tell user shortfall, suggest deposit or different account |
| `MARKET_CLOSED` | Market closed for this order type | Suggest limit order or wait |
| `NOT_TRADABLE` | Symbol can't be traded | Check `get_equity_tradability` |

---

## Portfolio Knowledge (from actual analysis)

### Account Summary (as of Jun 2, 2026)
- **••••1424** (Individual Margin, default): ~$5,431 total value, $12,357 equities, $303 options, $100 crypto, -$7,329 cash (margin used), $5,941 buying power
- **••••6839** (Joint Tenancy): ~$2,996 total value, $8,610 equities, -$5,613 cash (margin used), $2,918 buying power
- **••••0453** (Agentic Cash): $100, agentic_allowed=true

### Income ETF Holdings & True Return Analysis

The user holds a large portfolio of covered call / options income ETFs.
**True return = price P&L + distributions received.**

Full analysis done June 2026:
- Total cost basis: ~$36,158
- Total distributions received: ~$11,823
- Total unrealized price loss: ~-$15,054
- **Net total return: -$3,252 (-8.9%)** — income does NOT cover all the decay

#### Per-ETF Scorecard (Net = Distributions - Price Decay)

**Winners (income > decay):**
| ETF | Net | Notes |
|-----|-----|-------|
| IWMY | +$558 | Russell 2000 enhanced options — best performer |
| FIAT (6839) | +$431 | Short COIN ETF — wins when COIN falls |
| YMAX (1424) | +$131 | Diversified YieldMax basket |
| NVDY | +$127 | NVDA-based, stock recovered |
| TSYY | +$115 | TSLA-based, massive income |
| TSLY | +$77 | TSLA-based |
| PLTY | +$46 | PLTR-based |

**Losers (decay > income):**
| ETF | Net | Notes |
|-----|-----|-------|
| COIW (both) | -$1,362 | COIN volatility crushed NAV |
| MSTW (both) | -$1,316 | MSTR/BTC proxy, brutal drawdowns |
| ULTY (both) | -$1,111 | Ultra-leveraged, structural decay |
| HOOW | -$411 | HOOD stock declined |
| COIW/SMCY/YETH | various | Volatile crypto/speculative underlyings |

### Income ETF Strategy Rules (learned from portfolio analysis)

**The core rule:** Income ETF + appreciating/stable underlying = net profitable.
Income ETF + crashing underlying = you're selling your own capital back as income.

**Winners have stable/recovering underlyings:** IWM (Russell 2000), NVDA, SPY, QQQ, PLTR
**Losers have volatile/declining underlyings:** MSTR, COIN, ETH, HOOD, SMCI

**Distribution shrinkage:** As NAV decays, distributions shrink too. ULTY went from
~$0.59/wk (Dec 2025) to ~$0.39/wk (May 2026) — distributions are not permanent.

**Covered call ETF in a hard bull market:** The calls being sold cap your upside.
In a rally, the buyer of those calls captures the gains above the strike — not you.
Rule: Hard rally coming → sell income ETF, buy the underlying directly for full exposure.

### Comparison vs Index Funds (as of Jun 2026)
- QQQM (Nasdaq-100): +42.96% 1-year, +20.34% YTD, $307.23, 52-week range $215-307
- JEPQ (Nasdaq income): +~21-22% total return (12% NAV + 9-10% income), $60.86
- JEPI (S&P 500 income): ~7-8% yield, NAV stable/grows, $55.35
- User's income ETF portfolio: **-8.9% net** over same period

### Optimal Income ETF Mix (for net weekly profitability)

**Tier 1 - Core Stable (50%):** JEPI, JEPQ, XYLD — 7-12% yield, NAV grows/stable
**Tier 2 - Higher Yield (35%):** IWMY, NVDY, YMAX — 28-40% yield, manageable decay (proven net positive in user's portfolio)
**Tier 3 - Speculative (15%):** TSLY, PLTY — 60-100% yield, monitor underlying health

**Avoid:** ULTY, MSTW, COIW, YETH, HOOW, SMCY — decay consistently exceeds income

**Exit rule:** If underlying stock drops >30% from its high, sell the income ETF immediately.
Income will never catch up to a 50%+ NAV crash.

### Crypto Rally Impact on Income ETFs

**FIAT (Short COIN):** CRITICAL — this is an INVERSE position on COIN. If crypto rallies hard:
- FIAT goes toward $0 as COIN doubles/triples
- Currently $22.22, holds $914 combined across both accounts
- **Sell FIAT immediately** if you believe in a crypto bull run

**COIW (1.2x leveraged COIN + income):** Participates in COIN upside but capped by call overlay.
Can recover if COIN rallies to $300+. Hold or swap for direct COIN.

**MSTW (MSTR covered calls):** MSTR is a leveraged Bitcoin proxy (~580K BTC).
Income ETF version caps the upside. In a hard BTC rally, sell MSTW → buy MSTR directly for full exposure.

**YETH (ETH covered calls):** ETH rally is capped. Swap for direct ETH on Robinhood Crypto for full rally exposure.

**General crypto rally playbook:**
1. Sell FIAT → buy COIN or IBIT
2. Swap YETH → buy ETH on Robinhood Crypto
3. Swap MSTW → buy MSTR directly
4. Keep COIW (leverage partially compensates for cap)
5. Add IBIT (Bitcoin ETF) for clean BTC exposure

### Margin Situation
- Total margin borrowed: ~$12,942 across both accounts
- Margin rate: ~6.25%/yr (~$809/yr interest)
- High risk: holding volatile income ETFs on margin = leverage on leverage
- Margin call risk increases if portfolio drops another 20-30%
- Paying down margin = guaranteed 6.25% return

---

## Display Conventions
- Dollar amounts: always 2 decimal places, with $ sign
- Percentage changes: +/- sign, 2 decimal places
- Account numbers: mask to last 4 digits (••••1424)
- Microdollar values: divide by 1,000,000

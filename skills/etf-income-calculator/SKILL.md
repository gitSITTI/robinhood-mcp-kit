---
name: etf-income-calculator
description: Calculate ETF distribution income from purchase lots, sale dates, and public dividend/distribution history tables. Use when the user asks for income from weekly ETF distributions, YieldMax or other covered-call ETF payouts, income since purchase date, ETF dividend estimates, or separating ETF cash income from price change in a Robinhood account.
---

# ETF Income Calculator

Use the repo script instead of recalculating manually:

```powershell
.\scripts\calculate-etf-distribution-income.ps1 -Lots <lots.csv> -OutputDir .\reports\etf-income -AsOf <YYYY-MM-DD> -Refresh
```

Input lots CSV columns:

```csv
symbol,purchase_date,shares,sale_date,note
```

Rules:

- Treat each row as a separate lot.
- Include a distribution only when `ex_date >= purchase_date`.
- Exclude distributions after `sale_date` when present.
- Exclude distributions after `--as-of` when provided.
- Calculate lot income as `shares * distribution_amount_per_share`.
- Use public distribution tables as estimates; verify final income against Robinhood activity/statements for tax or accounting use.

Online source behavior:

- The script fetches StockAnalysis ETF dividend pages by default.
- Cached HTML lives under `.cache/etf-distributions`.
- Use `-Refresh` when the user wants current data.
- If a source blocks or table parsing fails, create a local distribution CSV with columns `symbol,ex_date,amount,record_date,pay_date,source_url` and pass `-Distributions`.

When combining with Robinhood data:

- Use Robinhood positions/orders to build or verify the lots CSV.
- Do not commit real account lots unless the user explicitly asks.
- Put private reports under `reports/` or another untracked local path.
- Explain that broker-confirmed dividends/distributions require Robinhood activity or statement data because the current trading connector exposes portfolio, positions, quotes, and equity orders, not dividend/transfer history.

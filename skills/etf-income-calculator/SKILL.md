---
name: etf-income-calculator
description: Calculate ETF distribution income from purchase lots, sale dates, public dividend/distribution history tables, and broker-confirmed validation rows. Use when the user asks for income from weekly ETF distributions, YieldMax or other covered-call ETF payouts, income since purchase date, ETF dividend estimates, validating ETF income against actual balances/activity, or separating ETF cash income from price change in a Robinhood account.
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
- Use `-ActualIncome <csv>` whenever broker activity, statements, or balance-derived income rows are available.
- Treat public distribution tables as estimates until validation against actual broker/account income passes.

Validation CSV columns:

```csv
symbol,date,amount,source,note
```

Validation rules:

- Sum estimated income by symbol and total.
- Sum actual income by symbol and total from the validation CSV.
- Compare `estimated - actual` against `-ValidationTolerance`.
- Use `-FailOnValidationMismatch` when the user wants the script to exit non-zero if a variance is outside tolerance.
- If actual balances are provided only as beginning balance, ending balance, net deposits, withdrawals, and price change, convert them to an actual income row before running validation: `income = ending_value - beginning_value - net_deposits + net_withdrawals - price_change`.

Online source behavior:

- The script fetches StockAnalysis ETF dividend pages by default.
- Cached HTML lives under `.cache/etf-distributions`.
- Use `-Refresh` when the user wants current data.
- If a source blocks or table parsing fails, create a local distribution CSV with columns `symbol,ex_date,amount,record_date,pay_date,source_url` and pass `-Distributions`.

When combining with Robinhood data:

- Use Robinhood positions/orders to build or verify the lots CSV.
- Do not commit real account lots unless the user explicitly asks.
- Put private reports under `reports/` or another untracked local path.
- Explain that broker-confirmed dividends/distributions require Robinhood activity, statement data, or balance reconciliation rows because the current trading connector exposes portfolio, positions, quotes, and equity orders, not dividend/transfer history.

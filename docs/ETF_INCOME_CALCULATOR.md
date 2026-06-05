# ETF Income Calculator

Use this when you need to estimate distribution income from ETF purchase dates
and weekly/monthly distribution tables.

The calculator works by lot:

1. Read each purchase lot from a local CSV.
2. Fetch dividend/distribution history from StockAnalysis.
3. Include only distributions whose ex-date is on or after the purchase date.
4. Stop at the optional lot sale date or report `--as-of` date.
5. Multiply eligible amount-per-share by the lot share count.

This is an estimate from public distribution tables. Verify against Robinhood
activity/statements before using it for taxes or accounting.

## Lot CSV

Required columns:

```csv
symbol,purchase_date,shares
```

Optional columns:

```csv
sale_date,note
```

Dates can be `YYYY-MM-DD`, `MM/DD/YYYY`, or month-name dates like
`Jun 3, 2026`.

## Run

```powershell
.\scripts\calculate-etf-distribution-income.ps1 `
  -Lots .\examples\etf-lots.example.csv `
  -OutputDir .\reports\etf-income `
  -AsOf 2026-06-05 `
  -Refresh
```

Output files:

- `reports/etf-income/etf-income-report.md`
- `reports/etf-income/etf-income-summary.csv`
- `reports/etf-income/etf-income-payments.csv`
- `reports/etf-income/etf-income-validation.csv` when validation is enabled

## Validate Against Actual Income

Use a broker/account activity export to validate the public-table estimate
against real cash income. The validation CSV should contain:

```csv
symbol,date,amount,source,note
YMAX,2026-06-04,35.14,Robinhood activity,paid ETF distribution
```

Accepted date columns are `date`, `pay_date`, or `activity_date`. Accepted
amount columns are `amount`, `net_amount`, or `income`.

Run:

```powershell
.\scripts\calculate-etf-distribution-income.ps1 `
  -Lots .\my-joint-account-lots.local.csv `
  -ActualIncome .\my-joint-account-income.local.csv `
  -OutputDir .\reports\joint-etf-income `
  -AsOf 2026-06-05 `
  -ValidationTolerance 0.05 `
  -FailOnValidationMismatch `
  -Refresh
```

The script writes `etf-income-validation.csv` with estimated income, actual
income, variance, absolute variance, and whether each symbol plus the total is
within tolerance. Use `-FailOnValidationMismatch` in automation so mismatches
fail loudly.

## Local Distribution Override

If an online table blocks or changes format, provide your own distribution CSV:

```csv
symbol,ex_date,amount,record_date,pay_date,source_url
YMAX,2026-06-03,0.0931,2026-06-03,2026-06-04,manual
```

Then run:

```powershell
.\scripts\calculate-etf-distribution-income.ps1 `
  -Lots .\my-local-lots.csv `
  -Distributions .\my-local-distributions.csv
```

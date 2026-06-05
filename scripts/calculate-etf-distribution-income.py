#!/usr/bin/env python3
"""
Calculate ETF distribution income by purchase lot.

The input lots CSV should contain:
symbol,purchase_date,shares

Optional columns:
sale_date,note

The script fetches distribution tables from StockAnalysis by default, caches
them locally, and calculates only distributions whose ex-date is on or after
the lot purchase date and on or before the optional sale/as-of dates.

Validation input can contain broker-confirmed income rows:
symbol,date,amount
"""

from __future__ import annotations

import argparse
import csv
import datetime as dt
import html
import json
import re
import sys
import urllib.error
import urllib.request
from dataclasses import dataclass
from decimal import Decimal, ROUND_HALF_UP
from pathlib import Path
from typing import Iterable


USER_AGENT = "Mozilla/5.0 (compatible; robinhood-mcp-kit/1.0; +https://github.com/gitSITTI/robinhood-mcp-kit)"
STOCKANALYSIS_URL = "https://stockanalysis.com/etf/{symbol}/dividend/"


@dataclass(frozen=True)
class Lot:
    symbol: str
    purchase_date: dt.date
    shares: Decimal
    sale_date: dt.date | None = None
    note: str = ""


@dataclass(frozen=True)
class Distribution:
    symbol: str
    ex_date: dt.date
    amount: Decimal
    record_date: dt.date | None
    pay_date: dt.date | None
    source_url: str


@dataclass(frozen=True)
class ActualIncome:
    symbol: str
    date: dt.date
    amount: Decimal
    source: str = ""
    note: str = ""


def money(value: Decimal) -> str:
    return str(value.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP))


def parse_date(value: str | None) -> dt.date | None:
    if value is None or not value.strip():
        return None
    value = value.strip()
    for fmt in ("%Y-%m-%d", "%b %d, %Y", "%B %d, %Y", "%m/%d/%Y"):
        try:
            return dt.datetime.strptime(value, fmt).date()
        except ValueError:
            pass
    raise ValueError(f"Unsupported date format: {value!r}")


def parse_decimal(value: str) -> Decimal:
    cleaned = re.sub(r"[^0-9.\-]", "", value)
    if cleaned in {"", ".", "-"}:
        raise ValueError(f"Unsupported decimal value: {value!r}")
    return Decimal(cleaned)


def read_lots(path: Path) -> list[Lot]:
    with path.open("r", encoding="utf-8-sig", newline="") as handle:
        rows = list(csv.DictReader(handle))
    lots: list[Lot] = []
    for index, row in enumerate(rows, start=2):
        symbol = (row.get("symbol") or "").strip().upper()
        if not symbol:
            raise ValueError(f"{path}:{index}: missing symbol")
        purchase_date = parse_date(row.get("purchase_date"))
        if purchase_date is None:
            raise ValueError(f"{path}:{index}: missing purchase_date")
        shares_raw = (row.get("shares") or "").strip()
        if not shares_raw:
            raise ValueError(f"{path}:{index}: missing shares")
        lots.append(
            Lot(
                symbol=symbol,
                purchase_date=purchase_date,
                shares=parse_decimal(shares_raw),
                sale_date=parse_date(row.get("sale_date")),
                note=(row.get("note") or "").strip(),
            )
        )
    return lots


def read_actual_income_csv(path: Path, as_of: dt.date | None) -> list[ActualIncome]:
    with path.open("r", encoding="utf-8-sig", newline="") as handle:
        rows = list(csv.DictReader(handle))
    actual: list[ActualIncome] = []
    for index, row in enumerate(rows, start=2):
        symbol = (row.get("symbol") or "").strip().upper()
        if not symbol:
            raise ValueError(f"{path}:{index}: missing symbol")
        income_date = parse_date(row.get("date") or row.get("pay_date") or row.get("activity_date"))
        if income_date is None:
            raise ValueError(f"{path}:{index}: missing date")
        if as_of and income_date > as_of:
            continue
        amount_raw = row.get("amount") or row.get("net_amount") or row.get("income")
        if not amount_raw:
            raise ValueError(f"{path}:{index}: missing amount")
        actual.append(
            ActualIncome(
                symbol=symbol,
                date=income_date,
                amount=parse_decimal(amount_raw),
                source=(row.get("source") or row.get("type") or "").strip(),
                note=(row.get("note") or row.get("description") or "").strip(),
            )
        )
    return actual


def cache_path(cache_dir: Path, symbol: str) -> Path:
    return cache_dir / f"{symbol.upper()}-stockanalysis-dividends.html"


def fetch_stockanalysis_html(symbol: str, cache_dir: Path, refresh: bool) -> tuple[str, str]:
    symbol = symbol.upper()
    url = STOCKANALYSIS_URL.format(symbol=symbol.lower())
    path = cache_path(cache_dir, symbol)
    if path.exists() and not refresh:
        return path.read_text(encoding="utf-8"), url
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT, "Accept": "text/html"})
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            body = response.read().decode("utf-8", errors="replace")
    except urllib.error.HTTPError as exc:
        raise RuntimeError(f"StockAnalysis fetch failed for {symbol}: HTTP {exc.code} {url}") from exc
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(body, encoding="utf-8")
    return body, url


def strip_tags(value: str) -> str:
    value = re.sub(r"<!--.*?-->", "", value, flags=re.S)
    value = re.sub(r"<[^>]+>", "", value)
    return html.unescape(value).strip()


def parse_stockanalysis_distributions(symbol: str, body: str, source_url: str) -> list[Distribution]:
    rows = re.findall(r"<tr\b.*?</tr>", body, flags=re.S | re.I)
    distributions: list[Distribution] = []
    for row in rows:
        cells = [strip_tags(cell) for cell in re.findall(r"<td\b.*?</td>", row, flags=re.S | re.I)]
        if len(cells) < 2:
            continue
        try:
            ex_date = parse_date(cells[0])
            amount = parse_decimal(cells[1])
        except ValueError:
            continue
        if ex_date is None:
            continue
        distributions.append(
            Distribution(
                symbol=symbol.upper(),
                ex_date=ex_date,
                amount=amount,
                record_date=parse_date(cells[2]) if len(cells) > 2 else None,
                pay_date=parse_date(cells[3]) if len(cells) > 3 else None,
                source_url=source_url,
            )
        )
    return sorted(distributions, key=lambda item: item.ex_date)


def read_distribution_csv(path: Path) -> dict[str, list[Distribution]]:
    out: dict[str, list[Distribution]] = {}
    with path.open("r", encoding="utf-8-sig", newline="") as handle:
        for index, row in enumerate(csv.DictReader(handle), start=2):
            symbol = (row.get("symbol") or "").strip().upper()
            if not symbol:
                raise ValueError(f"{path}:{index}: missing symbol")
            ex_date = parse_date(row.get("ex_date"))
            if ex_date is None:
                raise ValueError(f"{path}:{index}: missing ex_date")
            item = Distribution(
                symbol=symbol,
                ex_date=ex_date,
                amount=parse_decimal(row.get("amount") or ""),
                record_date=parse_date(row.get("record_date")),
                pay_date=parse_date(row.get("pay_date")),
                source_url=(row.get("source_url") or f"local:{path}").strip(),
            )
            out.setdefault(symbol, []).append(item)
    for symbol in out:
        out[symbol].sort(key=lambda item: item.ex_date)
    return out


def get_distributions(
    symbols: Iterable[str],
    cache_dir: Path,
    refresh: bool,
    distribution_csv: Path | None,
) -> dict[str, list[Distribution]]:
    local = read_distribution_csv(distribution_csv) if distribution_csv else {}
    out: dict[str, list[Distribution]] = {}
    for symbol in sorted(set(symbols)):
        if symbol in local:
            out[symbol] = local[symbol]
            continue
        body, url = fetch_stockanalysis_html(symbol, cache_dir, refresh)
        distributions = parse_stockanalysis_distributions(symbol, body, url)
        if not distributions:
            raise RuntimeError(f"No distributions parsed for {symbol} from {url}")
        out[symbol] = distributions
    return out


def calculate(
    lots: list[Lot],
    distributions_by_symbol: dict[str, list[Distribution]],
    as_of: dt.date | None,
) -> tuple[list[dict[str, str]], list[dict[str, str]]]:
    payments: list[dict[str, str]] = []
    summaries: list[dict[str, str]] = []
    for lot_index, lot in enumerate(lots, start=1):
        lot_income = Decimal("0")
        count = 0
        for distribution in distributions_by_symbol.get(lot.symbol, []):
            if distribution.ex_date < lot.purchase_date:
                continue
            if lot.sale_date and distribution.ex_date > lot.sale_date:
                continue
            if as_of and distribution.ex_date > as_of:
                continue
            income = lot.shares * distribution.amount
            lot_income += income
            count += 1
            payments.append(
                {
                    "lot_id": str(lot_index),
                    "symbol": lot.symbol,
                    "shares": str(lot.shares),
                    "purchase_date": lot.purchase_date.isoformat(),
                    "sale_date": lot.sale_date.isoformat() if lot.sale_date else "",
                    "ex_date": distribution.ex_date.isoformat(),
                    "record_date": distribution.record_date.isoformat() if distribution.record_date else "",
                    "pay_date": distribution.pay_date.isoformat() if distribution.pay_date else "",
                    "amount_per_share": str(distribution.amount),
                    "income": money(income),
                    "source_url": distribution.source_url,
                    "note": lot.note,
                }
            )
        summaries.append(
            {
                "lot_id": str(lot_index),
                "symbol": lot.symbol,
                "shares": str(lot.shares),
                "purchase_date": lot.purchase_date.isoformat(),
                "sale_date": lot.sale_date.isoformat() if lot.sale_date else "",
                "distributions_count": str(count),
                "estimated_income": money(lot_income),
                "note": lot.note,
            }
        )
    return summaries, payments


def summarize_estimated_by_symbol(summaries: list[dict[str, str]]) -> dict[str, Decimal]:
    totals: dict[str, Decimal] = {}
    for row in summaries:
        symbol = row["symbol"]
        totals[symbol] = totals.get(symbol, Decimal("0")) + Decimal(row["estimated_income"])
    return totals


def summarize_actual_by_symbol(actual_income: list[ActualIncome], symbols: set[str]) -> dict[str, Decimal]:
    totals: dict[str, Decimal] = {}
    for row in actual_income:
        if row.symbol not in symbols:
            continue
        totals[row.symbol] = totals.get(row.symbol, Decimal("0")) + row.amount
    return totals


def build_validation_rows(
    summaries: list[dict[str, str]],
    actual_income: list[ActualIncome],
    tolerance: Decimal,
) -> list[dict[str, str]]:
    estimated = summarize_estimated_by_symbol(summaries)
    actual = summarize_actual_by_symbol(actual_income, set(estimated))
    rows: list[dict[str, str]] = []
    for symbol in sorted(set(estimated) | set(actual)):
        estimated_amount = estimated.get(symbol, Decimal("0"))
        actual_amount = actual.get(symbol, Decimal("0"))
        variance = estimated_amount - actual_amount
        rows.append(
            {
                "symbol": symbol,
                "estimated_income": money(estimated_amount),
                "actual_income": money(actual_amount),
                "variance_estimated_minus_actual": money(variance),
                "absolute_variance": money(abs(variance)),
                "within_tolerance": "yes" if abs(variance) <= tolerance else "no",
            }
        )
    estimated_total = sum(estimated.values(), Decimal("0"))
    actual_total = sum(actual.values(), Decimal("0"))
    variance_total = estimated_total - actual_total
    rows.append(
        {
            "symbol": "TOTAL",
            "estimated_income": money(estimated_total),
            "actual_income": money(actual_total),
            "variance_estimated_minus_actual": money(variance_total),
            "absolute_variance": money(abs(variance_total)),
            "within_tolerance": "yes" if abs(variance_total) <= tolerance else "no",
        }
    )
    return rows


def write_csv(path: Path, rows: list[dict[str, str]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    if not rows:
        path.write_text("", encoding="utf-8")
        return
    with path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=list(rows[0].keys()))
        writer.writeheader()
        writer.writerows(rows)


def write_markdown(
    path: Path,
    summaries: list[dict[str, str]],
    payments: list[dict[str, str]],
    as_of: dt.date | None,
    validation_rows: list[dict[str, str]] | None = None,
) -> None:
    totals_by_symbol = summarize_estimated_by_symbol(summaries)
    total_income = sum(totals_by_symbol.values(), Decimal("0"))
    lines = [
        "# ETF Distribution Income Estimate",
        "",
        f"As of: `{as_of.isoformat() if as_of else dt.date.today().isoformat()}`",
        "",
        "This report estimates cash distributions from ex-dividend dates and lot share counts. Verify against Robinhood activity/statements for tax or accounting use.",
        "",
        "## Totals By Symbol",
        "",
        "| Symbol | Estimated Income |",
        "|---|---:|",
    ]
    for symbol in sorted(totals_by_symbol):
        lines.append(f"| {symbol} | ${money(totals_by_symbol[symbol])} |")
    lines.extend(
        [
            f"| **Total** | **${money(total_income)}** |",
            "",
            "## Lots",
            "",
            "| Lot | Symbol | Shares | Purchase Date | Sale Date | Distributions | Estimated Income |",
            "|---:|---|---:|---|---|---:|---:|",
        ]
    )
    for row in summaries:
        lines.append(
            f"| {row['lot_id']} | {row['symbol']} | {row['shares']} | {row['purchase_date']} | "
            f"{row['sale_date']} | {row['distributions_count']} | ${row['estimated_income']} |"
        )
    if validation_rows:
        lines.extend(
            [
                "",
                "## Validation Against Actual Income",
                "",
                "| Symbol | Estimated | Actual | Variance | Within Tolerance |",
                "|---|---:|---:|---:|---|",
            ]
        )
        for row in validation_rows:
            lines.append(
                f"| {row['symbol']} | ${row['estimated_income']} | ${row['actual_income']} | "
                f"${row['variance_estimated_minus_actual']} | {row['within_tolerance']} |"
            )
    lines.extend(
        [
            "",
            "## Output Files",
            "",
            "- `etf-income-summary.csv` contains one row per lot.",
            "- `etf-income-payments.csv` contains one row per eligible distribution payment.",
            "- `etf-income-validation.csv` compares estimates to broker-confirmed income when `--actual-income` is provided.",
            "",
        ]
    )
    path.write_text("\n".join(lines), encoding="utf-8")


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(description="Calculate ETF distribution income from purchase lots and online dividend tables.")
    parser.add_argument("--lots", required=True, type=Path, help="CSV with symbol,purchase_date,shares[,sale_date,note].")
    parser.add_argument("--distributions", type=Path, help="Optional local distribution CSV with symbol,ex_date,amount[,record_date,pay_date,source_url].")
    parser.add_argument("--cache-dir", type=Path, default=Path(".cache/etf-distributions"), help="HTML cache directory.")
    parser.add_argument("--output-dir", type=Path, default=Path("reports/etf-income"), help="Report output directory.")
    parser.add_argument("--as-of", type=str, help="Only include ex-dates on or before this date.")
    parser.add_argument("--actual-income", type=Path, help="Optional broker/account activity CSV with symbol,date,amount rows for validation.")
    parser.add_argument("--validation-tolerance", type=Decimal, default=Decimal("0.05"), help="Allowed per-symbol and total variance before validation fails.")
    parser.add_argument("--fail-on-validation-mismatch", action="store_true", help="Exit non-zero if validation variance exceeds tolerance.")
    parser.add_argument("--refresh", action="store_true", help="Refresh cached online distribution pages.")
    args = parser.parse_args(argv)

    lots = read_lots(args.lots)
    as_of = parse_date(args.as_of) if args.as_of else None
    distributions = get_distributions((lot.symbol for lot in lots), args.cache_dir, args.refresh, args.distributions)
    summaries, payments = calculate(lots, distributions, as_of)
    actual_income = read_actual_income_csv(args.actual_income, as_of) if args.actual_income else []
    validation_rows = build_validation_rows(summaries, actual_income, args.validation_tolerance) if args.actual_income else []

    summary_csv = args.output_dir / "etf-income-summary.csv"
    payments_csv = args.output_dir / "etf-income-payments.csv"
    validation_csv = args.output_dir / "etf-income-validation.csv"
    markdown = args.output_dir / "etf-income-report.md"
    write_csv(summary_csv, summaries)
    write_csv(payments_csv, payments)
    if args.actual_income:
        write_csv(validation_csv, validation_rows)
    write_markdown(markdown, summaries, payments, as_of, validation_rows)

    total_income = sum((Decimal(row["estimated_income"]) for row in summaries), Decimal("0"))
    validation_failed = any(row["within_tolerance"] == "no" for row in validation_rows)
    print(
        json.dumps(
            {
                "lots": len(lots),
                "symbols": sorted({lot.symbol for lot in lots}),
                "payments": len(payments),
                "estimated_income": money(total_income),
                "actual_income": validation_rows[-1]["actual_income"] if validation_rows else None,
                "validation_failed": validation_failed if validation_rows else None,
                "summary_csv": str(summary_csv),
                "payments_csv": str(payments_csv),
                "validation_csv": str(validation_csv) if args.actual_income else None,
                "markdown": str(markdown),
            },
            indent=2,
        )
    )
    if validation_failed and args.fail_on_validation_mismatch:
        return 2
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))

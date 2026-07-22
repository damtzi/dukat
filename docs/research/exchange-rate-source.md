# Exchange-rate source for the Dukat MVP

## Recommendation

Use the National Bank of Poland (NBP) Web API and its **Table A middle rates** as Dukat's automatic exchange-rate source. Support PLN plus the currencies present in Table A for the MVP.

NBP is the best fit because its rates are quoted directly in PLN, it is the Polish central bank's first-party source, and its API exposes current and historical rates. The API returns JSON or XML, identifies currencies with ISO 4217 codes, and provides the table number and effective date alongside each rate.[^1]

Table A currently covers common currencies including EUR, USD, GBP, CHF, CZK, SEK, NOK, DKK, UAH, JPY, CNY, CAD, and AUD.[^2] Table B adds less common currencies but is not needed for the initial product and would introduce a different publication frequency.

The ECB is a credible alternative, and its API publishes a daily PLN/EUR series.[^3] Its rates are EUR-based, however, while Dukat is initially aimed at Polish users. NBP therefore gives Dukat a simpler PLN base and stronger local fit.

## Conversion rule

NBP's `mid` value is the number of PLN for one unit of a foreign currency.[^1] Treat PLN as having a rate of `1`.

To convert an amount from currency A to currency B:

```text
amount in B = amount in A × PLN rate for A ÷ PLN rate for B
```

Keep the original amount and currency. Store the rate records and the calculated reporting amount separately; conversion must never replace financial history.

## Rate selection

- **Completed transactions and spending summaries:** use the latest rate whose effective date is on or before the transaction date. This handles weekends and Polish bank holidays without using information published later.
- **Balance checks and current combined balances:** use the latest available rate.
- **Planned transactions and forecasts:** use the latest available rate and label converted values as estimates, as decided in issue #6.
- **Cross-currency transfers:** keep the actual sent and received amounts confirmed by the user. The NBP rate is only a suggestion and must not replace either amount.
- Record the source (`NBP` or `manual`), Table A number when applicable, effective date, fetch time, and rate used for every reproducible conversion.

The NBP API provides rates from 2 January 2002. A single historical request may cover at most 93 days, so longer backfills must be split into smaller requests.[^1]

## Fetching and caching

- Fetch the latest Table A once each business day and also on demand when a needed rate is absent.
- Persist each effective-date table locally. Historical calculations should read the stored table rather than call NBP on every request.
- Treat a table identified by its type, number, and effective date as an immutable source snapshot. Do not silently rewrite calculations if a later fetch differs; retain enough source metadata to investigate and deliberately recalculate.
- Backfill historical tables in windows of no more than 93 days.
- A `404 Not Found` for a date means NBP published no data for that date; look backward for the latest earlier table. The API documents `400 Bad Request` for malformed or oversized requests.[^1]

## Outages and stale data

- An NBP outage must not block transaction entry or access to balances.
- Continue using the latest cached rate and always expose its effective date.
- Show a stale-rate warning when no new rate has been obtained for five Polish business days.
- Retry automatically with bounded backoff. Once NBP is available, fill missing effective dates and recalculate derived displays. Original amounts remain unchanged.
- If no automatic rate has ever been stored for a required currency, do not invent a converted total. Ask for a manual rate or omit the combined total while still showing original-currency amounts.

## Manual overrides

Allow a workspace member to enter an effective-dated manual rate for one currency against PLN.

- Require the currency, PLN rate, effective date, and a short reason.
- Show clearly that the rate is manual.
- Record who created or changed it and when.
- A manual rate takes precedence over NBP for that workspace from its effective date until the next effective-dated rate for that currency, unless it is removed.
- Removing an override restores automatic conversion and recalculates derived summaries and forecasts; it never changes original transaction or transfer amounts.

This provides an explicit fallback without silently blending guessed rates into trustworthy totals.

## Sources

[^1]: National Bank of Poland, [NBP Web API documentation](https://api.nbp.pl/en.html). Documents Table A/B/C endpoints, response fields, ISO currency codes, historical availability, the 93-day request limit, and error behavior.
[^2]: National Bank of Poland, [Table A API response for 2–10 January 2025](https://api.nbp.pl/api/exchangerates/tables/A/2025-01-02/2025-01-10/?format=json). First-party example of Table A's currency coverage, PLN middle rates, table numbers, and effective dates.
[^3]: European Central Bank, [daily PLN/EUR reference-rate series](https://data-api.ecb.europa.eu/service/data/EXR/D.PLN.EUR.SP00.A?format=csvdata&startPeriod=2025-01-01&endPeriod=2025-01-10). First-party ECB API response showing the daily PLN/EUR series and its EUR denominator.

# Core release acceptance — issue #66

Dukat is a personal app for two users. The fixes and automated tests stay in place.
There is no required month-long trial, formal sign-off, or six-browser manual test cycle.

## Four checks before closing #66

- [ ] Deploy the approved revision. Confirm login, real email delivery (verification,
      password reset and invitations), and profile images work.
- [ ] Both users try their normal money workflows on their own devices: add and edit
      transactions, transfer money, record Household spending, and settle a shared expense.
      Check that the controls are readable and usable with their usual input method.
- [ ] Confirm Personal accounts stay private to their owner. Compare account balances,
      Household settlements and overview totals with known values. Transfers and shared
      money must not be counted twice.
- [ ] Confirm a usable recovery method exists and test one restore into a separate
      database. Check restored access, records and balances. Never overwrite the source.

Use the [deployment](cloudflare-deployment.md) and [recovery](recovery.md) runbooks as needed.
The current recovery choice is Turso PITR, with optional encrypted exports. One successful
restore is enough for this checklist; both methods need not be tested before release.
Deployment and any live writes still need explicit approval.

After these checks pass, #66 can close. A short result note is enough; no formal release
record is required. Keep financial comparisons, exports, email addresses and credentials private.
Privacy leaks, incorrect balances, data loss or blocked normal tasks must be fixed first.

## Optional first-month checklist

Use this during normal use, if helpful. It does not block release or closing #66.

- [ ] At the start, compare opening balances and Household membership with existing records.
- [ ] During the month, try refunds, budgets, forecasts, search and balance corrections as needed.
- [ ] Check balances occasionally. Keep Buddy/Notion available as a reference if useful.
- [ ] At month end, compare spending and settlements and report any problems.

## Automated evidence already collected

| Check                          | Result                                                                      |
| ------------------------------ | --------------------------------------------------------------------------- |
| Type checks                    | 11 tasks passed                                                             |
| Lint                           | Passed                                                                      |
| Default full-stack suite       | 9 passed on Chromium                                                        |
| Optional full-stack matrix     | 54 passed: nine journeys across six projects                                |
| Complete default test suite    | 8 tasks passed; browser tests: 58 passed, 6 existing skips                  |
| Built-dashboard security smoke | 1 passed                                                                    |
| Worker build                   | Dry run passed; no deployment                                               |
| Migrations                     | Empty chain, original users from 0000, and financial data from 0015 checked |

The full-stack suite uses the real dashboard, API and local database. It covers auth,
profiles, Household access, finances, search, forecasts, exports and stale edits.
Repository tests cover atomic failures, exact money and privacy. Migration tests include
amounts above JavaScript's safe integer limit.

Email transport is captured locally; this does not prove real inbox delivery. WebKit and
phone emulation do not prove behavior on the users' actual devices. A Worker dry run is
not a deployment. Those limits are covered by the four checks above.

Validation found and fixed profile-image proxying, caller-controlled request-log values,
and conflicting initial database jobs. Existing test coverage remains available; it is
not a requirement to repeat every browser project for each small change.

## Commands for later checks

Choose checks that match the change. For routine code changes:

```sh
pnpm check-types
pnpm lint
pnpm test
```

`pnpm test` keeps Chromium desktop and phone-layout browser checks, plus all unit and
integration tests. CI uses these defaults. The full-stack default runs nine Chromium journeys:

```sh
pnpm test:e2e:full-stack
```

Six-browser matrices are optional and do not run in routine CI:

```sh
pnpm test:e2e:matrix
pnpm test:e2e:full-stack:matrix
```

Install the extra browsers before using the matrices:
`pnpm --filter @dukat/e2e exec playwright install --with-deps chromium firefox webkit chrome msedge`.
Each full-stack browser gets a fresh database. To check just another browser, use
`FULL_STACK_PROJECT=full-stack-firefox pnpm test:e2e:full-stack`.
For build checks, use `pnpm --filter @dukat/e2e test:production` and
`pnpm --filter @dukat/server build:worker`; the latter does not deploy.

# Core release acceptance — issue #66

This is the release gate for replacing Buddy and the Notion balance table for two users.
Automated checks do not replace the one-month trial or a live restore drill.
Do not close [#66](https://github.com/damtzi/dukat/issues/66) until all gates below have evidence.

## Automated gate

Run from a clean checkout with Node 24 and the locked dependencies:

```sh
pnpm install --frozen-lockfile
pnpm --filter @dukat/e2e exec playwright install --with-deps chromium firefox webkit chrome msedge
pnpm check-types
pnpm lint
pnpm test
pnpm --filter @dukat/e2e test:production
pnpm test:e2e:full-stack
pnpm --filter @dukat/server build:worker
```

`build:worker` builds both dashboards and runs Wrangler's **dry run**. It does not deploy.
Use the deployment runbook for required build environment values. Do not paste secrets into evidence.

The full-stack command runs Chromium, Chrome, Firefox, WebKit, Edge and an emulated Pixel 7.
Each project gets a new migrated database and runs its journeys serially. For a focused rerun:

```sh
FULL_STACK_PROJECT=full-stack-firefox pnpm test:e2e:full-stack
```

The browser uses the built SvelteKit dashboard, the real Hono application and local libSQL.
Only external email transport is replaced: the test process captures Resend payloads in a private
temporary mailbox. Verification tokens and invitation delivery use real application code.
The mailbox and database are deleted after the run. This does **not** prove live Resend delivery,
Cloudflare runtime behavior, hosted Turso behavior, Safari on Apple hardware, or a real phone.

| Requirement                                                                       | Automated evidence                                                                                                                                                        |
| --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Registration, verification, profile persistence                                   | `apps/e2e/tests/full-stack.spec.ts`; auth and profile-image HTTP flows in `apps/server/src/foundation.test.ts` and `profile-images.test.ts`                               |
| Invitations, ownership, removed access                                            | Full-stack membership journey; `packages/db/src/repositories/workspaces.test.ts`                                                                                          |
| Accounts, transactions, linked refunds, transfers, snapshots, corrections, search | Full-stack ledger and credit-card journeys; `packages/db/src/repositories/ledger.test.ts`                                                                                 |
| Personal-funded Household expenses, allocations and settlements                   | Full-stack two-user journey; `packages/db/src/repositories/household-expenses.test.ts`                                                                                    |
| Budgets and expected cash                                                         | Full-stack budget journey; `packages/db/src/repositories/budgets.test.ts`                                                                                                 |
| Forecasts and matching without double counting                                    | Full-stack forecast journey; planning domain and repository tests                                                                                                         |
| Private overview, exact conversion, historical rates                              | Full-stack overview journey; core money/exchange-rate tests; overview API and net-worth-history repository tests                                                          |
| Stale writes and no partial multi-record writes                                   | Full-stack stale transaction rejection; ledger repository tests inject a transfer-side failure and check rollback; Household expense repository tests check atomic writes |
| Empty and populated migrations                                                    | `foundation.test.ts` runs the empty chain; `release-migrations.test.ts` upgrades original users from 0000 and financial data from 0015 through the current chain          |
| Export, lifecycle and admin controls                                              | Full-stack exports; exports and administration API/repository tests; foundation auth/deletion tests                                                                       |
| Encrypted backup and successful restore                                           | `foundation.test.ts`; see the separate live drill below                                                                                                                   |
| Privacy-safe technical logs and admin data                                        | Request logger and error middleware tests; administration API tests                                                                                                       |
| Keyboard, labels, focus, contrast and errors                                      | Existing browser workflow/axe checks on desktop and phone; real-stack profile axe check. Human checks below remain required.                                              |

Attach command outcomes, browser versions, release commit link and CI run link to the release record.
Retain synthetic failure traces only as restricted test evidence. Do not attach real financial
exports, verification links, profile images, email addresses or database credentials to an issue.

## Orb validation record — 2026-09-08

| Check                                                                | Result                                                                         |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `pnpm check-types`                                                   | 11 tasks passed                                                                |
| `pnpm lint` and targeted E2E ESLint                                  | Passed                                                                         |
| Full-stack browser suite                                             | 54 passed: nine journeys in each of six projects; no skips                     |
| Built-dashboard security smoke                                       | 1 passed                                                                       |
| Worker build                                                         | Wrangler dry run passed; no deployment                                         |
| Complete unit/integration and mocked-browser suite                   | 8 tasks passed; browser tests: 146 passed, 46 existing skips                   |
| Existing live `/`, `/admin`, `/api/health/live`, `/api/health/ready` | HTTP 200 on the origin recorded in #58; read-only, not this unshipped revision |

Browser versions: Chromium 151.0.7922.34, Chrome 152.0.7977.82, Firefox 153.0,
WebKit 26.5, Edge 152.0.4191.66. Phone coverage uses Chromium device emulation.

The checks found and fixed missing Vite profile-image proxying and caller-controlled values in
request logs. Browser tests now wait for the enabled profile button before checking contrast and
construct ISO dates from date parts rather than assuming a locale's display format.
The populated migration fixture preserves amounts beyond JavaScript's safe integer range.

Concurrent local startup writes caused lifecycle and outbox failures. Initial jobs now run in
sequence. The full-stack harness waits for startup completion and rejects lifecycle, outbox or
net-worth failure events. Live scheduled jobs, real inbox delivery, hosted restore, and the user
trial still need separate evidence.

## Live environment gate — operator approval required

Use [Cloudflare deployment](cloudflare-deployment.md) and [recovery](recovery.md).
The current recovery choice is Turso PITR plus optional encrypted exports before risky operations;
do not claim that an R2 daily-backup service exists.

- [ ] Record approved release commit, exact origin, operator and date.
- [ ] Apply migrations once. Confirm `/api/health/live` and `/api/health/ready` succeed.
- [ ] Confirm dashboard, `/admin`, API and profile images work from the same origin under CSP.
- [ ] Receive and use verification, password-reset and invitation messages in real inboxes.
- [ ] With synthetic users, confirm disabled-user access is denied and the registration switch works.
- [ ] Confirm scheduled maintenance and net-worth jobs complete successfully, not only HTTP readiness.
- [ ] Inspect technical logs and admin responses. No names, emails, tokens, account IDs, amounts,
      descriptions, search terms or financial records. Confirm unknown request paths remain redacted.
- [ ] Restore a selected PITR point to a **new** database. Never overwrite the source.
- [ ] Run integrity checks, compare record counts and representative balances, and verify access.
- [ ] Record selected recovery point, elapsed restore time and result. Meet the current runbook's
      24-hour recovery-point and four-hour recovery-time targets.
- [ ] Verify an encrypted export can also restore into a new empty database; retain the key separately.
- [ ] Obtain approval before any traffic switch, token change or deletion of recovery resources.

## One-month trial — both intended users

Record dates in Europe/Warsaw. Keep financial comparisons in a private user-owned record, not GitHub.

| Trial record                                        | Value             |
| --------------------------------------------------- | ----------------- |
| Start date / end date (one complete calendar month) | Pending           |
| User A / User B sign-off                            | Pending / Pending |
| Release commit and origin                           | Pending           |
| Actual desktop browsers / phones / OS versions      | Pending           |
| Private comparison record location                  | Pending           |

### Before day one — each user

- [ ] Register, verify email, set name/username/image, sign out and sign back in.
- [ ] Add account opening dates and balances; enter historical Notion snapshots manually.
- [ ] Create Household membership by invitation. Check that Personal accounts remain private.
- [ ] Compare starting Personal, Household and combined net worth. Count each Household once.
- [ ] Set monthly category budgets and expected recurring income/expenses.
- [ ] Confirm exports can be opened and kept privately. Keep Buddy/Notion as comparison sources.

### Every day — each user

- [ ] Enter real income and spending manually from a phone or desktop; check the account and date.
- [ ] Record refunds against their expense; record transfers and card payments without extra spending.
- [ ] Record Household spending and splits. Other user sees the expense, not its Personal source account.
- [ ] Compare daily totals with source records. Record any mismatch, blocked task or duplicate entry.

### Every week — both users

- [ ] Reconcile observed balances. Confirm any correction explicitly; no silent history changes.
- [ ] Review allocations, partial settlements, category budgets and expected/tentative forecasts.
- [ ] Complete or match plans; ensure the actual transaction is counted once.
- [ ] Search past entries; edit a record, trash it and restore it.
- [ ] Check one workflow with keyboard only: visible focus, usable dialogs, restored focus, clear errors.
- [ ] Check phone portrait and desktop at 200% zoom: labels, contrast, readable values, no blocked actions.
- [ ] Try a stale edit in two tabs. The rejected edit must leave the saved record intact.
- [ ] Confirm history keeps its original dated conversion. Missing rates must not become zero totals.

### Month end — release decision

- [ ] Each user's account balances and monthly spending agree with the private comparison record.
- [ ] Household settlement and combined net worth agree; no unexplained missing or duplicate values.
- [ ] Both users complete their normal phone and desktop work without needing Buddy/Notion as a workaround.
- [ ] Record unresolved problems with synthetic reproduction steps. Privacy leaks, data loss,
      incorrect money or blocked main workflows prevent acceptance.
- [ ] Both users sign and date the acceptance record. Operator signs the live environment gate.
- [ ] Close #66 only after all automated, operator and user gates pass.

Mortgage, investments, card conditions, imports, connections, notifications, receipts and offline
features remain outside this release validation task.

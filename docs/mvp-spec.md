# Dukat core release specification

## Status

Agreed product direction. This specification replaces the earlier MVP boundary.

## Product promise

Dukat gives a user a trustworthy view of where their money went, how much money they can access now, and how their cash is expected to change over the next 12 months. It works for one person and supports collaboration through Household workspaces.

The core release succeeds when two users can stop using Buddy and a Notion balance table for one complete month.

## Core boundary

The core release is a responsive English web application for phone and desktop browsers. It supports:

- open user registration with verified email and password;
- names, unique usernames, and profile images;
- Personal and Household workspaces;
- current, savings, cash, and credit-card accounts;
- manual income, expenses, refunds, and transfers;
- Household expenses, allocations, and member settlements;
- one category per transaction and monthly category budgets;
- dated balance snapshots and explicit balance corrections;
- Personal, Household, and combined accessible net worth;
- daily historical net-worth snapshots;
- multiple currencies using NBP exchange rates;
- one-time and recurring planned transactions;
- expected and tentative 12-month cash forecasts;
- transaction search, trash, activity history, and complete data export; and
- Polish date and number formatting with PLN as the default reporting currency.

## Deferred from the core release

- Mortgages and repayment simulation.
- Stocks, exchange-traded funds, and crypto holdings.
- Card usage-condition monitoring.
- CSV imports and direct bank connections.
- Receipt storage.
- Email, push, and in-app notifications.
- Multiple categories on one transaction.
- Property valuation.
- Predicted investment growth.
- PWA installation and offline entry.
- Automatic XTB access.
- Inflation, tax, employment-income, and savings-product calculators.

## Global rules

### Ownership and access

Every financial record belongs to one Personal or Household workspace. Supplying or guessing an identifier never grants access. The server derives identity from the authenticated session and checks workspace access for every query and mutation.

Each user has one Personal workspace. Personal data is visible only to its user. A user may create or join multiple Household workspaces.

All Household workspace members can view and edit its financial data. Owners additionally manage members and workspace settings. A Household workspace can have several equal owners. Its last owner cannot leave without transferring ownership or deleting the workspace.

### Money and dates

- Store original amounts exactly in each currency's minor units.
- Reject zero amounts and unsupported decimal precision rather than rounding.
- Completed transactions use calendar dates no later than today.
- Future movements are planned transactions.
- Store audit events as instants and interpret financial dates in `Europe/Warsaw` initially.
- Currency conversion creates reporting values without replacing original values.

### History and removal

Changes to Household financial data record the actor and time. Removing a financial record moves it to trash for 30 days. Trashed records stop affecting active calculations and can be restored during that period.

An account without history can be deleted. An account with history can only be archived. Archived accounts remain in historical reporting and accept no new activity.

## Product behavior

### 1. Identity and registration

Anyone can register with a name, unique username, email address, and password. Email verification is required. Users can sign in, sign out, reset a password, and return through a valid session.

Authenticated users can find an exact username or email address when inviting someone. Dukat has no public profile pages or browsable member directory. Household workspace members see each other's names, usernames, and profile images.

Registration can be closed by an administrator without disabling existing accounts. Rate limits and usage quotas protect public endpoints.

### 2. Workspaces

Registration creates one Personal workspace. A user can create a Household workspace and invite another user by email or exact username.

Owners can invite, remove, promote, or demote members and change workspace settings. All members can view and edit accounts, transactions, categories, budgets, plans, snapshots, corrections, and settlements.

Access ends immediately when a member leaves or is removed. Household records remain owned by the workspace rather than an individual member.

### 3. Financial accounts

A financial account has a name, type, currency, opening balance, and opening date. Supported types are current, savings, cash, and credit card.

The calculated balance starts with the opening balance and applies active transactions and corrections after the opening date. Dated snapshots verify this calculated value but do not replace it silently.

An existing Personal account can become Household after explicit confirmation that its history becomes visible. A Household account with history cannot become Personal; the user creates a new Personal account instead.

Credit-card purchases count as spending on their purchase date. Paying a credit-card bill is a transfer from another financial account and does not count as spending again.

### 4. Manual transactions

The only core entry source is manual entry. A completed income or expense requires an amount, account, date, and type. Category, merchant, and description are optional.

The phone workflow defaults to today, remembers the last account, and suggests recent merchants and categories. A user can create a normal or Household expense from the same flow.

A transaction has at most one category. Users can edit, trash, restore, search, and filter transactions. Search covers merchant, description, amount, category, account, and date.

### 5. Refunds

A refund links to all or part of an earlier expense. It increases the affected account balance and reduces spending in the original category. It never appears as income.

### 6. Transfers

A transfer links an outgoing and incoming account entry atomically.

- A same-currency transfer sends and receives the same amount.
- A cross-currency transfer records exact sent and received amounts.
- Transfer fees are separate expenses.
- Transfers do not count as income or spending.
- Both sides are edited, trashed, and restored together.

No failure may leave only one side of a transfer.

### 7. Household expenses and settlements

A Household expense belongs to one Household workspace and assigns a configurable share to every participating member. Equal allocation is the default, but the model supports any number of members and uneven shares.

When paid from a Household account, the expense changes that account's balance and Household spending.

When paid from a Personal account, the linked Personal transaction remains private. Other members see only the amount, merchant, category, date, payer, and allocation. They cannot see the Personal account identity, balance, or unrelated transactions. The expense affects Household spending and member settlement but does not change Household cash.

A settlement payment reduces the amount members owe each other. It does not count as income or spending and can link to an account transfer.

### 8. Categories and budgets

Dukat provides stable built-in categories across workspaces. Each workspace can also define custom categories. A transaction or Household expense has at most one category.

A category budget belongs to one workspace and month. It shows completed spending, expected planned spending, remaining budget, and forecast overspend. Unused amounts do not roll into another month.

My overview can summarize budget results but never merges Personal and Household budget limits.

### 9. Balance snapshots and corrections

A balance snapshot records an externally observed account balance and date. Users can add current or historical snapshots manually, including Notion history, without recreating every earlier transaction.

Dukat compares each snapshot with the calculated account balance on that date. A mismatch is visible. The user can create an explicit correction after confirmation. A correction changes the account balance but is excluded from income and spending.

Editing earlier activity recalculates later differences without silently changing existing corrections.

### 10. Overview and net worth

My overview is private to the current user. Before scrolling, it shows:

- combined accessible net worth;
- separate Personal and Household totals;
- account balances;
- current-month spending; and
- upcoming cash position.

Personal net worth is Personal assets minus Personal liabilities. Household net worth is accessible Household assets minus Household liabilities. Combined accessible net worth adds Personal and Household values once without claiming the user's legal ownership percentage.

Dukat records daily net-worth snapshots with source balances and exchange rates. Historical values retain their original conversion rates when newer rates arrive.

Each workspace also has an isolated overview.

### 11. Currencies and exchange rates

Each account has one currency. Each workspace has a reporting currency. My overview has a user-selected reporting currency that defaults to PLN.

NBP Table A supplies automatic rates. Historical values use the latest rate effective on or before their date. Current balances and future plans use the latest valid rate. Foreign currencies convert through PLN when necessary.

A user can enter an effective-dated manual rate. Original values never change. If no valid rate exists, Dukat shows original values and omits the affected combined total rather than inventing a conversion.

### 12. Planned and recurring transactions

A planned transaction records an account, income or expense type, amount, date, status, and optional description and category. Its status is expected or tentative.

Recurring plans support weekly, monthly, and yearly schedules. Expected plans affect the main forecast. Tentative plans affect only an optional scenario.

“Mark completed” creates the real transaction. If the transaction already exists, the user can link it instead. A completed transaction and plan can each have at most one match.

An overdue plan acts as due today until completed, linked, rescheduled, skipped, or cancelled.

### 13. Forecast

The forecast starts from current calculated balances and applies expected unmatched plans through the same date one year later. It shows monthly totals by default, with optional daily and per-account detail.

Tentative plans can be enabled as a separate possible outcome. Transfers move value between accounts without changing total net worth. Personal and Household workspace forecasts remain identifiable when combined in My overview.

### 14. Export and account deletion

A user can export all accessible data as JSON and export transactions, balances, and future holdings as CSV. Exports preserve workspace boundaries.

Deleting a user starts a 30-day recovery period for Personal data. Household data remains with its Household workspace. A sole Household workspace owner must transfer ownership or delete that workspace first.

## Interface constraints

- Support current phone and desktop browsers.
- Optimize manual expense entry for a few seconds of phone use.
- Keep dense account, transaction, and forecast views usable on desktop.
- Use English interface text through the translation layer.
- Use Polish date and number formatting initially.
- Do not require notifications, receipt uploads, installation, or offline support.
- Support keyboard operation, visible focus, readable contrast, and clear validation errors.

## Operations and architecture

- One Cloudflare Worker serves the SvelteKit application and Hono API under one custom origin.
- Turso stores application data with an EU primary database location.
- Cloudflare R2 stores profile images and encrypted logical backups.
- Better Auth provides email and password authentication with secure same-origin cookies.
- Resend sends verification, reset, and invitation emails behind a provider boundary.
- Scheduled jobs record daily net-worth snapshots and, in later phases, market prices.
- A small admin area can inspect users and failed jobs, disable users, and close registration. It does not expose financial details.
- Technical logs exclude amounts, descriptions, account names, holdings, and personal identifiers.
- No product analytics are collected initially.
- TLS, provider encryption, strict authorization, scoped secrets, and encrypted backups protect data. End-to-end field encryption is deferred because it conflicts with server-side sharing, search, reporting, and recovery.

### Recovery

Use Turso point-in-time recovery according to the selected plan. Create one encrypted logical backup each day, store it separately in R2 for 30 days, and keep its encryption key outside Turso and R2. Test restoration rather than treating backup creation as sufficient.

## Delivery after the core release

### 1. Mortgage

- Create draft offers without affecting finances.
- Activate one as a liability with a repayment schedule.
- Support equal and decreasing instalments.
- Support fixed and variable interest with effective-dated reference rates and bank margins.
- Split payments into principal, interest, and fees.
- Treat the full instalment as cash outflow, interest and fees as spending, and principal as debt reduction.
- Compare overpayments that reduce either the term or future instalments.
- Defer property valuation.

### 2. Investments

- Add stock, ETF, and crypto holdings manually.
- Record quantity, optional average purchase cost, workspace, and optional broker label.
- Identify stocks and ETFs by ISIN and exchange; identify crypto with a provider-stable asset identifier.
- Require user confirmation of each market-data match.
- Refresh stocks and ETFs daily and crypto hourly through free providers.
- Permit dated manual prices and never value an unpriced holding at zero.
- Record valuation snapshots from the date a holding is added without fabricating earlier history.
- Show current value and unrealized gain.
- Keep current investment value constant in forecasts unless a later explicit scenario supplies another assumption.
- Defer purchases, sales, dividends, fees, and realized returns to a later investment-ledger phase.

### 3. Card usage conditions

Track required payment count, required spending, deadline, current progress, and fee risk. Show status in the application without notifications.

### 4. CSV imports

Add a generic internal import pipeline and bank-specific mappings for the banks users need. Preserve provenance and prevent duplicate imports. Manual entry remains fully supported.

### 5. External connections

Consider bank synchronization only when a suitable PSD2 provider offers acceptable Polish coverage, cost, and production access. Never collect bank login credentials directly.

Do not automate XTB login. Its official API was discontinued. Continue with manual holdings and market-price providers.

### 6. Installable and offline app

Add PWA installation and queued offline expense entry together. Preserve conflict handling when queued changes synchronize.

## Core release gates

The core release is ready for the one-month replacement trial when:

- both users can register, verify email, create profiles, and share a workspace;
- authorization tests cover Personal data, members, owners, removed members, and private payments of Household expenses;
- account, transaction, refund, transfer, settlement, budget, snapshot, correction, and forecast workflows pass end to end;
- exact-money, currency-conversion, recurrence, atomic-transfer, stale-edit, and trash-restore tests pass;
- My overview never leaks Personal data and never counts an accessible workspace twice;
- the complete migration chain passes against empty and representative data;
- backup creation and restoration are tested;
- current phone and desktop browsers support fast entry and dense financial views;
- main tasks work by keyboard with accessible labels, focus, contrast, and errors; and
- the two intended users accept the product as a replacement for Buddy and the Notion balance table.

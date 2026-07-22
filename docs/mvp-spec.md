# Dukat MVP specification

## Status

Implementation-ready. Product decisions were resolved in GitHub issues #2–#9. Architecture evidence is recorded in `docs/research/`, and ADR-0001 records the persistence decision.

## Product promise

Dukat gives an individual or household a trustworthy view of what money they have now, where it went, and what their available cash is projected to be over the coming months.

## MVP boundary

The MVP is an English web application for modern phone and desktop browsers. It supports:

- personal and household workspaces;
- current, savings, and cash accounts;
- manual and fixed-template CSV transaction entry;
- income, expenses, same- and cross-currency transfers;
- categories and spending summaries;
- balance checks and explicit corrections;
- one-time and recurring planned transactions;
- a rolling 12-month cash forecast;
- multiple currencies using NBP exchange rates;
- English translatable text with Polish date and number formatting by default.

The MVP is complete only when all behavior and launch gates in this document pass. A private test release may begin after personal accounts and manual transactions work.

## Out of scope

- Mortgages and repayment simulation.
- Card fee and usage-condition monitoring.
- Inflation-adjusted income comparisons.
- Credit cards, loans, investments, and savings products.
- Tax and employment-income calculators.
- A full Polish translation or detailed final visual design.
- Direct bank connections, bank-specific CSV presets, flexible CSV column mapping, split transactions, and automatic categorization.

## Global rules

### Ownership and access

Every financial record belongs to one workspace. Every user receives one personal workspace and may create or join multiple household workspaces. Personal and household data are never combined in one balance, summary, or forecast.

The server derives identity from the authenticated session. Supplying or guessing a record ID never grants access. Every financial query and mutation checks workspace access.

### Money and dates

- Original amounts are stored exactly in their account currency using the currency's normal decimal precision.
- Zero amounts and extra decimal precision are rejected rather than rounded.
- Completed transactions may be dated today or earlier. Future movements are plans.
- Financial dates are calendar dates. Audit timestamps identify an instant and actor.
- Conversion creates a reporting value without replacing an original amount.

### History and deletion

Dukat records who changed what and when for transactions, opening balances, transfers, balance checks, corrections, categories, imports, and plans.

Transactions remain in trash for 30 days before permanent deletion. Household deletion has a separate 30-day recovery period. Historical records retain the identity of members who later lose access.

## End-to-end behavior

### 1. Identity and personal workspace

A user can sign up with email and password, verify the email, sign in, sign out, recover a password, and return through a valid session. Signup creates exactly one personal workspace visible only to that user.

Email verification is required before accepting a household invitation. Authentication responses must not reveal whether an email already has an account.

### 2. Financial accounts and balances

A financial account has a name, current/savings/cash type, one currency, and an opening balance. The opening balance is the balance before all stored transactions and has no opening date.

- Details are freely editable before activity exists.
- Currency becomes immutable after activity exists.
- Changing the opening balance recalculates balances without rewriting transactions.
- An account with no history can be permanently deleted.
- An account with history can only be archived at zero balance.
- Archived accounts keep history, accept no new activity, and can be restored.
- Archiving shows the affected future plans, stops recurring plans, and cancels one-time plans after confirmation.
- Negative balances are allowed with a warning.

The account balance is its opening balance adjusted by active income, expenses, transfer sides, and corrections. Checks and planned transactions do not change today's balance.

### 3. Completed income and expenses

A completed income or expense records an account, type, positive amount, date, optional description, optional category, and manual-or-CSV source.

Users can create and edit manual and imported transactions. Imported transactions retain their import source. Editing, trashing, or restoring a transaction immediately updates its account balance. Concurrent stale edits must produce a clear conflict rather than overwrite another change.

### 4. Transfers

A transfer creates two linked records atomically.

- A same-currency transfer sends and receives the same amount.
- A cross-currency transfer records exact sent and received amounts. Dukat suggests a date-appropriate rate, but the user confirms the received amount.
- Both sides are edited, trashed, and restored together.
- Transfers do not count as income or spending and have no category.
- A bank fee is a separate expense.
- A transfer between personal and household accounts is allowed when the acting user can edit both.
- Other household members see the amount on the household side but not the private account's identity or balance.

No failure may leave one transfer side without the other.

### 5. Balance checks and corrections

A balance check records an externally observed balance and date. Dukat compares it with the opening balance and all active account activity through that date.

A check never changes history. When there is a difference, Dukat offers a clearly labelled balance correction. A correction changes account balance but is excluded from income and spending. It remains separate from the check that prompted it.

Checks can be edited or deleted. Changing earlier activity recalculates later check differences but never silently changes existing corrections.

### 6. Household collaboration

Creating a household requires a name and makes the creator its first owner. A household can have multiple equal owners.

All household members can view and edit accounts, transactions, categories, plans, imports, reconciliation records, archives, trash, and restores. Only owners can:

- invite or remove people;
- revoke or resend invitations;
- promote or demote owners;
- rename the household;
- change its reporting currency;
- delete the household.

Invitations are bound to an email, expire after seven days, and require that verified email to accept. All members can see members and owners; only owners see pending invitations.

A non-owner may leave at any time. An owner may leave only when another owner remains. An owner can remove another owner but cannot leave members without an owner. A sole owner must promote someone or delete the household. Access ends immediately on removal or departure.

A user cannot delete their account while they are sole owner of a household containing other members. A household where they are the only member may be deleted during account deletion after explicit confirmation.

Any owner may delete a household after re-authentication and explicit confirmation. Any owner may restore it for 30 days; afterward its financial data is permanently deleted.

### 7. Categories

Each workspace starts with: Salary, Other income, Housing, Groceries, Eating out, Transport, Bills, Health, Shopping, Entertainment, Travel, and Other.

- Categories form one flat list and can be used for income or expenses.
- Names are unique within a workspace regardless of capitalization.
- Users can add and rename categories.
- Renaming changes the name shown on past transactions and is recorded in history.
- An unused category can be deleted.
- A used category can only be archived. Past transactions retain it, but it cannot be selected for new transactions.

### 8. Income and spending summaries

For one workspace and selected period, Dukat shows income by category, spending by category, and uncategorized transactions. Opening a category shows the transactions behind its total.

The default period is the current month. Users can move between months or choose start and end dates. All workspace accounts are included by default, with an account filter available. Transfers and corrections are excluded.

Mixed-currency totals use the workspace reporting currency and the latest exchange rate effective on or before each transaction date. Details preserve original amounts.

### 9. CSV import

Each upload targets one existing account and uses one downloadable, documented Dukat CSV template. Flexible bank-file mapping is deferred.

Before confirmation, a preview shows every valid row, invalid row, possible duplicate, and unknown category.

- Valid rows can be imported while invalid rows remain excluded.
- A row resembling an existing transaction or earlier upload row is skipped by default but can be included deliberately.
- An unknown category can be created, matched, or left blank.
- Confirmation creates all selected rows as one atomic import batch or creates nothing.
- Dukat stores the filename, import time, actor, and source row number, but not the uploaded file.
- Users can view an import batch and move every transaction it created to trash together.

Imported transactions otherwise follow normal editing, history, trash, and restoration rules.

### 10. Currencies and exchange rates

The MVP supports PLN and currencies in NBP Table A. NBP middle rates are the automatic source.

- Rates are stored with exact value, source, table number, effective date, and fetch time.
- A historical conversion uses the latest rate effective on or before its date.
- Current balances and future plans use the latest available rate.
- Two foreign currencies convert through their PLN rates.
- Original amounts never change because of a reporting conversion.
- During an outage, Dukat uses cached rates and shows their date.
- A warning appears after five Polish business days without a new rate.
- If no rate exists, Dukat shows original amounts and omits rather than invents a combined total.

A workspace member can add an effective-dated manual currency-to-PLN rate with a reason. It is clearly marked and audited and takes precedence until the next effective-dated rate. Removing it recalculates derived displays but not original amounts.

### 11. Planned and recurring transactions

A plan belongs to one account and records income/expense type, positive amount, date, expected/tentative status, and optional description and category.

Expected plans affect the main forecast. Tentative plans remain separate and can be included to inspect a possible outcome.

Recurring plans support weekly, monthly, and yearly schedules with an interval, start date, and optional end date. A monthly plan uses the last day of a shorter month when its chosen day does not exist, then returns to that day when possible.

Users can change one occurrence or that occurrence and all future occurrences. Past and matched occurrences remain unchanged. Stopping a recurring plan preserves earlier history and removes later occurrences from forecasts.

### 12. Matching plans with completed transactions

Dukat suggests completed transactions from the same account and type within 14 days before or after the plan date. Equal amounts appear first. A user always confirms the match and can choose another transaction manually.

One plan matches at most one completed transaction and vice versa. Amounts may differ after a warning. Matching removes the plan from the forecast because the completed transaction already affects the current balance.

A match can be undone without changing the completed transaction. The plan returns to the forecast or becomes overdue.

An unmatched plan whose date passes is overdue and acts as due today until matched, rescheduled, or skipped. A skipped item remains in history, does not affect the forecast, and can be restored.

### 13. Forecast

The forecast runs from today through the same date one year later and updates as today advances.

It starts from current calculated account balances and applies expected unmatched plans in date order. Tentative plans affect only an optional scenario. Users can view:

- one account in its account currency; or
- all accounts in one workspace in its reporting currency.

Future foreign-currency conversion uses the latest available rate, is labelled as an estimate, and retains the original planned amount. Personal and household workspaces are never combined.

## Technical architecture

- One stateless Node/Hono application in an EU region serves the client-side SvelteKit dashboard and owns all APIs and database access.
- The public Astro site remains separate.
- Better Auth uses its SQLite Drizzle adapter and same-origin secure HTTP-only cookies.
- Resend supplies verification, password reset, and invitation email behind an adapter.
- One shared Turso database uses `drizzle-orm/libsql`; local development and tests use file databases.
- Workspace authorization is enforced in application services and workspace-scoped repositories, backed by database constraints.
- Money uses signed 64-bit integer minor units in the domain and database; rates use exact decimal representation.
- Effect coordinates application commands, typed failures, dependencies, retries, and observability. Hono, Better Auth, and Drizzle remain adapter concerns.
- Multi-record financial operations use short atomic transactions. Mutable records use versions, and retriable commands use idempotency keys.
- Account balances are calculated from opening balance and active ledger entries rather than a mutable stored total.
- Production uses checked-in reviewed migrations, a single release migration job, Turso point-in-time recovery, daily encrypted logical backups retained separately for 30 days, and tested recovery procedures.

See `docs/research/turso-architecture-validation.md` and ADR-0001 for details.

## Delivery sequence

1. [#10 — Runtime, authentication, and recovery foundation](https://github.com/damtzi/dukat/issues/10)
2. [#11 — Personal accounts and manual ledger](https://github.com/damtzi/dukat/issues/11)
3. [#12 — Transfers and balance reconciliation](https://github.com/damtzi/dukat/issues/12)
4. [#13 — Household workspace collaboration](https://github.com/damtzi/dukat/issues/13)
5. [#14 — Categories, summaries, and CSV import](https://github.com/damtzi/dukat/issues/14)
6. [#15 — Multi-currency reporting and exchange rates](https://github.com/damtzi/dukat/issues/15)
7. [#16 — Planned transactions and 12-month forecast](https://github.com/damtzi/dukat/issues/16)
8. [#17 — Hardening and MVP launch](https://github.com/damtzi/dukat/issues/17)

Each slice must pass its automated acceptance criteria before the next slice is considered complete. The first private test version may follow slice 2; it is not the finished MVP.

## Launch gates

The MVP can launch only when:

- all workflows in this specification pass end-to-end in a production-like environment;
- workspace authorization tests cover owners, members, removed members, unrelated users, and one-sided transfer access;
- exact-money, recurrence, conversion, forecast, atomic rollback, stale-edit, and concurrent-write tests pass;
- current Chrome, Firefox, Safari, and Edge work at phone and desktop sizes;
- main tasks work by keyboard and screen reader, with visible focus, readable contrast, and clear errors;
- no known critical or high-severity security issue remains;
- the complete migration chain passes on empty and production-shaped data;
- backup alerts work and a restore drill verifies financial integrity within four hours;
- stale exchange rates, failed migrations, repeated database conflicts, and service downtime alert operators;
- UI text is translatable, Polish formatting is the default, and locale-formatted values never enter storage;
- the product owner accepts the private test version against this specification.

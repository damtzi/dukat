# Dukat Domain Context

## Product promise

Dukat gives a user a trustworthy view of what money they have now, where it went, and what their available cash is projected to be over the coming months. Users can keep financial data personal or collaborate with other people in Household workspaces.

## Glossary

### User

An authenticated identity represented by a name, unique username, email address, and optional profile image.

### Name

A user-chosen public name. It can be a full name, first name, mononym, or preferred name and need not be a legal name.
_Avoid_: First name, last name, full name, display name

### Username

A globally unique, case-insensitive handle that identifies a user independently of their name. An authenticated user can find an exact username for an invitation, but Dukat does not publish profile pages.

### Profile image

An optional image that visually represents a user to Household workspace members.
_Avoid_: Avatar

### Workspace

The ownership and collaboration boundary for financial data. An account or transaction belongs to exactly one workspace.

### Personal workspace

The single workspace whose financial data is private to one user. Each user has exactly one personal workspace.

### Household workspace

A workspace shared by invited users. A Household workspace can have one or more owners, and a user can belong to multiple Household workspaces.

### Household workspace member

A user who can view and edit all financial data in a Household workspace. Membership does not grant access to financial data in another member's personal workspace.

### Household workspace owner

A Household workspace member who can also manage membership, assign or remove ownership, change workspace settings, and delete the Household workspace. All Household workspace owners have equal authority.

### My overview

A private view that combines financial data the current user can access. It shows personal net worth, Household net worth, and combined accessible net worth separately. It does not grant access to or reveal personal data to another user.

### Personal net worth

The value of assets minus liabilities in the user's personal workspace.

### Household net worth

The value of assets minus liabilities in Household workspaces the user can access. Dukat does not infer each member's ownership percentage.

### Combined accessible net worth

Personal net worth plus Household net worth, counting each accessible workspace once. It describes money visible to the user, not the user's legal ownership.

### Net worth snapshot

A daily record of asset values, liabilities, and the exchange rates used to calculate net worth. Historical snapshots retain their original conversions when newer rates become available.

### Financial account

A place whose balance Dukat tracks in one account currency. It can be a current, savings, cash, or credit card account. Its balance starts with an amount observed on an opening date and changes through later recorded transactions.

An account without history can be deleted. An account with history can be archived, which preserves it for reporting but prevents new activity.

### Credit card account

A financial account that tracks money owed. Card purchases count as spending when made; paying the card is a transfer from another financial account and does not count as spending again.

### Card usage condition

A requirement to complete a number of payments or spend an amount before a deadline to avoid a card fee.

### Account balance

The opening balance of a financial account adjusted by its recorded income, expenses, transfers, and balance corrections.

### Transaction

A completed movement of money into, out of, or between financial accounts. An expected future movement is a planned transaction instead.

### Refund

A transaction that reverses all or part of an earlier expense. It reduces spending in the original expense's category rather than counting as income.

### Household expense

Spending visible in a Household workspace, with a configurable share assigned to each participating member. It can link to a transaction in a member's personal workspace without revealing the personal account's identity, balance, or other transactions. A payment from a personal account affects Household spending and member settlement but does not change Household cash.

### Member settlement

The net amount Household workspace members owe each other based on their shares of Household expenses and recorded settlement payments.

### Settlement payment

A payment between Household workspace members that reduces their member settlement without counting as income or spending. It can link to an account transfer.

### Transfer

A movement of money between two financial accounts. A same-currency transfer moves one amount; a cross-currency transfer records the amount sent and the amount received.

### Category

A single label used to explain the purpose of a transaction or Household expense. Built-in categories have stable identities across workspaces; a workspace can also define custom categories.

### Category budget

A monthly spending limit for one category in one workspace. It compares completed and expected spending with the limit without rolling unused amounts into another month.

### Import batch

The group of transactions created by one confirmed CSV upload into a financial account. It preserves the upload's provenance and can be moved to trash as a group.

### Balance snapshot

A dated balance observed outside Dukat, such as in a bank application. It records balance history and reveals a mismatch with the calculated balance rather than silently rewriting transaction history. Historical snapshots can be added without recreating every earlier transaction.

### Balance correction

An explicit adjustment that resolves a known difference between an observed balance and Dukat's calculated balance. It changes the account balance but is not income or spending.

### Planned transaction

Expected future income or expense assigned to a financial account, with an amount, date, and expected-or-tentative status. It contributes to a forecast until matched with the real transaction, skipped, or cancelled.

### Recurring plan

A repeating rule that produces planned transactions on a weekly, monthly, or yearly schedule.

### Transaction match

A user-confirmed link between one planned transaction and the completed transaction that fulfilled it.

### Trash

Financial records removed from active views for 30 days before permanent deletion. Trashing a record removes its effect from current calculations while preserving a recovery period.

### Forecast

A 12-month projection from current account balances through expected, unmatched planned transactions, shown monthly with optional daily and per-account detail. Tentative plans can be included as a possible outcome, and overdue plans are treated as due today until resolved. Investment values remain at their latest known prices unless a future scenario explicitly states another assumption.

### Cash flow

Completed income and spending over a selected period. Net cash flow is income minus spending. Transfers and balance corrections are excluded because they are not income or spending; transaction fees are spending. Cash flow describes recorded activity, while a forecast describes expected future activity.

### Account currency

The single currency used by a financial account. Transactions on the account use this currency.

### Reporting currency

The currency a workspace uses to show combined balances and forecasts. Amounts in other currencies are converted for reporting without replacing their original values.

### Overview reporting currency

The user-selected currency used by My overview, defaulting to PLN. It converts accessible values for display without replacing their original amounts.

### Exchange rate

An effective-dated rate used to convert an amount between currencies for reporting. It may come from Dukat's automatic source or an explicit workspace override; it never replaces the original amount.

### Cross-currency transfer

A transfer that records both the amount sent in one currency and the amount received in another.

### Investment instrument

A stock, exchange-traded fund, or crypto asset whose market value Dukat can track. A stock or exchange-traded fund is identified by its ISIN and exchange rather than ticker alone.

### Investment holding

A quantity of an investment instrument held in one workspace, with an optional average purchase cost. Its current value uses the latest available market price.

### Market price

The value of one investment instrument at a stated time and in a stated currency. It can come from a market-data provider or manual entry, and Dukat never treats a missing price as zero.

### Investment valuation snapshot

A dated record of an investment holding's quantity, market price, and value. Dukat records these regularly from the day a holding is added without fabricating earlier history.

### Unrealized gain

The difference between an investment holding's current value and purchase cost. It excludes realized returns from past sales.

### Mortgage

A liability with a repayment schedule and effective-dated interest terms. A draft mortgage compares offers without affecting finances; an active mortgage contributes to net worth and future cash projections. Overpayment comparisons can reduce either its term or future instalments.

### Mortgage payment

A cash outflow split into principal, interest, and fees. Principal reduces the mortgage liability; interest and fees are spending. The full payment remains visible in cash-flow reporting.

### Activity history

A record of who changed, corrected, restored, or removed Household financial data and when.

## Language to avoid

- **Shared workspace** — use **Household workspace**.
- **Balance check** — use **balance snapshot**. A snapshot records history as well as checking a calculated balance.
- **Public/private table** — use **Household workspace** or **personal workspace**. Tables are not the sharing boundary.

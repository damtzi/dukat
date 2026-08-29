# Dukat Domain Context

## Product promise

Dukat gives an individual or household a trustworthy view of what money they have now, where it went, and what their available cash is projected to be over the coming months.

## Glossary

### User

An authenticated identity represented by a name, unique username, email address, and optional profile image.

### Name

A user-chosen public name. It can be a full name, first name, mononym, or preferred name and need not be a legal name.
_Avoid_: First name, last name, full name, display name

### Username

A globally unique, case-insensitive public handle that identifies a user independently of their name.

### Profile image

An optional image that visually represents a user to other users.
_Avoid_: Avatar

### Workspace

The ownership and collaboration boundary for financial data. An account or transaction belongs to exactly one workspace.

### Personal workspace

The single workspace whose financial data is private to one user. Each user has exactly one personal workspace.

### Household workspace

A workspace shared by invited household members. A household can have one or more owners, and a user can belong to multiple households.

### Household member

A user who can view and edit all financial data in a household workspace. Membership does not grant access to financial data in another member's personal workspace.

### Household owner

A household member who can also manage membership, assign or remove ownership, change household settings, and delete the household. All household owners have equal authority.

### Financial account

A place whose balance Dukat tracks in one account currency. In the MVP, this can be a current account, savings account, or cash account. Its balance starts with an opening balance and changes through recorded transactions.

### Account balance

The opening balance of a financial account adjusted by its recorded income, expenses, transfers, and balance corrections.

### Transaction

A completed movement of money into, out of, or between financial accounts. An expected future movement is a planned transaction instead.

### Transfer

A movement of money between two financial accounts. A same-currency transfer moves one amount; a cross-currency transfer records the amount sent and the amount received.

### Category

A workspace-defined label used to explain the purpose of a transaction. In the MVP, a transaction has at most one category.

### Import batch

The group of transactions created by one confirmed CSV upload into a financial account. It preserves the upload's provenance and can be moved to trash as a group.

### Balance check

A dated balance observed outside Dukat, such as on a bank statement. Dukat uses it to reveal a mismatch with the calculated balance rather than silently rewriting transaction history.

### Balance correction

An explicit adjustment that resolves a known difference between an observed balance and Dukat's calculated balance. It changes the account balance but is not income or spending.

### Planned transaction

Expected future income or expense assigned to a financial account, with an amount, date, and expected-or-tentative status. It contributes to a forecast until matched with the real transaction, skipped, or cancelled.

### Recurring plan

A repeating rule that produces planned transactions on a weekly, monthly, or yearly schedule.

### Transaction match

A user-confirmed link between one planned transaction and the completed transaction that fulfilled it.

### Forecast

A projection from current account balances through expected, unmatched planned transactions. Tentative plans can be included as a possible outcome, and overdue plans are treated as due today until resolved.

### Cash flow

Completed income and spending over a selected period. Net cash flow is income minus spending. Transfers and balance corrections are excluded because they are not income or spending; transaction fees are spending. Cash flow describes recorded activity, while a forecast describes expected future activity.

### Account currency

The single currency used by a financial account. Transactions on the account use this currency.

### Reporting currency

The currency a workspace uses to show combined balances and forecasts. Amounts in other currencies are converted for reporting without replacing their original values.

### Exchange rate

An effective-dated rate used to convert an amount between currencies for reporting. It may come from Dukat's automatic source or an explicit workspace override; it never replaces the original amount.

### Cross-currency transfer

A transfer that records both the amount sent in one currency and the amount received in another.

## Language to avoid

- **Public/private table** — use **household workspace** or **personal workspace**. Tables are not the sharing boundary.

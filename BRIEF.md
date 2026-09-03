# Dukat product brief

## Purpose

Dukat gives a user one place to understand:

- where their money went;
- how much money they can access now; and
- how their cash is expected to change over the next 12 months.

It replaces expense tracking in Buddy and manual account-balance tracking in Notion. It works for one person and supports collaboration through Household workspaces.

## Core release

The first useful release supports:

- Personal and Household workspaces;
- current, savings, cash, and credit-card accounts;
- fast manual income and expense entry;
- one category per transaction;
- monthly category budgets;
- transfers, refunds, and Household expense splits;
- dated balance snapshots and explicit corrections;
- Personal, Household, and combined accessible net worth;
- daily historical net-worth values;
- one-time and recurring expected or tentative transactions;
- a 12-month cash forecast;
- multiple currencies using NBP rates;
- search, trash, activity history, profiles, and invitations; and
- an English interface with Polish formatting and PLN as the default reporting currency.

The release succeeds when two users can stop using Buddy and the Notion balance table for one complete month.

## Sharing

An account belongs to one Personal or Household workspace. All members can see and edit data in a Household workspace.

A user can pay a Household expense from a Personal account. Household members see the amount, merchant, category, date, payer, and allocation, but not the Personal account identity, balance, or unrelated transactions. The payment affects Household spending and member settlement without changing Household cash.

My overview privately shows Personal net worth, Household net worth, and combined accessible net worth. Combined accessible net worth does not claim legal ownership of Household assets.

## Later delivery

1. Mortgage liability, repayment schedule, and overpayment simulations.
2. Manual stock, ETF, and crypto holdings with automatic market prices.
3. Card usage conditions and fee-risk tracking.
4. CSV imports.
5. Optional bank connections when a suitable provider is available.
6. PWA installation and offline expense entry.

Property valuation, receipt storage, notifications, split transaction categories, predicted investment growth, and automatic XTB access are deferred.

## Platform

Dukat is a responsive web application hosted on Cloudflare under one custom origin. A Cloudflare Worker serves the SvelteKit application and Hono API. Turso stores application data with an EU primary location. Cloudflare R2 stores profile images and encrypted backups.

Registration is open, although the product is initially operated for two users rather than designed for mass adoption. Better Auth provides email and password authentication. Resend sends verification, reset, and invitation emails.

The application provides complete user exports, privacy-safe technical logs, point-in-time database recovery, and daily encrypted backups retained for 30 days.

# Cloudflare deployment

The dashboard, admin dashboard, Hono API, Better Auth routes, and R2 profile images use one
Cloudflare Worker origin. The app is served at `/`, and service administration is served at
`/admin`.
The initial origin can be `https://dukat.<account-subdomain>.workers.dev`; a paid domain is not
required. Keep the R2 buckets private. The Worker serves their objects at `/profile-images/*`.

Cloudflare's free plans include a `workers.dev` hostname, R2's Standard storage allowance, and 5,000
unique Images transformations each month. Cloudflare can require a payment method when R2 is enabled.
Confirm current limits before launch.

## First setup

### 1. Choose the free Worker origin

1. Create or open a Cloudflare account.
2. Open **Workers & Pages**.
3. Next to **Your subdomain**, select **Change** and choose an account subdomain.
4. Record `https://dukat.<account-subdomain>.workers.dev` as the exact production origin.

Do not create a separate Pages project. Wrangler uploads `apps/dashboard/build` as this Worker's
static assets. The `workers.dev` origin is suitable for this temporary personal deployment, but
Cloudflare recommends a custom domain for business-critical production use.

### 2. Create private profile-image buckets

1. Open **R2 Object Storage** and enable R2 if asked.
2. Create a Standard bucket named `dukat-profile-images`.
3. Create a Standard bucket named `dukat-profile-images-preview`.
4. Do not enable `r2.dev` access or connect a public domain.

The checked-in Wrangler bindings grant only this Worker direct bucket access. No R2 API token is
needed at runtime.

### 3. Enable Images transformations

Open **Images** and enable transformations for the account if Cloudflare asks. Do not buy Images
storage. Dukat stores profile images in R2 and uses the Images binding only to validate, crop, and
encode uploads. This use has a free allowance of 5,000 unique transformations per month.

### 4. Create the EU-primary Turso database

Install and sign in to the Turso CLI. Then inspect current location codes:

```sh
turso auth login
turso db locations
```

Use an EU location shown by that command. A Turso group owns the primary location. On a new account:

```sh
turso group create dukat-eu --location <EU_LOCATION_CODE> --wait
turso db create dukat-production --group dukat-eu --wait
turso db show dukat-production --url
```

If the account already has its plan's only group, first run `turso group show <group>` and confirm
that its primary is in the EU. Create `dukat-production` in that group. Do not create the database in
a non-EU group.

Create two database-scoped tokens:

```sh
# Worker: data access only
turso db tokens create dukat-production \
  -p all:data_read,data_add,data_update,data_delete \
  --expiration never

# Release operator: schema migration access; do not put this token in Cloudflare
turso db tokens create dukat-production --expiration never
```

Store each output immediately in a password manager. Turso does not show it again. Rotate the Worker
token separately if it is exposed.

### 5. Prepare Resend

Create a Resend API key. Without a domain, use `Dukat <onboarding@resend.dev>` temporarily. Resend's
test sender can send only to the email address that owns the Resend account. This is enough for one
registration smoke test. Email verification, password reset, and Household invitations to another
person require a domain that Resend can verify.

### 6. Add Worker secrets

From the repository root, authenticate Wrangler:

```sh
pnpm --filter @dukat/server exec wrangler login
```

Run each command and paste the value when prompted:

```sh
pnpm --filter @dukat/server exec wrangler secret put BETTER_AUTH_URL
pnpm --filter @dukat/server exec wrangler secret put BETTER_AUTH_SECRET
pnpm --filter @dukat/server exec wrangler secret put TURSO_DATABASE_URL
pnpm --filter @dukat/server exec wrangler secret put TURSO_AUTH_TOKEN
pnpm --filter @dukat/server exec wrangler secret put RESEND_API_KEY
pnpm --filter @dukat/server exec wrangler secret put AUTH_EMAIL_FROM
pnpm --filter @dukat/server exec wrangler secret put AUTH_ADMIN_EMAILS
```

Use these values:

- `BETTER_AUTH_URL`: exact `https://dukat.<account-subdomain>.workers.dev` origin, without a trailing
  path.
- `BETTER_AUTH_SECRET`: output of `openssl rand -base64 32`.
- `TURSO_DATABASE_URL`: output of `turso db show dukat-production --url`.
- `TURSO_AUTH_TOKEN`: the data-only Worker token.
- `RESEND_API_KEY`: the Resend API key.
- `AUTH_EMAIL_FROM`: `Dukat <onboarding@resend.dev>` until a sending domain exists.
- `AUTH_ADMIN_EMAILS`: comma-separated email addresses that receive administrator access.

Worker startup validates all values without printing them. Requests to an origin different from
`BETTER_AUTH_URL` fail closed. Better Auth therefore emits secure, HTTP-only, same-site cookies and
same-origin redirects.

### 7. Enable automatic deploys

Create a Cloudflare API token from the **Edit Cloudflare Workers** template. Limit it to the account
that owns the `dukat` Worker. Add these repository secrets in GitHub under **Settings → Secrets and
variables → Actions**:

- `CLOUDFLARE_ACCOUNT_ID`: the Worker account ID.
- `CLOUDFLARE_API_TOKEN`: the scoped API token.

The `CI` GitHub Actions workflow uses Cloudflare's Wrangler action to deploy each push to `main` only
after lint, type checks, builds, and tests pass. Pull requests run the same checks but do not deploy.
Production database migrations remain a separate controlled step. Run any required migration before
merging a change that depends on it.

## Release

Migrations are a separate controlled step. Before a risky production migration, confirm that Turso
PITR covers the current state or create the optional manual export in `docs/operations/recovery.md`.
Then run the checked-in migration chain with the release token:

```sh
TURSO_DATABASE_URL="$(turso db show dukat-production --url)" \
TURSO_AUTH_TOKEN='<release-token>' \
pnpm db:migrate:release
```

For the initial deployment or a manual redeployment, deploy only after migration succeeds:

```sh
pnpm run deploy
```

Wrangler builds both static SvelteKit dashboards and deploys them with the Hono API as one Worker.
The hourly Cron Trigger drains durable email/profile-image jobs and records net worth history. After
13:00 UTC, it also performs at most one exchange-rate refresh per UTC day. It records technical job
status at `/admin` without financial contents.

Technical logs may contain only event names, request methods, route paths, response status, duration,
counts, and error class names. Never log request/response bodies, amounts, descriptions, account or
holding names, email addresses, tokens, keys, or third-party error messages.

## Smoke check

1. Open the exact Worker origin.
2. Create an account using the Resend account owner's email.
3. Open the verification email and verify the account.
4. Sign in. Confirm the session cookie is `Secure`, `HttpOnly`, and `SameSite=Lax`.
5. Create a financial account.
6. Add one manual transaction and confirm the displayed balance changes after reload.
7. Upload, replace, and remove a profile image. Confirm the image URL stays on the Worker origin.
8. Open `/api/health/ready`; expect HTTP 200 and `{"status":"ok"}`.

The repository's full-stack browser test builds and serves the production dashboard, then proves the
same registration, sign-in, account, transaction, and persisted-balance seam against a freshly
migrated database:

```sh
pnpm test:e2e:full-stack
```

## Move to a custom domain later

1. Add the domain to Cloudflare and make its DNS active.
2. Open the `dukat` Worker, then **Settings → Domains & Routes → Add → Custom domain**.
3. Add the chosen origin, for example `https://app.example.com`.
4. Replace the `BETTER_AUTH_URL` Worker secret with that exact origin.
5. Verify the same domain in Resend and replace `AUTH_EMAIL_FROM` with an address on it.
6. Deploy again and repeat the smoke check.
7. Disable the `workers.dev` route only after the custom origin works.

No R2 change is needed because profile images use relative same-origin URLs.

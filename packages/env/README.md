# @dukat/env

Type-safe, server-only environment variables for Dukat.

The Node exports load `.env` files by walking upward from the current working directory, so commands can run from the repository root or nested workspace packages.

## Exports

- `@dukat/env/auth` — Better Auth URL/secret, trusted development origin, Resend key, and sender address.
- `@dukat/env/db` — local libSQL or remote Turso URL and optional token.
- `@dukat/env/server` — Node environment, structured-log level, port, and dashboard assets directory.

## Local development

Create a root `.env` based on `.env.example`. Local paths are relative to the workspace package running the command:

```env
DATABASE_URL=file:../../data/dukat.db
BETTER_AUTH_SECRET=replace-with-at-least-32-characters
BETTER_AUTH_URL=http://localhost:3000
CORS_ORIGIN=http://localhost:3001
RESEND_API_KEY=re_...
AUTH_EMAIL_FROM=Dukat <auth@example.com>
LOG_LEVEL=info
```

Keep all values in these exports server-only. The SvelteKit dashboard needs no database or provider secret.

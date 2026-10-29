# @dukat/core

Shared schemas and types.

The package currently contains only identity validation (usernames and names).

## Guidelines

- Export stable TypeScript types from each schema module.
- Re-export public modules from `src/index.ts`.
- Treat this package as the source of truth for domain types shared by apps, API routes, and clients.

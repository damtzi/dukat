# Dukat Context

This repository is a reusable application template. It is intentionally product-neutral and should be customized for each new project.

## Purpose

Use this template to start a TypeScript monorepo with:

- Astro for a public website.
- SvelteKit for application surfaces and dashboards.
- Hono for an API/server entrypoint.
- Better Auth for authentication setup.
- Drizzle ORM with Postgres and local Supabase for persistence.
- Tailwind CSS and shadcn-svelte for shared UI.
- Shared workspace packages under the `@dukat/*` namespace.

## Template conventions

- Keep shared code in `packages/*` and app-specific code in `apps/*`.
- Prefer `@dukat/*` workspace imports over relative cross-package imports.
- Keep `packages/ui` framework-specific to Svelte/shadcn-svelte components.
- Keep `packages/core` product-neutral until a project domain is chosen, then replace the example schemas with real domain schemas.
- Keep environment validation centralized in `packages/env`.
- Keep API route contracts and handlers in `packages/api`, and consume them through `packages/api-client` where possible.

## Customization checklist

When creating a real product from this template:

1. Rename the root package and workspace package scope if `@dukat/*` is not desired.
2. Replace placeholder app names, titles, and copy in `apps/website`, `apps/dashboard`, and `apps/admin`.
3. Replace `packages/core` example schemas with the product domain model.
4. Update database schema files in `packages/db/src/schema`.
5. Update auth providers and trusted origins in `packages/auth` and `packages/env`.
6. Update this `CONTEXT.md` with the project's actual domain language, relationships, and architectural decisions.
7. Review all markdown docs so they describe the customized product rather than the template.

## Current placeholders

- `apps/website` demonstrates an Astro public site that can render Svelte UI components.
- `apps/dashboard` demonstrates a SvelteKit app surface placeholder.
- `apps/admin` demonstrates a SvelteKit internal-tooling placeholder.
- `packages/ui` includes a shadcn-svelte Button component as the first shared UI primitive.
- `packages/core` includes example schemas only.

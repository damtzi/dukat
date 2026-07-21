# Admin app

This is a template SvelteKit app intended as a placeholder for internal tooling.

## Template status

The app currently demonstrates:

- SvelteKit routing.
- Shared Tailwind/global styles from `@dukat/ui`.
- A shared shadcn-svelte Button component.

## Customize for your project

- Replace the placeholder page with your internal tool or remove the app if unused.
- Add authentication and authorization before exposing any sensitive workflows.
- Keep least-privilege access controls and auditability in mind for future admin features.

## Development

From the repository root:

```sh
pnpm --filter @dukat/admin dev
pnpm --filter @dukat/admin build
pnpm --filter @dukat/admin check-types
pnpm --filter @dukat/admin lint
```

# Website app

This is the template's public Astro website.

Use it for marketing pages, documentation, public content, or any mostly-static web experience. It is wired for Tailwind CSS and can render shared Svelte components from `@repo/ui` through `@astrojs/svelte`.

## Template responsibilities

- Demonstrate Astro pages and layouts.
- Import shared Tailwind/global styles.
- Demonstrate use of a shared shadcn-svelte component.

## Customize for your project

- Replace the placeholder page copy and metadata.
- Add routes under `src/pages`.
- Update `src/layouts/Layout.astro` with product metadata, analytics, and SEO defaults.
- Remove the example placeholder route if it is not needed.

## Development

From the repository root:

```sh
pnpm --filter @repo/website dev
pnpm --filter @repo/website build
pnpm --filter @repo/website preview
pnpm --filter @repo/website check-types
```

# Dukat design system

## Direction

Dukat uses the compact, square `lyra` shadcn-svelte style. Shared primitives and
tokens live in `packages/ui`. Dashboard composition lives in `apps/dashboard`.

## Typography

- Page title: `PageHeader`, 30 px heading.
- Page description: `PageHeader`, 14 px muted text.
- Section title: `SectionHeader`, 20 px heading.
- Body and supporting copy: 14 px.
- Component labels, controls, and metadata: 12 px from `@dukat/ui`.
- Inter is the body face. JetBrains Mono is the heading face.

Do not set page or section heading classes at each call site. Use the dashboard
header components.

## Spacing

Use Tailwind's 4 px spacing scale.

- App edge: 16 px mobile, 24 px tablet, 32 px desktop.
- Page stack: `flex flex-col gap-6`.
- Section content: `flex flex-col gap-3` or `gap-4`.
- Form fields: `Field.Group` and `Field.Field`.
- Inline controls: `gap-2`.

Parents own outer spacing. Reusable components must not add outer margins.
`AppShell` owns responsive page padding. Page headers align to that content edge;
apply readable max-width constraints to page content, not the whole page wrapper.

## Surfaces

- Use `Card` for grouped content.
- Use `Empty` for no-data states.
- Use `Alert` for feedback.
- Use `inset-panel` for a bordered record inside another surface.
- Use `list-row` for compact divided rows.

Surfaces stay square. Rounded shapes are reserved for profile images, chart
points, status pills, and progress tracks.

## Color

Use semantic tokens such as `text-muted-foreground`, `bg-card`, `border-border`,
and component variants. Do not add raw palette colors in dashboard features.

## Responsive behavior

Start with one column. Add columns at `sm` or `md`. Actions wrap and stay near
their heading. Tables need a compact mobile card equivalent when columns cannot
fit.

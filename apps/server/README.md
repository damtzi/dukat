# Server app

This is the template Hono server entrypoint. It mounts the shared `@repo/api` app with `@hono/node-server`.

## Development

From the repository root:

```sh
pnpm --filter @repo/server dev
pnpm --filter @repo/server build
pnpm --filter @repo/server lint
```

The default development port is configured in `src/index.ts`.

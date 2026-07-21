# Server app

This is the template Hono server entrypoint. It mounts the shared `@dukat/api` app with `@hono/node-server`.

## Development

From the repository root:

```sh
pnpm --filter @dukat/server dev
pnpm --filter @dukat/server build
pnpm --filter @dukat/server lint
```

The default development port is configured in `src/index.ts`.

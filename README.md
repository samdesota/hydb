# HyDB

A TypeScript monorepo containing:

- `packages/hydb`: schemas, queries, transactions, live subscriptions, and persistent storage.
- `packages/hyapp`: application gateways, commands, HTTP transport, and optional SolidJS bindings built on HyDB.

Package names remain `@hyos/hydb` and `@hyos/hyapp` so existing imports keep working.

## Development

Use Node.js 24 and npm. From the repository root:

```sh
npm ci
npm run build
npm run typecheck
npm test
```

Run `npm run sandbox` to generate the HyDB query planner sandbox. See [HyApp usage](packages/hyapp/README.md), [HyDB API](packages/hydb/docs/api-spec.md), and [storage benchmarks](packages/hydb/benchmarks/README.md).

## History

This repository preserves the original HyDB and HyApp changes extracted from HyOS, with unrelated changes removed. See [extraction details](docs/extraction.md) and the [original-to-extracted commit map](docs/history/commit-map.tsv).

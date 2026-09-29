# @438d/hyapp

`@438d/hyapp` is the application layer built on `@438d/hydb`. It provides typed
commands, principal-bound gateways, client/server command compilation, HTTP
transport, and optional SolidJS bindings. HyDB owns schemas, queries,
transactions, row policies, and storage.

## Installation

Requires Node.js 24.11 or newer.

```sh
npm install @438d/hyapp @438d/hydb
```

Install `esbuild` to use `@438d/hyapp/esbuild`, or `solid-js` to use
`@438d/hyapp/solid`. Both integrations are optional. Install `zod` directly when
using it to define application principal and command schemas.

## Usage and agent instructions

Start with the [HyApp skill](skills/hyapp/SKILL.md), or open a focused reference:

- [Commands and authorization overrides](skills/hyapp/references/commands.md)
- [Client/server compilation](skills/hyapp/references/compilation.md)
- [Gateways and HTTP](skills/hyapp/references/gateway-and-http.md)
- [Clients, optimistic coordination, and SolidJS](skills/hyapp/references/clients-and-solid.md)

The [usage index](usage.md) also links to HyDB's database guidance. See the
[repository getting-started guide](https://github.com/samdesota/hydb#readme) for a
SolidJS and Node server walkthrough.

The npm package includes `skills/hyapp/SKILL.md` and its references. Ask your
agent to read `node_modules/@438d/hyapp/skills/hyapp/SKILL.md`, or copy the whole
`skills/hyapp` folder into its supported skills directory. Package installation
alone does not register the skill with every agent.

## License

MIT

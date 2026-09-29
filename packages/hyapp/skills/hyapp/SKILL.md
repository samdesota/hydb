---
name: hyapp
description: Build or modify applications using @438d/hyapp with HyDB. Use for typed commands, principal-bound gateways, HTTP clients, client/server command compilation, optimistic coordination, and optional SolidJS bindings.
license: MIT
---

# HyApp

HyApp is the application layer over `@438d/hydb`. It supplies commands,
gateways, transports, and client coordination; the database package supplies
schemas, queries, policies, and storage. Use the application's existing schema
and authentication. The packages require Node.js 24.11 or newer and HyApp uses
ESM exports.

## Choose the relevant reference

- Defining mutations, results, policy overrides, or command names: read
  [commands.md](references/commands.md).
- Sharing commands between server and browser, or integrating a bundler: read
  [compilation.md](references/compilation.md).
- Binding a principal, registering remote reads, or mounting HTTP handlers:
  read [gateway-and-http.md](references/gateway-and-http.md).
- Calling the gateway, adding optimistic behavior, or using SolidJS: read
  [clients-and-solid.md](references/clients-and-solid.md).

References use a project/task example and identify their assumed application
values. For database modeling and policy definitions, the dependency ships its
own HyDB skill at `node_modules/@438d/hydb/skills/hydb/SKILL.md`; load it when
available and relevant. For additional API signatures, inspect the installed
packages' `dist/src/*.d.ts` declarations.

## Build the application boundary correctly

1. Define shared schema/query values and reuse one Zod principal schema
   instance on the server. Provide exactly one read policy per table and one
   write policy per table in each command factory's default policy set.
2. Define commands with `hyapp.commandFactory({ principal, defaultPolicy })`.
   An optimistic-only command also runs those mutations authoritatively on the
   server. A custom server handler calls `applyOptimistic()` at most once if it
   wants to reuse them. Omitted `output` means a `void` result.
3. Compile unified command source separately for `client` and `server`, or use
   explicit client/server runtime modules. The client transform removes server
   code and policy dependencies before bundler traversal. Treat a transform
   failure as a build failure; tree shaking is not the command boundary.
4. Register stable command and read names. Bind authenticated principals through
   `gateway.forPrincipal(...)` or the HTTP handler's principal resolver.
   Authentication belongs to the host application; request-body principal data
   is not authentication. Raw `database.fetch` is unfiltered.
5. Give browser clients a client-target registry. HTTP sends committed changes;
   local optimistic updates need an application-provided `OptimisticCoordinator`.
   HyApp does not provide a replica, automatic layering, or automatic rollback.

Keep the relevant entry points separate:

| Entry point | Use |
| --- | --- |
| `@438d/hyapp` | Commands, registries, gateway, typed client, direct transport |
| `@438d/hyapp/compiler` | Command-source transform for a custom toolchain |
| `@438d/hyapp/esbuild` | Build plugin; install optional peer `esbuild` |
| `@438d/hyapp/http` | Browser HTTP and streaming transport |
| `@438d/hyapp/node` | Node HTTP request handler |
| `@438d/hyapp/solid` | Optional Solid bindings; install `solid-js` |
| `@438d/hyapp/wire` | Codec for custom transports, including dates and bigints |

## Check the behavior you change

For authorization changes, check fetches, subscriptions, and commands with an
allowed and a denied principal. For compilation changes, build both targets
and check that server-only imports do not enter the browser bundle. For client
lifecycle changes, dispose manual subscriptions and verify failure handling.
When adding optimistic behavior, distinguish failures before transport from
server rejection and confirm that pending layers settle in both cases.

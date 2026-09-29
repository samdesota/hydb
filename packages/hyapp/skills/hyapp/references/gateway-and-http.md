# Gateway sessions and HTTP

Use this reference to expose application reads and mutations. Examples assume
`database`, a server-target `commandRegistry`, `principalSchema`, `readPolicies`,
and an application query named `projectBoardQuery`. Import `hyapp` from
`@438d/hyapp`. Authentication is provided by the host application.

Give every remotely accessible query a stable wire name:

```ts
export const readRegistry = hyapp.gatewayReadRegistry({
  projectBoard: projectBoardQuery,
});
```

The HTTP adapter only accepts queries present in this registry. Application
code still uses the query value directly, so `fetch(projectBoardQuery)` retains
its inferred result type.

## Create the gateway

The gateway joins the database, command registry, principal schema, and read
policies. A session binds all reads and commands to one validated principal.

```ts
export const gateway = hyapp.gateway({
  database,
  principal: principalSchema,
  registry: commandRegistry,
  readPolicies,
});

const session = gateway.forPrincipal({ userId: "user-123" });

const board = await session.fetch(projectBoardQuery);
const unsubscribe = session.subscribe(projectBoardQuery, (nextBoard) => {
  console.log(nextBoard);
});
await session.dispatch("createTask", {
  id: crypto.randomUUID(),
  projectId: "project-123",
  title: "Document the API",
  createdAt: new Date(),
});

unsubscribe();
```

Direct sessions are useful for trusted backend code and integration tests. They
apply the same read and write policies as remote clients.

## Expose the gateway over HTTP

The Node adapter is a composable handler, not an opinionated server. Its
`principal` callback is where the host application verifies a session, token,
or other credential and returns principal data.

```ts
// server.ts
import { createServer } from "node:http";
import { createNodeGatewayHttpHandler } from "@438d/hyapp/node";

const handleGateway = createNodeGatewayHttpHandler({
  gateway,
  reads: readRegistry,
  basePath: "/api/hyapp",

  async principal(request) {
    const user = await authenticateRequest(request);
    return { userId: user.id };
  },

  onError(error) {
    console.error(error);
  },
});

const server = createServer(async (request, response) => {
  if (await handleGateway(request, response)) return;

  response.writeHead(404).end();
});

server.listen(3001);
```

The adapter serves one-shot reads, streaming subscriptions, and commands. It
validates registered read names, request sizes, command inputs, principals,
policies, and results. `basePath` defaults to `/api/hyapp`; `maxBodyBytes`
defaults to 64 KiB.

The shared wire codec preserves values JSON alone cannot round-trip faithfully,
including dates, byte arrays, bigints, `undefined`, special numbers, and
objects containing reserved wire keys.

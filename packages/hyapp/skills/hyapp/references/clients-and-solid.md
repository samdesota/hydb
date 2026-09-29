# Clients, optimistic coordination, and SolidJS

Use this reference for browser calls, local optimistic behavior, and optional
SolidJS integration. Examples assume a client-target `commandRegistry`,
`projectBoardQuery`, and the matching `readRegistry` from
[gateway-and-http.md](gateway-and-http.md). Load only the sections you need.

## Create the browser client

Build this module with the client command target. Its imported command registry
then contains contracts and optimistic methods, never server implementations.

```ts
// client.ts
import { hyapp } from "@438d/hyapp";
import { httpGatewayTransport } from "@438d/hyapp/http";

export const client = hyapp.gatewayClient({
  registry: commandRegistry,
  transport: httpGatewayTransport({
    reads: readRegistry,
    baseUrl: "/api/hyapp",
    headers: () => ({
      authorization: `Bearer ${readAccessToken()}`,
    }),
    onSubscriptionError(error) {
      console.error("Gateway subscription failed", error);
    },
  }),
});
```

The resulting API is fully typed:

```ts
const board = await client.fetch(projectBoardQuery);

const unsubscribe = client.subscribe(
  projectBoardQuery,
  (nextBoard) => renderBoard(nextBoard),
  (error) => showConnectionError(error),
);

await client.dispatch("createTask", {
  id: crypto.randomUUID(),
  projectId: "project-123",
  title: "Ship it",
  createdAt: new Date(),
});
```

Command names, arguments, and results come from `commandRegistry`; query results
come from the query value. Unknown names and invalid argument shapes fail at
compile time and are validated again at runtime.

For an in-process client in backend tests, pair a client-target registry with a
gateway session:

```ts
import { directGatewayTransport, gatewayClient } from "@438d/hyapp";

const testClient = gatewayClient({
  registry: clientCommandRegistry,
  transport: directGatewayTransport(
    gateway.forPrincipal({ userId: "user-123" }),
  ),
});
```

### Optimistic coordination

Providing an `optimistic` coordinator lets the client apply a command's
optimistic method to a local replica and reconcile it with the server response:

The `replica` and layer methods below are illustrative application-owned APIs,
not exports from HyApp. Implement them for the application's local state model;
the transport's response watermark is optional.

```ts
const client = hyapp.gatewayClient({
  registry: commandRegistry,
  transport,
  optimistic: {
    async begin(request) {
      const layer = replica.beginLayer(request.invocationId);

      return {
        transaction: layer.transaction,
        applied: () => layer.publish(),
        acknowledged: (response) => layer.commit(response.watermark),
        rejected: (error) => layer.rollback(error),
      };
    },
  },
});
```

The coordinator owns replica-specific layering and rollback. Without one, the
client validates input and sends the command without applying a local update.
If replica data may be missing, its transaction should represent an inapplicable
optimistic mutation as a safe no-op when the command must still reach the
server. Throwing from `begin`, the optimistic method, or `applied` rejects the
client command before transport; throwing is therefore appropriate only when
the command itself should be cancelled.

## Use the Solid helpers

The optional Solid entry point adds reactive query lifecycle and command
pending state without replacing the gateway client API.

Install the optional `solid-js` peer and use the host application's Solid JSX
build setup. Construct the helpers inside a Solid owner so cleanup runs.

```tsx
import { Show } from "solid-js";
import { createCommandDispatcher, createGatewayQuery } from "@438d/hyapp/solid";

export function ProjectBoard() {
  const board = createGatewayQuery(client, projectBoardQuery);
  const dispatch = createCommandDispatcher(client);

  async function addTask(projectId: string) {
    await dispatch("createTask", {
      id: crypto.randomUUID(),
      projectId,
      title: "New task",
      createdAt: new Date(),
    });
  }

  return (
    <Show when={!board.loading()} fallback={<p>Loading…</p>}>
      <Show when={board.data()}>
        {(projects) => <pre>{JSON.stringify(projects())}</pre>}
      </Show>
      <button
        disabled={dispatch.isPending("createTask")}
        onClick={() => void addTask("project-123")}
      >
        Add task
      </button>
      <button onClick={board.refetch}>Refetch</button>
    </Show>
  );
}
```

`createGatewayQuery` returns reactive `data`, `loading`, and `error` accessors
plus `refetch()`. It performs an initial fetch, owns a live subscription, avoids
fetch/subscription races, and cleans up with the Solid owner. The client and
query arguments may also be accessors, which is useful when login changes the
active client or route parameters change the query.

`createCommandDispatcher` returns the typed `dispatch` function itself.
`dispatch.isPending(commandName)` reads a Solid signal, so a render or effect
that calls it updates automatically. Overlapping executions keep that command
pending until the final call settles.

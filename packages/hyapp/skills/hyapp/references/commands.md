# Commands and authorization overrides

Use this reference to define application mutations and register their wire names.
Examples assume application tables named `tasks` and `projects`, one shared Zod
`principalSchema`, and a complete `writePolicies` array. Import `hyapp` from
`@438d/hyapp`; policies and principal configuration belong in server modules.
Use [compilation.md](compilation.md) when the same command source reaches a browser.

## Define commands once

A command has an input schema, an optional async optimistic method, and only
needs an output schema or server method when it has a meaningful result or
additional backend behavior. The factory supplies the principal type and
default policy to every command in the group.

```ts
import { z } from "zod";

const commands = hyapp.commandFactory({
  principal: principalSchema,
  defaultPolicy: writePolicies,
});

export const createTask = commands.define({
  input: z.object({
    id: z.string().min(1),
    projectId: z.string().min(1),
    title: z.string().trim().min(1).max(100),
    createdAt: z.date(),
  }),
  async optimistic({ transaction }, input) {
    await transaction.insert(tasks, {
      ...input,
      done: false,
    });
  },
});

export const completeTask = commands.define({
  input: z.object({ taskId: z.string().min(1) }),
  async optimistic({ transaction }, { taskId }) {
    await transaction.update(tasks, [taskId], { done: true });
  },
});
```

The optimistic transaction exposes only `insert`, `update`, and `delete` and
may run in either environment. When `server` is omitted, HyApp applies this
method as the authoritative server transaction. When `output` is omitted, the
command result is `void`. This is the normal form for a mutation whose caller
only needs to know whether it succeeded.

A custom server method receives the authenticated `principal`, the full
transaction, and async `applyOptimistic()`. Calling `applyOptimistic()` lets
custom server execution share the same mutations. It is single-use, and the
server method may instead implement different backend behavior. Define an
output schema only when the caller needs a result from that behavior.

Input is parsed before execution and output is parsed before it crosses the
command boundary. Zod input/output transformations are reflected in the
command's inferred call and result types.

### Explicit authorization overrides

Ordinary mutations use the factory's default policies. An exceptional change
can use `transaction.withAdminPolicy`, but it must prove authorization inside
the same transaction:

```ts
export const transferProject = commands.define({
  input: z.object({
    projectId: z.string().min(1),
    newOwnerId: z.string().min(1),
  }),
  async server({ transaction, principal }, input) {
    await transaction.withAdminPolicy(async ({ db, assert }) => {
      const project = await db.get(projects, [input.projectId]);

      assert(
        project?.ownerId === principal.userId,
        "Only the current project owner can transfer this project",
      );

      await transaction.update(projects, [input.projectId], {
        ownerId: input.newOwnerId,
      });
    });
  },
});
```

The admin scope starts unarmed. It must call `assert` successfully at least
once, and every assertion requires a meaningful error message. A mutation
before a successful assertion, a false assertion, or leaving the callback
without an assertion aborts execution. The override applies only inside the
callback; it is not a way to disable policy checks for an entire command.

Finally, register the commands under stable names:

```ts
export const commandRegistry = hyapp.commandRegistry({
  createTask,
  completeTask,
  transferProject,
});
```

Those keys become the typed command names accepted by gateway clients.

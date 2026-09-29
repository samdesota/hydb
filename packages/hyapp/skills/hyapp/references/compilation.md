# Client and server compilation

Use this reference for shared command builds or explicit client/server runtime
modules. The examples use commands from [commands.md](commands.md).

## Compile shared commands for client and server

The unified `commandFactory().define()` source contains both implementations.
Compile it for each target so server code, principal schemas, and write policies
cannot enter the browser dependency graph.

Install `esbuild` in the host project. The examples assume an ESM project
(`"type": "module"` in `package.json`). Set the Node trace flag to a literal
`"0"` in browser bundles because the database currently reads
`process.env.HYOS_BOOT_TRACE`. For TSX, retain the host app's framework-specific
JSX transform; the command plugin does not compile Solid JSX.

With esbuild:

```ts
// esbuild.client.ts
import { build } from "esbuild";
import { hyappCommandsPlugin } from "@438d/hyapp/esbuild";

await build({
  entryPoints: ["src/client.tsx"],
  bundle: true,
  platform: "browser",
  format: "esm",
  define: { "process.env.HYOS_BOOT_TRACE": '"0"' },
  plugins: [hyappCommandsPlugin({ target: "client" })],
  outfile: "dist/client.js",
});
```

```ts
// esbuild.server.ts
import { build } from "esbuild";
import { hyappCommandsPlugin } from "@438d/hyapp/esbuild";

await build({
  entryPoints: ["src/server.ts"],
  bundle: true,
  platform: "node",
  format: "esm",
  packages: "external",
  plugins: [hyappCommandsPlugin({ target: "server" })],
  outfile: "dist/server.js",
});
```

The client transform retains contracts and optimistic methods. The server
transform retains the server factory configuration and both methods. The
client compiler fails closed if a command definition cannot be analyzed
statically; import pruning happens before bundler dependency traversal rather
than relying on tree shaking as a security boundary.

Other build tools can call the target-independent compiler:

```ts
import { compileCommandModule } from "@438d/hyapp/compiler";

const result = compileCommandModule(source, {
  target: "client",
  filename: id,
});

return result.code;
```

For example, a Vite plugin can invoke this from its `transform(source, id)`
hook for TypeScript and JavaScript application modules.

### Using the base API without a compiler

The compiler lowers unified commands to public runtime constructors. A custom
toolchain can also define its client and server modules explicitly:

```ts
// contracts.ts — safe to import in both builds
import { createCommandContract } from "@438d/hyapp";
import { z } from "zod";

export const createTaskInput = z.object({
  id: z.string(),
  projectId: z.string(),
  title: z.string(),
  createdAt: z.date(),
});
export const createTaskContract = createCommandContract({
  input: createTaskInput,
});
```

```ts
// commands.client.ts
import { createClientCommandFactory } from "@438d/hyapp";
import { createTaskContract } from "./contracts.js";

const clientCommands = createClientCommandFactory();

export const createTask = clientCommands.define({
  contract: createTaskContract,
  async optimistic({ transaction }, input) {
    await transaction.insert(tasks, { ...input, done: false });
  },
});
```

```ts
// commands.server.ts
import { createServerCommandFactory } from "@438d/hyapp";
import { createTaskInput } from "./contracts.js";

const serverCommands = createServerCommandFactory({
  principal: principalSchema,
  defaultPolicy: writePolicies,
});

export const createTask = serverCommands.define({
  input: createTaskInput,
  async optimistic({ transaction }, input) {
    await transaction.insert(tasks, { ...input, done: false });
  },
});
```

This form makes the client/server module boundary explicit while sharing the
Zod schemas that define the wire contract.

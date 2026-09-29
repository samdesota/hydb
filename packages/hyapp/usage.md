# HyDB and HyApp usage

The usage guide is now organized as two Agent Skills. Each `SKILL.md` is a short
entry point; its references contain the examples and API-specific guidance.
The Markdown is also readable directly without an agent.

| Task | Reference |
| --- | --- |
| Define tables, indexes, and typed queries | [HyDB schemas and queries](../hydb/skills/hydb/references/schema-and-queries.md) |
| Define the principal and row policies | [HyDB policies](../hydb/skills/hydb/references/policies.md) |
| Open a database and use transactions | [HyDB storage and transactions](../hydb/skills/hydb/references/storage-and-transactions.md) |
| Choose persistence, migrate, import, or collect history | [HyDB persistence](../hydb/skills/hydb/references/persistence.md) |
| Define commands and authorization overrides | [HyApp commands](skills/hyapp/references/commands.md) |
| Build shared commands for client/server | [HyApp compilation](skills/hyapp/references/compilation.md) |
| Create gateway sessions and an HTTP endpoint | [HyApp gateway and HTTP](skills/hyapp/references/gateway-and-http.md) |
| Call the gateway, coordinate optimistic updates, or use Solid | [HyApp clients and Solid](skills/hyapp/references/clients-and-solid.md) |

Start with the [HyDB skill](../hydb/skills/hydb/SKILL.md) for database work or the
[HyApp skill](skills/hyapp/SKILL.md) for application integration. The repository
[getting-started walkthrough](https://github.com/samdesota/hydb#getting-started)
shows a SolidJS client and Node server. The [command design](docs/commands.md) is architectural
background; use the skills and installed declarations for current usage.

In an npm installation, HyDB's references are in the sibling `@438d/hydb`
package. Keep each skill folder with its `references/` directory when installing
it into an agent's skill directory.

For the full public API and adoption checklist, see the
[framework usage reference](https://github.com/samdesota/hydb/blob/main/usage.md).

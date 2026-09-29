# Schemas and typed queries

Use this reference when defining tables, relationships, projections, or live queries.
The examples share the `model.ts` tables below.

## Define the HyDB schema

A table needs a primary key. Columns may be nullable, required, defaulted, or
foreign-key references. Index relationship columns that will be filtered or
joined frequently.

```ts
// model.ts
import { boolean, hydb, id, index, text, timestamp } from "@438d/hydb";

export const users = hydb.table("users", {
  id: id().primaryKey(),
  name: text().notNull(),
});

export const projects = hydb.table(
  "projects",
  {
    id: id().primaryKey(),
    ownerId: id()
      .notNull()
      .references(() => users.id),
    name: text().notNull(),
    createdAt: timestamp().notNull(),
  },
  (columns) => [index("projects_owner_idx").on(columns.ownerId)],
);

export const tasks = hydb.table(
  "tasks",
  {
    id: id().primaryKey(),
    projectId: id()
      .notNull()
      .references(() => projects.id),
    title: text().notNull(),
    done: boolean().notNull().default(false),
    createdAt: timestamp().notNull(),
  },
  (columns) => [index("tasks_project_idx").on(columns.projectId)],
);

export const appSchema = hydb.schema({ users, projects, tasks });
```

HyDB also exports `integer`, `number`, `json`, `uniqueIndex`, and
`hydb.enum(name, values)` for typed string enums.

## Define typed queries

Queries are values, not endpoint handlers. They can be fetched, subscribed to,
nested, and shared between server and client builds.

```ts
// queries.ts
import { hydb, type InferQueryResult } from "@438d/hydb";
import { projects, tasks } from "./model.js";

export const projectBoardQuery = hydb
  .query(projects)
  .orderBy((project) => project.createdAt.desc())
  .select((project) => ({
    id: project.id,
    name: project.name,
    tasks: hydb
      .query(tasks)
      .where((task) => task.projectId.eq(project.id))
      .orderBy((task) => task.createdAt.asc())
      .select((task) => ({
        id: task.id,
        title: task.title,
        done: task.done,
      }))
      .many(),
    openTaskCount: hydb
      .query(tasks)
      .where((task) => task.projectId.eq(project.id))
      .where((task) => task.done.eq(false))
      .count(),
  }))
  .many();

export type ProjectBoard = InferQueryResult<typeof projectBoardQuery>;
```

A query ends with `.many()`, `.one()`, or `.count()`. Selection fields preserve
their TypeScript result types. The query builder also supports comparison and
logical expressions, multiple `where` clauses, and ascending or descending
ordering.

## Fetch and subscribe

After creating `database` with the same schema and storage, use the query value:

```ts
const board = await database.fetch(projectBoardQuery);
const unsubscribe = database.subscribe(projectBoardQuery, (nextBoard) => {
  console.log(nextBoard);
});

// When the consumer is disposed:
unsubscribe();
```

A subscription delivers its initial result and then maintains it as commits
change relevant rows. A raw database has no read-policy filtering. Use the same
query through a principal-bound gateway for user-facing reads. Register a stable
read name when exposing it through HyApp's HTTP adapter.

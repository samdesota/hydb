# HyDB / HyApp history extraction

Source: `https://github.com/samdesota/hyos.git`

Source main revision: `d52253f55ad95ca8c0b9f2296ee070a14e21a2df`

The extraction inspected all 398 commits reachable from the source repository's locally available refs. It retained 60 commits: 54 on `main` and six additional commits on side branches. It includes local branches, remote-tracking branches, and saved work snapshots available at extraction time; no remote fetch was performed.

## Preserved paths

- `packages/hydb/`
- `packages/hyapp/`
- `docs/research/hydb-persistent-storage-trees.md`
- `docs/research/hydb-spillable-sort-and-join.md`
- `docs/research/differential-dataflow-for-hydb.md`

`git-filter-repo` 2.47.0 retained only these paths, pruned empty commits and degenerate merges, and preserved original author/committer identities, timestamps, and complete messages. Commit IDs necessarily changed because their trees and ancestry changed. Original messages can mention other HyOS work; those unrelated file changes are absent.

Every retained commit's complete file tree was compared against its original commit restricted to these paths. Blob hashes, file modes, author/committer records, and messages match. The commit map is in `docs/history/commit-map.tsv`; the full filter report is also available locally in `.git/filter-repo/`.

Relevant original branch names are retained. Unique saved work is available as `archive/hydb-memory-authority-snapshot` and `archive/hydb-migration-stash`. Redundant refs for unrelated HyOS branches and editor bookkeeping refs were removed after verifying that all 60 commits remained reachable.

## Standalone workspace

One new commit after the extracted history adds the root npm workspace, a lockfile restricted to these two packages, the shared TypeScript configuration, ignore rules, CI, and extraction documentation. Package source files are unchanged from the source main revision. Historical commits contain the extracted original files; root build configuration is introduced by the standalone setup commit.

Other HyOS packages and applications, including the project-management example, are outside this extraction. Uncommitted source files were not copied. The original repository and working changes were left untouched. No remote is configured and nothing has been published.

## Validation

- Clean `npm ci` succeeds with the extracted lockfile.
- `npm test` builds and type-checks both packages; 188 HyDB tests and 24 HyApp tests pass on Node.js 24.19.0.
- Native LMDB tests and the localhost HTTP test were run outside the execution sandbox.
- All 60 preserved commits were checked against their original trees and metadata. All 321 discarded non-merge commits were checked to contain no selected-path changes.

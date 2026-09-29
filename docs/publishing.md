# Publishing to npm

The repository root stays private. Publish the two workspaces as public packages
under the `@438d` npm organization. Use Node.js 24.11 or newer.

1. Update the versions in both workspace manifests and HyApp's dependency on
   `@438d/hydb`, then run `npm install --package-lock-only`.
2. Run `npm ci` and `npm test` from the repository root.
3. Run `npm pack --workspaces --dry-run` and check that both packages include
   compiled entry points, declarations, a README, the MIT license, and each
   `skills/<name>/SKILL.md` with all of its references. Tests,
   benchmarks, and sandboxes should not be included.
4. Install actual tarballs in a clean temporary project and check the public
   entry points, including HyDB's CommonJS exports and HyApp's compiler.
5. Sign in with `npm login` using an account with publish access to `@438d`.
6. Publish HyDB first, then HyApp, completing npm's authentication prompts:

   ```sh
   npm publish --workspace @438d/hydb
   npm publish --workspace @438d/hyapp
   ```

Each package's `prepack` script builds its output. `publishConfig` selects the
public npm registry and public access. npm versions cannot be overwritten;
increment the version for each subsequent release.

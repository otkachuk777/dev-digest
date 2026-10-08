# Advice playbook

Pick only advice the facts support; name the package. Generic tips are noise.

- **Heavy client package imported in few files** (e.g. >10 MB, `staticImportFiles` ≤ 2 and `lazyOnly` false): `next/dynamic` / dynamic `import()` so it leaves the initial bundle; check for a lighter alternative.
- **Same package, different versions across modules** (`duplicates[].drift`): align to the newest compatible; the vendored `shared/` copies make drift costly.
- **Big transitive count for a small job** (`transitiveCount` ≫ 50): replace with stdlib/native or a smaller lib; ponytail-style — less code beats a dependency.
- **Vulnerability with fix**: bump exact range; with `fix: none`, pin/override and record why.
- **Outdated major**: read the changelog first; group majors per module into one PR; don't mix with feature work.
- **Unused candidate**: grep once more (dynamic imports, config strings) before deleting; remove through the package manager, never hand-edit lockfiles (repo rule).
- **Circular dependency / arch violation**: fix the import, do not regenerate the depcruise baseline to hide it.
- **devDependency in `dependencies`** (test/build tools under prod): move it; shrinks production install.
- **Heavy but `lazyOnly: true`**: already code-split. Report it as a disk-size cost only (CI install time, Docker layer), never as a bundle problem; at most suggest confirming the chunk with a bundle analyzer.

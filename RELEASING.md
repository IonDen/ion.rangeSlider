# Releasing ion.rangeSlider 2.x

Bugfix or docs only: patch (2.3.2). Additive feature: minor (2.4.0). Never 3.0. Node 22 or newer.

1. `git fetch origin`, then `git switch -c release/2.3.2 origin/master` on a clean tree.
2. `npm run release -- patch` (or `minor`). It bumps every version string, the build counter and the build date (UTC), adds a `history.md` entry and rebuilds `js/` and `css/`. If it errors partway through (for example, the rebuild step fails), run `git checkout -- .` and investigate; the tree is not rolled back automatically.
3. Replace `#TODO` in `history.md` with the issue numbers the release closes (`gh issue list --milestone 2.3.2 --state all --json number -q '[.[].number] | map("#"+tostring) | join(", ")'`).
4. `npm run test:all`, then read `git diff`.
5. Commit `Release 2.3.2`, push, open the PR, wait for CI. The maintainer merges it, not whoever prepared it.
6. `git switch master && git pull`, then `git tag 2.3.2 && git push origin 2.3.2` (bare number, no `v`).
7. `npm pack --dry-run` must list only `js/`, `css/`, `less/`, `readme.md`, `history.md`, `License.md` and `package.json`; then `npm publish`. cdnjs and jsDelivr follow npm.
8. Close the milestone and the issues it shipped (they stay open until this step on purpose), and move the board's "Next release" view to the next milestone.

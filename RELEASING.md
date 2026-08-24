# Releasing ion.rangeSlider 2.x

Bugfix or docs only: patch (2.3.2). Additive feature: minor (2.4.0). Never 3.0. Node 22 or newer.

Prerequisite, one time only: the npm trusted publisher for `ion-rangeslider` must be configured on npmjs.com (package Settings -> Trusted Publisher -> GitHub Actions, owner `IonDen`, repository `ion.rangeSlider`, workflow `publish.yml`). Publishing is otherwise handled by `.github/workflows/publish.yml` and needs no npm token or repo secret.

1. `git fetch origin`, then `git switch -c release/2.3.2 origin/master` on a clean tree.
2. `npm run release -- patch` (or `minor`). It bumps every version string, the build counter and the build date (UTC), adds a `history.md` entry and rebuilds `js/` and `css/`. If it errors partway through (for example, the rebuild step fails), run `git checkout -- .` and investigate; the tree is not rolled back automatically.
3. Replace `#TODO` in `history.md` with the issue numbers the release closes (`gh issue list --milestone 2.3.2 --state all --json number -q '[.[].number] | sort | map("#"+tostring) | join(", ")'`).
4. `npm run test:all`, then read `git diff`.
5. Commit `Release 2.3.2`, push, open the PR, wait for CI. The maintainer merges it, not whoever prepared it.
6. `git switch master && git pull`, then `git tag 2.3.2 && git push origin 2.3.2` (bare number, no `v`). The tag push triggers `publish.yml`, which checks the tag against `package.json`, runs the tests and publishes with provenance via trusted publishing. If the tag was already pushed and the workflow needs to be run by hand (for example the first release after configuring trusted publishing), dispatch it instead: `gh workflow run publish.yml -f tag=2.3.2`.
7. Watch the run (`gh run watch` or the Actions tab) until `npm publish` succeeds. `npm pack --dry-run` locally beforehand is still useful to sanity-check the file list (`js/`, `css/`, `less/`, `readme.md`, `history.md`, `License.md` and `package.json`). cdnjs and jsDelivr follow npm.
8. Close the milestone and the issues it shipped (they stay open until this step on purpose), and move the board's "Next release" view to the next milestone.

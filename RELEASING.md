# Releasing Ion.RangeSlider 2.x

Bugfix or docs only: patch (2.5.1). Additive feature: minor (2.6.0). Never 3.0. Node 22 or newer.

Every step below writes `<version>` where the version you are cutting goes: a bare number such as `2.5.1`, never a `v` prefix.

Prerequisite, one time only: configure the npm trusted publisher for `ion-rangeslider` on npmjs.com (package Settings -> Trusted Publisher -> GitHub Actions), with:
- Organization or user: `IonDen`
- Repository: `ion.rangeSlider`
- Workflow filename: `publish.yml`
- Environment name: leave empty. The workflow declares no GitHub Actions environment; setting one here makes npm reject its publishes.
- Allowed actions: `npm publish`

Publishing is otherwise handled by `.github/workflows/publish.yml` and needs no npm token or repo secret. Once a trusted-publishing release has gone through cleanly, harden the package on npmjs.com: set publishing access to require 2FA and disallow classic tokens.

Repository setup, also one time: the master ruleset must allow direct pushes for the "Build dist on master" workflow (it should not require a pull request, while still keeping "no force push" and "no deletion"); a separate tag ruleset that only the repository admin can bypass keeps a stolen token from pushing a release tag on its own; and the repository's default workflow token permission (Settings, Actions, General) is read-only, so a workflow gets write access only where it declares it.

1. `git fetch origin`, then `git switch -c release/<version> origin/master` on a clean tree, once the last "Build dist on master" run on master has finished (cutting the branch first can leave the release PR conflicting on the built files).
2. `npm run release -- patch` (or `minor`). It bumps every version string, the build counter and the build date (UTC), adds a `history.md` entry and rebuilds `js/` and `css/`. If it errors partway through (for example, the rebuild step fails), run `git checkout -- .` and investigate; the tree is not rolled back automatically. Pull requests no longer carry rebuilt files; master's built files are kept current between releases by the "Build dist on master" workflow, so this release commit's diff under `js/` and `css/` is normally just the version and build-date bump.
3. Replace `#TODO` in `history.md` with the issue numbers the release closes (`gh issue list --milestone <version> --state all --json number -q '[.[].number] | sort | map("#"+tostring) | join(", ")'`).
4. `npm run test:all`, then read `git diff`. `npm pack --dry-run` is worth a look too: it should list only `js/`, `css/`, `less/`, `readme.md`, `history.md`, `License.md` and `package.json`.
5. Commit `Release <version>`, push, open the PR, wait for CI. The maintainer merges it, not whoever prepared it. CI's built-files check is strict on `release/*` branches: it fails if any built file still differs from a fresh build, so this is where a missed rebuild gets caught before it reaches npm.
6. `git switch master && git pull`, then `git tag <version> && git push origin <version>`. The tag push triggers `publish.yml`, which checks the tag against `package.json`, runs the tests and publishes with provenance via trusted publishing. If the tag was already pushed and the workflow needs to be run by hand (for example the first release after configuring trusted publishing), dispatch it instead: `gh workflow run publish.yml -f tag=<version>`.
7. Watch the run (`gh run watch` or the Actions tab) until `npm publish` succeeds. cdnjs and jsDelivr follow npm.
8. Create the GitHub Release on the tag: `gh release create <version> --verify-tag --title "<version>" --notes-file <path>`, where `<path>` holds that version's `history.md` entry with its heading line (`### Version <version>. ...`) stripped. `--verify-tag` aborts instead of auto-creating the tag from the default branch if the version is mistyped. The GitHub "latest" release always follows the npm tag, so this step is not optional.
9. Close the milestone and the issues it shipped (they stay open until this step on purpose), and move the board's "Next release" view to the next milestone.
10. Update the project site: publish the new version's files, refresh the version shown on the project page and add demos for anything new in this release.

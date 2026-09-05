/**
 * Pure verdict for the "built files" CI job (issue #853). No git calls here:
 * the caller (scripts/check-dist.mjs) gathers `changedBuiltFiles` (built
 * files the pull request itself touched, base...HEAD) and
 * `driftedBuiltFiles` (built files a fresh `npm run build` leaves different
 * from what is committed) and hands them here, which keeps the decision
 * unit-testable without a git checkout.
 *
 * - On a `release/*` head branch the check is strict: every built file must
 *   already match the build output, because bringing master's dist up to
 *   date with source is exactly what a release branch is for (see
 *   RELEASING.md). It fails naming every stale file, whether or not this
 *   branch's commits touched it.
 * - On any other branch, a pull request that touches no built file has
 *   nothing to check: dist on master intentionally lags the source between
 *   releases, so the job is skipped rather than judged.
 * - Otherwise, only the built files the pull request itself changed must
 *   match the build output; that blocks a hand-edited or half-rebuilt
 *   commit. A built file that drifted for an unrelated reason (master is
 *   simply behind the last release) but that this branch never touched does
 *   not fail it.
 *
 * @param {{ headRef: string, changedBuiltFiles: string[], driftedBuiltFiles: string[] }} input
 * @returns {{ ok: boolean, skipped: boolean, message: string }}
 */
export function decide({ headRef, changedBuiltFiles, driftedBuiltFiles }) {
  const isReleaseBranch = /^release\//.test(headRef);

  if (isReleaseBranch) {
    if (driftedBuiltFiles.length === 0) {
      return { ok: true, skipped: false, message: 'release branch: built files match the build output.' };
    }
    return {
      ok: false,
      skipped: false,
      message: `release branch: built files are stale, rebuild before merging: ${driftedBuiltFiles.join(', ')}`,
    };
  }

  if (changedBuiltFiles.length === 0) {
    return { ok: true, skipped: true, message: 'this pull request changed no built file; built-files check skipped.' };
  }

  const offending = changedBuiltFiles.filter((f) => driftedBuiltFiles.includes(f));
  if (offending.length) {
    return {
      ok: false,
      skipped: false,
      message: `built file(s) do not match the build output, rebuild with npm run build: ${offending.join(', ')}`,
    };
  }
  return { ok: true, skipped: false, message: 'built files this pull request changed match the build output.' };
}

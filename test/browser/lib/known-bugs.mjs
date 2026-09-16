/**
 * #877 browser suite -- the known-bug register.
 *
 * A filed bug turns a red matrix cell into an annotation instead of a failure, and
 * the day the bug is fixed the entry itself fails ("no longer reproduces here"), so
 * a fix has to retire its register line. Nothing here skips or loosens a test.
 *
 * An entry is:
 *   {
 *     issue: 881,                                   // the filed GitHub issue number
 *     title: 'grid labels skip the last tick',      // one line, in the glossary's words
 *     matches(ctx, id) { return id === 'grid' && ctx.cfg.grid_snap === true; }
 *   }
 *
 * `matches` receives the same ctx the invariants get ({ state, cfg, stage, prev,
 * expectations }) plus the failing invariant id. Predicate on the CONFIG FIELDS that
 * reproduce the bug, never on a generated entry id: the generator re-numbers its
 * entries whenever a dimension changes, and an entry keyed on an id would silently
 * stop matching.
 *
 * The register starts empty on purpose. Entries are added only after the bug is
 * filed, with the issue number in hand.
 */

/** @type {Array<{issue: number, title: string, matches: (ctx: object, id: string) => boolean}>} */
export const KNOWN_BUGS = [];

/**
 * The register entry that covers this failure, if any.
 *
 * @param {object} ctx   the invariant context ({ state, cfg, stage, prev, expectations })
 * @param {string} id    the failing invariant id
 * @returns {object|null}
 */
export function matchKnownBug(ctx, id) {
    for (const bug of KNOWN_BUGS) {
        if (bug && typeof bug.matches === 'function' && bug.matches(ctx, id)) return bug;
    }
    return null;
}

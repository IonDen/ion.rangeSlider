import * as acorn from 'acorn';

/**
 * Throws unless `code` parses as ECMAScript 3 (what IE8 runs). Catches ES5+ syntax,
 * object-literal trailing commas, and ES3 reserved words used as identifiers,
 * object keys, or after a dot (`allowReserved: 'never'` is acorn's IE-parser mode).
 * Not caught (acorn accepts them): array-literal trailing commas and ES5 built-ins
 * such as forEach/Object.keys. Review still has to watch for those.
 */
export function assertEs3(code, label) {
  try {
    acorn.parse(code, { ecmaVersion: 3, allowReserved: 'never', sourceType: 'script' });
  } catch (e) {
    throw new Error(`${label} is not ES3-safe: ${e.message}`);
  }
}

import * as acorn from 'acorn';

/**
 * Throws unless `code` parses as ECMAScript 3 (what IE8 runs). Catches ES5+ syntax,
 * object-literal trailing commas and ES3 reserved words used as identifiers.
 * Not caught (acorn accepts them): array-literal trailing commas, reserved words
 * after a dot (`o.class`; uglify-js in ie mode quotes those in the minified file),
 * and ES5 built-ins such as forEach/Object.keys. Review still has to watch for those.
 */
export function assertEs3(code, label) {
  try {
    acorn.parse(code, { ecmaVersion: 3, allowReserved: false, sourceType: 'script' });
  } catch (e) {
    throw new Error(`${label} is not ES3-safe: ${e.message}`);
  }
}

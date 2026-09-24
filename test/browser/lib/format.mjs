/**
 * #877 browser suite -- expected label text, derived from readme.md only.
 *
 * The oracle here is the readme's settings table and its notes, not the plugin:
 * prettify_enabled, prettify_separator, prettify, prettify_grid, prettify_min_max,
 * prettify_all_values, prefix, postfix, min_prefix, max_prefix, max_postfix,
 * decorate_both, values_separator, values and values_raw. A label the plugin draws
 * differently from what these functions predict is a finding, not a rule to relax.
 *
 * A config that carries a custom prettify function into the page (through the
 * fixture's string config) must also carry a test-side copy for this oracle:
 * cfg.__prettify, cfg.__prettify_grid, cfg.__prettify_min_max. They are separate
 * fields because JSON.stringify drops function-valued properties, so the page copy
 * and the oracle copy travel by different routes.
 */

import { isValuesMode, rangeOf } from './scale.mjs';

/** readme settings table default for prettify_separator: a space. */
const DEFAULT_SEPARATOR = ' ';
/** readme settings table default for values_separator: space, em dash, space. */
const DEFAULT_VALUES_SEPARATOR = ' — ';

/**
 * The built-in number formatting.
 *
 * readme settings table, prettify_enabled: "Format long numbers: 10000000 ->
 * 10 000 000"; prettify_separator: "Thousands separator for the built-in
 * formatting. A space by default (10 000 000); set it to "," for 10,000,000, or to
 * an empty string to turn the separator off". Only the integer part is grouped --
 * the readme's examples never break up a fractional part.
 *
 * @param {number} num
 * @param {string} sep
 * @returns {string}
 */
export function builtinPrettify(num, sep) {
    const text = String(num);
    const sign = text.charAt(0) === '-' ? '-' : '';
    const body = sign ? text.slice(1) : text;
    const dot = body.indexOf('.');
    const integer = dot < 0 ? body : body.slice(0, dot);
    const fraction = dot < 0 ? '' : body.slice(dot);
    const grouped = integer.replace(/\B(?=(\d{3})+(?!\d))/g, sep);
    return sign + grouped + fraction;
}

/**
 * The entry of a values-mode config at an index, with the documented conversion.
 *
 * readme note "values": "A numeric-looking entry such as "20.0" is converted to the
 * number 20 unless values_raw is on." readme note "values_raw": "Turn values_raw on
 * to keep the entry exactly as written."
 *
 * @param {object} cfg
 * @param {number} index
 * @returns {number|string}
 */
export function valuesEntry(cfg, index) {
    const entry = cfg.values[index];
    if (typeof entry === 'number') return entry;
    if (cfg.values_raw) return entry;
    const text = String(entry).trim();
    if (text !== '' && Number.isFinite(Number(text))) return Number(text);
    return entry;
}

/**
 * The custom formatting function for a surface, with the documented fallback.
 *
 * readme note "prettify_grid": "Formats the grid labels only. When it is not set,
 * the grid labels fall back to prettify, and then to the built-in number
 * formatting"; readme note "prettify_min_max" says the same for the min and max
 * labels. Both notes add "it does not apply in values mode", so values mode sees
 * only prettify.
 *
 * @param {object} cfg
 * @param {'handle'|'min'|'max'|'grid'} surface
 * @returns {Function|null}
 */
function prettifyFor(cfg, surface) {
    const custom = typeof cfg.__prettify === 'function' ? cfg.__prettify : null;
    if (isValuesMode(cfg)) return custom;
    if (surface === 'grid' && typeof cfg.__prettify_grid === 'function') return cfg.__prettify_grid;
    if ((surface === 'min' || surface === 'max') && typeof cfg.__prettify_min_max === 'function') return cfg.__prettify_min_max;
    return custom;
}

/**
 * The formatted text of a value, before decoration.
 *
 * In values mode the argument is an index and the text comes from the entry at that
 * index (readme "Callback data": from_pretty is "the prettified entry, not the
 * index"). A non-numeric entry is only passed to prettify with prettify_all_values
 * on (readme settings table: "In values mode, also run prettify on non-numeric
 * entries"); without a custom prettify there is nothing to run, so the entry is
 * shown as written.
 *
 * Exported as expectedPretty because it is also the oracle for the callback payload:
 * readme "Callback data" documents from_pretty / to_pretty as "FROM formatted" and
 * min_pretty / max_pretty as "MIN formatted" -- the text a label is built from, before
 * decorate() wraps the prefixes and postfixes around it.
 *
 * @param {number} value   a number, or an index in values mode
 * @param {object} cfg
 * @param {'handle'|'min'|'max'|'grid'} surface
 * @returns {string}
 */
export function expectedPretty(value, cfg, surface) {
    const fn = prettifyFor(cfg, surface);
    const separator = typeof cfg.prettify_separator === 'string' ? cfg.prettify_separator : DEFAULT_SEPARATOR;

    if (isValuesMode(cfg)) {
        const entry = valuesEntry(cfg, value);
        if (typeof entry === 'number') {
            if (cfg.prettify_enabled === false) return String(entry);
            return fn ? String(fn(entry)) : builtinPrettify(entry, separator);
        }
        if (cfg.prettify_all_values && fn) return String(fn(entry));
        return String(entry);
    }

    if (cfg.prettify_enabled === false) return String(value);
    return fn ? String(fn(value)) : builtinPrettify(value, separator);
}

/**
 * Wrap formatted text in the documented prefixes and postfixes.
 *
 * readme settings table: prefix "Prefix for values: $100"; min_prefix "Prefix for
 * the minimum value only: From: 0 - 100"; max_prefix "0 - Up to: 100"; postfix
 * "Postfix for values: 100k"; max_postfix "Postfix for the maximum value only:
 * 0 - 100+".
 *
 * A max_postfix and a postfix on the same label are separated by ONE space, and a postfix
 * that already opens with whitespace brings its own: "100+" followed by "k" reads
 * "100+ k", and followed by " years" it reads "100+ years". That is the rule issue #884
 * asks for -- insert the separator only when the postfix does not already begin with
 * whitespace -- so the plain-postfix case is exactly what the plugin renders today and
 * only the doubled space of the age demo (postfix " years") is the defect the register
 * carries. Predicting "100+k" instead would call a healthy label wrong and leave that
 * matrix cell red for as long as the option pair exists.
 *
 * Two points the readme leaves open, pinned here as characterization of the shipped
 * behaviour (the readme never shows the decorations combined):
 *   - min_prefix and max_prefix sit outside prefix, and are mutually exclusive per
 *     call, so a degenerate min === max resolves to min_prefix;
 *   - the readme is silent on which labels the min/max prefixes reach; the decision is
 *     taken on the VALUE, so a handle sitting on max is decorated like the max label.
 * Both are still able to fail: a change to either one reds the tests in
 * test/unit/browser-lib.test.mjs.
 *
 * @param {string} text    already formatted value text
 * @param {number} value   the raw value (an index in values mode)
 * @param {object} cfg
 * @param {'handle'|'min'|'max'|'grid'} surface   kept for the documented signature; the
 *                                                decorations are chosen by value, not surface
 * @returns {string}
 */
export function decorate(text, value, cfg, surface) {
    const { min, max } = rangeOf(cfg);
    let out = '';
    if (cfg.min_prefix && value === min) out += cfg.min_prefix;
    else if (cfg.max_prefix && value === max) out += cfg.max_prefix;
    if (cfg.prefix) out += cfg.prefix;
    out += text;
    if (cfg.max_postfix && value === max) {
        out += cfg.max_postfix;
        if (cfg.postfix && !/^\s/.test(cfg.postfix)) out += ' ';
    }
    if (cfg.postfix) out += cfg.postfix;
    return out;
}

/**
 * The text a label should carry for a value on a surface.
 *
 * @param {number} value   a number, or an index in values mode
 * @param {object} cfg
 * @param {'handle'|'min'|'max'|'grid'} [surface]
 * @returns {string}
 */
export function expectedLabel(value, cfg, surface = 'handle') {
    return decorate(expectedPretty(value, cfg, surface), value, cfg, surface);
}

/**
 * The text a GRID tick should carry for a value.
 *
 * The grid is the one surface that is formatted but never decorated: readme
 * settings table documents prefix ("Prefix for values: $100"), postfix, min_prefix,
 * max_prefix and max_postfix as decorations of a VALUE label, while the grid rows
 * (grid, grid_num, grid_snap) and the values note say nothing about them. The plugin
 * agrees -- with {min: 0, max: 100, from: 30, grid: true, prefix: '$', postfix: 'k'}
 * the min and max labels read "$0k" and "$100k" while the grid reads 0, 25, 50, 75,
 * 100. Characterization: the readme does not say whether grid labels are decorated;
 * the plugin never has.
 *
 * The formatting itself is the documented chain: prettify_grid, then prettify, then
 * the built-in number formatting (readme note "prettify_grid"), and in values mode the
 * entry at the index through prettify_all_values (readme note "values").
 *
 * @param {number} value   a number, or an index in values mode
 * @param {object} cfg
 * @returns {string}
 */
export function expectedGridLabel(value, cfg) {
    return expectedPretty(value, cfg, 'grid');
}

/**
 * The text of the merged from/to label in double type.
 *
 * readme settings table, decorate_both: "When the from and to value labels merge
 * into one, decorate both values ($10k - $100k) instead of only the merged pair
 * ($10 - 100k)"; values_separator: "Separator between the from and to values in the
 * merged label". With decorate_both off the pair is decorated once, against `to` --
 * that is what the readme's "$10 - 100k" example shows (the postfix lands after the
 * second value).
 *
 * @param {number} from
 * @param {number} to
 * @param {object} cfg
 * @returns {string}
 */
export function expectedMerged(from, to, cfg) {
    const separator = typeof cfg.values_separator === 'string' ? cfg.values_separator : DEFAULT_VALUES_SEPARATOR;
    if (cfg.decorate_both === false) {
        return decorate(expectedPretty(from, cfg, 'handle') + separator + expectedPretty(to, cfg, 'handle'), to, cfg, 'handle');
    }
    return decorate(expectedPretty(from, cfg, 'handle'), from, cfg, 'handle')
        + separator
        + decorate(expectedPretty(to, cfg, 'handle'), to, cfg, 'handle');
}

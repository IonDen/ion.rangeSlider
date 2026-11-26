import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { createSlider, plain } from './helpers.mjs';

const PLUGIN = readFileSync(new URL('../../js/ion.rangeSlider.js', import.meta.url), 'utf8');
const JQUERY_1_8_3 = readFileSync(new URL('../vendor/jquery-1.8.3.js', import.meta.url), 'utf8');

// #920: data-values is read through $input.data("values"), and jQuery converts attribute
// text that looks like a number, a boolean or JSON into that type: data-values="10" is the
// number 10, "true" the boolean true, "[1,2]" the array [1,2], "0" and "false" falsy values.
// The constructor called .split(",") on the result, so every one of those threw
// "split is not a function" (or, for "0" / "false" / "null", a later "slice" error in
// validate()) while the slider was built and no slider appeared. The value is now turned
// back into text before the split: a number or a boolean prints as the attribute text it
// came from. A JSON array is used element by element, each element one entry as text, so an entry can
// hold a comma ('["1,000","2,000"]' is the two entries "1,000" and "2,000"); an empty array
// reads as not set. null, a JSON object and anything else that is not text, a number, a
// boolean or an array read as not set, so a `values` option passed in JavaScript still
// applies. A string that was already text (a comma list, "20.0", "1e3") is untouched.
//
// Run on the default jQuery (3.7.1) and on the vendored 1.8.3: the conversion is jQuery's
// own, so each build is checked rather than assumed.

/** Same as createSlider(), on the vendored jQuery 1.8.3 instead of the npm build. */
function createSlider183(t, html, options, setup) {
  const dom = new JSDOM(`<!doctype html><html><body>${html}</body></html>`, {
    runScripts: 'outside-only',
    pretendToBeVisual: true,
  });
  const { window } = dom;
  window.eval(JQUERY_1_8_3);
  const $ = window.jQuery;
  window.eval(PLUGIN);
  const $input = $('input').first();
  let slider;
  t.after(() => { if (slider && slider.input) slider.destroy(); window.close(); });
  if (setup) setup(window, $);
  $input.ionRangeSlider(options);
  slider = $.data($input[0], 'ionRangeSlider');
  return { window, $, $input, slider };
}

const BUILDS = [
  { label: 'jQuery 3.7.1', create: createSlider },
  { label: 'jQuery 1.8.3', create: createSlider183 },
];

for (const { label, create } of BUILDS) {
  // The row table: attribute text -> the list the slider holds (values_raw off: validate()
  // turns a number-like entry into its number) and the entry result.from_value reports.
  // Mutation: constructor -> the number and boolean conversion dropped (`vals = String(vals);`
  // becomes `vals = vals;`): the "10", "-5" and "true" rows throw "split is not a function"
  // and the "0" and "false" rows throw "slice is not a function" in validate().
  // Mutation: the array branch removed (`if (data_kind === "[object Array]") {` becomes
  // `if (false) {`): the JSON array rows go red, the number and boolean rows stay green.
  const ROWS = [
    { attr: '10', list: [10], first: 10 },
    { attr: '-5', list: [-5], first: -5 },
    { attr: '0', list: [0], first: 0 },
    { attr: 'true', list: ['true'], first: 'true' },
    { attr: 'false', list: ['false'], first: 'false' },
    { attr: '[1,2]', list: [1, 2], first: 1 },
    { attr: '["a","b"]', list: ['a', 'b'], first: 'a', quote: "'" },
    // An element with a comma is one entry. Mutation: `items.push(String(vals[j]));` becomes
    // `items.push.apply(items, String(vals[j]).split(","));`: four entries, 1, 0, 2, 0.
    { attr: '["1,000","2,000"]', list: ['1,000', '2,000'], first: '1,000', quote: "'" },
    // One-element arrays. Mutation: `config_from_data.values = items.length ? items : undefined;`
    // becomes `config_from_data.values = items.length > 1 ? items : undefined;`: both rows
    // read as not set and the slider is a number slider. (With values_raw off the entry "5"
    // becomes the number 5 in validate().)
    { attr: '["only"]', list: ['only'], first: 'only', quote: "'" },
    { attr: '[5]', list: [5], first: 5 },
  ];
  for (const { attr, list, first, quote } of ROWS) {
    test(`data-values="${attr}" builds a slider holding ${JSON.stringify(list)}, ${label} (#920)`, (t) => {
      const q = quote || '"';
      const { slider } = create(t, `<input data-values=${q}${attr}${q}>`, {});
      assert.deepEqual(plain(slider.options.values), list);
      assert.equal(slider.options.max, list.length - 1, 'values mode: max is the last index');

      slider.update({ from: 0 });
      assert.equal(slider.result.from_value, first);
      assert.equal(typeof slider.result.from_value, typeof first);
    });
  }

  // A JSON array of elements without a comma gives what the comma form gives: [1,2,3] and
  // "1,2,3" build the same slider (#920).
  // Mutation: each element pushed as a fixed text (`items.push(String(vals[j]))` becomes
  // `items.push("x")`), and the list is three entries "x" instead of 1, 2 and 3.
  test(`a JSON array in data-values gives the same list as the comma form, ${label} (#920)`, (t) => {
    const json = create(t, '<input data-values="[1,2,3]">', {});
    const comma = create(t, '<input data-values="1,2,3">', {});
    assert.deepEqual(plain(json.slider.options.values), plain(comma.slider.options.values));
    assert.deepEqual(plain(json.slider.options.values), [1, 2, 3]);
  });

  // Characterization (green before and after the fix): a text value that already worked is
  // byte-identical. Mutation: split on ", " instead of "," (`.split(", ")`), and the
  // two-entry comma rows go red.
  test(`a comma list and a spaced list are unchanged, with and without values_raw, ${label} (#920)`, (t) => {
    const two = create(t, '<input data-values="10,20">', {});
    assert.deepEqual(plain(two.slider.options.values), [10, 20]);

    const spaced = create(t, '<input data-values="a, b, c">', {});
    assert.deepEqual(plain(spaced.slider.options.values), ['a', ' b', ' c']);

    const spaced_raw = create(t, '<input data-values="a, b, c" data-values-raw="true">', {});
    assert.deepEqual(plain(spaced_raw.slider.options.values), ['a', 'b', 'c']);

    const numbers_raw = create(t, '<input data-values="10, 20.0, 30" data-values-raw="true">', {});
    assert.deepEqual(plain(numbers_raw.slider.options.values), ['10', '20.0', '30']);
  });

  // "20.0" is left a string by jQuery (20 prints back as "20"), so it never reaches the
  // new conversion and values_raw keeps it as written. data-values="10" is a number to
  // jQuery, and String(10) is "10" again, so values_raw keeps that entry as the text too.
  // Mutation: convert through a number (`vals = String(+vals);` instead of
  // `vals = String(vals);`): the "10", "-5" and "0" rows stay green but true becomes "1",
  // so the "true" row goes red. Mutation: drop the conversion and the "10" row throws.
  test(`values_raw keeps a single entry exactly as the attribute text, ${label} (#920)`, (t) => {
    const rows = [
      ['20.0', '20.0'],
      ['10', '10'],
      ['-5', '-5'],
      ['true', 'true'],
      ['0', '0'],
    ];
    for (const [attr, entry] of rows) {
      const { slider } = create(t, `<input data-values="${attr}" data-values-raw="true">`, {});
      assert.deepEqual(plain(slider.options.values), [entry], `data-values="${attr}"`);

      slider.update({ from: 0 });
      assert.strictEqual(slider.result.from_value, entry, `data-values="${attr}" from_value`);
    }
  });

  // The input's value attribute names an entry of the list (#880 lookup). The lookup reads
  // the list the conversion produced, so a JSON-read list is searched like a comma list.
  // 6 is entry 1; without the lookup the number 6 would be clamped to the last index 2.
  // Mutation: the array branch removed (`if (data_kind === "[object Array]") {` becomes
  // `if (false) {`), and the list is not set so the input value finds no entry.
  // Mutation: have the lookup read the JS options.values only (`entries = options.values`
  // for the data branch), and from lands on 2 instead of 1.
  test(`an input value naming an entry of a JSON-read list selects that entry, ${label} (#920)`, (t) => {
    const { slider } = create(t, '<input value="6" data-values="[5,6,7]">', {});
    assert.equal(slider.options.from, 1);

    slider.update({ from: 1 });
    assert.equal(slider.result.from_value, 6);
  });

  // A one-entry list is values mode over a single entry: min = max = 0 (a zero value range,
  // whose interactions are #896's business and are not changed here). The slider builds,
  // keeps that entry as the entry, and its callback payload reports it.
  // Mutation: the number and boolean conversion dropped (`vals = String(vals);` becomes
  // `vals = vals;`), and the slider is not built at all.
  test(`a one-entry list builds a values slider on that entry with min and max 0, ${label} (#920)`, (t) => {
    const { slider } = create(t, '<input data-values="10">', {});
    assert.equal(slider.options.min, 0);
    assert.equal(slider.options.max, 0);
    assert.equal(slider.options.from, 0);

    slider.update({ from: 0 });
    assert.equal(slider.result.from_value, 10);
    assert.equal(slider.result.from_pretty, '10');
  });

  // jQuery reads data-values="null" as null, and the constructor used to copy that null into
  // the options, where validate() threw "Cannot read properties of null (reading 'slice')".
  // null is now "not set", like an empty data-values: no values list, a plain number slider.
  // Mutation: the not-text branch converts everything (`if (data_kind === "[object Number]" ||
  // data_kind === "[object Boolean]") {` becomes `if (data_kind !== "[object String]") {`):
  // null reads as the one entry "null".
  test(`data-values="null" is read as not set and builds a plain number slider, ${label} (#920)`, (t) => {
    const { slider } = create(t, '<input data-values="null">', {});
    assert.deepEqual(plain(slider.options.values), []);
    assert.equal(slider.options.min, 10, 'no values mode: min stays the number default');
    assert.equal(slider.options.max, 100, 'no values mode: max stays the number default');
  });

  // The same null from a script: .data("values", null) before the build.
  // Mutation: same as above.
  test(`a null stored with .data("values", null) before the build is read as not set, ${label} (#920)`, (t) => {
    const { slider } = create(t, '<input>', {}, (window, $) => { $('input').data('values', null); });
    assert.deepEqual(plain(slider.options.values), []);
    assert.equal(slider.options.max, 100);
  });

  // data-values="[]" is an empty JSON array. This row only shows that the build does not
  // throw and ends as a number slider: an empty values list also gives a number slider, so
  // it stays green when the empty array is kept as a value. The power is in the JS-option
  // row further down (`data-values="[]" does not override a JS values option`).
  test(`data-values="[]" is read as not set, ${label} (#920)`, (t) => {
    const { slider } = create(t, '<input data-values="[]">', {});
    assert.deepEqual(plain(slider.options.values), []);
    assert.equal(slider.options.max, 100);
  });

  // A JSON object is not a list: it reads as not set, like null, so the slider builds as a
  // plain number slider, and a `values` option passed in JavaScript still applies.
  // Mutation: the not-text branch dropped (`} else if (data_kind !== "[object String]") {`
  // becomes `} else if (false) {`): the object reaches .split and the build throws.
  test(`a JSON object in data-values reads as not set, and a JS values option still applies, ${label} (#920)`, (t) => {
    const plain_slider = create(t, `<input data-values='{"a":1}'>`, {});
    assert.deepEqual(plain(plain_slider.slider.options.values), []);
    assert.equal(plain_slider.slider.options.max, 100);

    const with_js = create(t, `<input data-values='{"a":1}'>`, { values: ['a', 'b'] });
    assert.deepEqual(plain(with_js.slider.options.values), ['a', 'b']);
  });

  // The same for null: data-values="null" next to a JS values option builds on the JS list,
  // because null is not set and does not override it.
  // Mutation: null kept as a value (the not-text branch turned into `String(vals)` for every
  // kind, `if (data_kind !== "[object String]") {`): the list is the one entry "null".
  test(`data-values="null" does not override a JS values option, ${label} (#920)`, (t) => {
    const { slider } = create(t, '<input data-values="null">', { values: ['a', 'b'] });
    assert.deepEqual(plain(slider.options.values), ['a', 'b']);
  });

  // An empty JSON array is also not set, and a JS values option applies.
  // Mutation: the empty-array check dropped (`items.length ? items : undefined` becomes
  // `items`): the empty list overrides the JS values option and the slider holds no entries.
  test(`data-values="[]" does not override a JS values option, ${label} (#920)`, (t) => {
    const { slider } = create(t, '<input data-values="[]">', { values: ['a', 'b'] });
    assert.deepEqual(plain(slider.options.values), ['a', 'b']);
  });

  // Characterization (green before and after the fix): no data-values attribute at all
  // gives a plain number slider with the number defaults.
  // Mutation: convert every non-text value, undefined included (`if (data_kind ===
  // "[object Number]" || data_kind === "[object Boolean]") {` becomes `if (data_kind !==
  // "[object String]") {`): undefined reads as the one entry "undefined" and this slider
  // turns into a values slider.
  test(`a plain input with no data-values stays a number slider, ${label} (#920)`, (t) => {
    const { slider } = create(t, '<input>', {});
    assert.deepEqual(plain(slider.options.values), []);
    assert.equal(slider.options.min, 10);
    assert.equal(slider.options.max, 100);
  });

  // A JSON array is used element by element, so an element may hold a comma: the two entries are
  // "1,000" and "2,000", not four. The same through .data("values", [...]) before the build.
  // Mutation: `items.push(String(vals[j]));` becomes
  // `items.push.apply(items, String(vals[j]).split(","));`: four entries, in both places.
  test(`a JSON array element with a comma stays one entry, from the attribute and from .data(), ${label} (#920)`, (t) => {
    const attr = create(t, `<input data-values='["1,000","2,000"]'>`, {});
    assert.deepEqual(plain(attr.slider.options.values), ['1,000', '2,000']);

    const stored = create(t, '<input>', {}, (window, $) => { $('input').data('values', ['1,000', '2,000']); });
    assert.deepEqual(plain(stored.slider.options.values), ['1,000', '2,000']);
  });

  // Entries from a JSON array are text, and values_raw does not trim them: only entries
  // that came from the comma split are trimmed. With values_raw off the number-like entries
  // become numbers and an entry keeps its spaces too.
  // Mutation: `items.push(String(vals[j]));` becomes `items.push(vals[j]);`: the numbers 1000
  // and 2000 stay numbers, so the first two assertions go red. Mutation: the trim gate
  // loses the array check (`if (config_from_data.values && config.values_raw &&
  // !values_from_array) {` becomes `if (config_from_data.values && config.values_raw) {`):
  // " a " and "b " are trimmed to "a" and "b".
  test(`values_raw does not trim JSON array entries, ${label} (#920)`, (t) => {
    const numbers = create(t, `<input data-values='[1000,2000]' data-values-raw="true">`, {});
    assert.deepEqual(plain(numbers.slider.options.values), ['1000', '2000']);

    const small = create(t, `<input data-values='[1,2]' data-values-raw="true">`, {});
    assert.deepEqual(plain(small.slider.options.values), ['1', '2']);

    const spaced = create(t, `<input data-values='[" a ","b "]' data-values-raw="true">`, {});
    assert.deepEqual(plain(spaced.slider.options.values), [' a ', 'b ']);

    const spaced_off = create(t, `<input data-values='[" a ","b "]'>`, {});
    assert.deepEqual(plain(spaced_off.slider.options.values), [' a ', 'b ']);
  });

  // Entries from the comma split are still trimmed with values_raw on (the #505 rule).
  // Mutation: the trim gate dropped (`if (config_from_data.values && config.values_raw &&
  // !values_from_array) {` becomes `if (false) {`): the entries keep their spaces.
  test(`values_raw still trims the entries of a comma list, ${label} (#920)`, (t) => {
    const { slider } = create(t, '<input data-values=" a , b " data-values-raw="true">', {});
    assert.deepEqual(plain(slider.options.values), ['a', 'b']);
  });

  // Backs the readme's values_raw note: jQuery parses a JSON array before the plugin runs, so
  // a number element has already lost its text. [20.0] arrives as the number 20 and reads as
  // "20" even with values_raw on, while the quoted element reads "20.0". Red before the fix
  // (an array threw). Mutation: the array branch removed (`if (false) {`): the list is empty.
  // Mutation: `items.push(String(vals[j]));` becomes `items.push(vals[j]);`: the number half
  // holds the number 20 instead of "20".
  test(`a number element of a JSON array reads as its number, a quoted one keeps its text, with values_raw on, ${label} (#920)`, (t) => {
    const number = create(t, `<input data-values='[20.0]' data-values-raw="true">`, {});
    assert.deepEqual(plain(number.slider.options.values), ['20']);

    const quoted = create(t, `<input data-values='["20.0"]' data-values-raw="true">`, {});
    assert.deepEqual(plain(quoted.slider.options.values), ['20.0']);
  });

  // The input value names an entry of the list the slider will hold, here with values_raw
  // on. An entry from a JSON array is compared untrimmed, so the input value "b " (with
  // its space) names the entry "b "; an entry from the comma split is compared trimmed, so
  // the input value "b" names " b".
  // Mutation: the lookup trims array entries too (`trim_entries = raw_values && !values_from_array;`
  // becomes `trim_entries = raw_values;`): "b " is compared as "b", finds nothing, and the
  // slider starts on the first entry. Mutation: the comma list is not trimmed
  // (`trim_entries = raw_values && !values_from_array;` becomes `trim_entries = false;`):
  // "b" finds nothing in " b" and the comma row starts on the first entry.
  test(`the input value names a JSON array entry untrimmed and a comma entry trimmed, with values_raw on, ${label} (#920)`, (t) => {
    const array = create(t, `<input value="b " data-values='["a","b ","c"]' data-values-raw="true">`, {});
    assert.equal(array.slider.options.from, 1);

    const comma = create(t, '<input value="b" data-values="a, b, c" data-values-raw="true">', {});
    assert.equal(comma.slider.options.from, 1);
  });

  // The page's own array is left alone: the slider builds its list from a fresh array, so
  // an array stored with .data("values", ...) keeps its elements and their types.
  // Mutation: the page's array used as the list (`items.push(String(vals[j]));` becomes
  // `vals[j] = String(vals[j]);` and a line `items = vals;` follows the loop): the stored
  // number 1 becomes "1".
  test(`an array stored with .data("values") is not changed by the build, ${label} (#920)`, (t) => {
    const { $input } = create(t, '<input data-values-raw="true">', {}, (window, $) => {
      $('input').data('values', [1, ' b ']);
    });
    assert.deepEqual(plain($input.data('values')), [1, ' b ']);
  });

  // A value a script stored with .data() before the slider was built is read through the
  // same call, so a text still works as it did and a non-text value is converted too.
  // Mutation: read the attribute directly instead of .data() (`$inp.attr("data-values")`),
  // and the stored "a,b" row goes red (the attribute is absent).
  test(`a value stored with .data("values") before the slider was built is read as before, ${label} (#920)`, (t) => {
    const text = create(t, '<input>', {}, (window, $) => { $('input').data('values', 'a,b'); });
    assert.deepEqual(plain(text.slider.options.values), ['a', 'b']);

    const number = create(t, '<input>', {}, (window, $) => { $('input').data('values', 10); });
    assert.deepEqual(plain(number.slider.options.values), [10]);
  });
}

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSlider } from './helpers.mjs';

// #880 and the data-values case: in values mode the input's value attribute names the
// entry the slider starts on (readme settings table, input_values_separator:
// `<input value="25;42">`; the constructor looks each half up in the values). The lookup
// converted a number-like half to a number before searching, so "20" was never found
// among the strings ['10', '20', '30'] (#880), and it searched only the JavaScript
// `values`, so with the entries in `data-values` it found nothing at all (the data-values
// case, not filed yet). In both cases the handle fell back to the first entry.
//
// jsdom has no layout (see helpers.mjs): the start is read from result.from/to, which
// the constructor fills from the validated options, and from_value/to_value only after
// update({}), which runs updateResult() without moving anything.

/** The pair the slider starts on, plus the entries it names. */
function started(slider) {
    const at = { from: slider.result.from, to: slider.result.to };
    slider.update({});
    return { ...at, from_value: slider.result.from_value, to_value: slider.result.to_value };
}

// ------------------------------------------------------------------- #880

// RED before the fix: from 0, the first entry.
// Mutation: the lookup removed (findValueIndex() returns -1 at once) -- the half is
// converted to the number 20, which ['10', '20', '30'] does not hold.
test('#880: an input value names a number-like string entry', (t) => {
    const { slider } = createSlider(t, '<input value="20">', { values: ['10', '20', '30'] });
    const start = started(slider);
    assert.equal(start.from, 1);
    // values_raw is off, so validate() holds the entry as the number 20 (readme note "values").
    assert.equal(start.from_value, 20);
});

// RED before the fix: from 0. values_raw keeps the entries as strings, which is exactly
// what the old numeric lookup could never find.
// Mutation: same as above.
test('#880: an input value names a number-like string entry with values_raw on', (t) => {
    const { slider } = createSlider(t, '<input value="20">', { values: ['10', '20', '30'], values_raw: true });
    const start = started(slider);
    assert.equal(start.from, 1);
    assert.equal(start.from_value, '20');
});

// Characterization: green before the fix too. A number array is found both by the text
// comparison ("20" is the text of 20) and by the numeric lookup that follows it, so
// breaking either one alone keeps this green.
// Mutation: `js_values` computed false in the constructor (the JS values array no longer
// consulted by either lookup) -- "20" is read as the index 20 and clamped to the last entry.
test('an input value names an entry of a number array, as before', (t) => {
    const { slider } = createSlider(t, '<input value="20">', { values: [10, 20, 30] });
    assert.equal(started(slider).from, 1);
});

// RED before the fix: from 0. The old lookup read "0" as the number 0 and its
// `val[0] && ...` guard then took that 0 for the index, so the entry 0 was never found
// unless it was the first one -- the same gap as #880, on a number array.
// With values_raw off the number-form pass finds 0 as well, so the values_raw: true half
// (text pass only) is the one that carries the mutation.
// Mutation: `String()` dropped from findValueIndex() (`entry = entries[i]`) -- the number
// 0 no longer equals the text "0", and with values_raw on the old lookup's short-circuit
// starts on -10.
test('#880: an input value of "0" names the entry 0 wherever it sits in a number array', (t) => {
    const { slider } = createSlider(t, '<input value="0">', { values: [-10, -5, 0, 5, 10] });
    const start = started(slider);
    assert.equal(start.from, 2);
    assert.equal(start.from_value, 0);

    const raw = createSlider(t, '<input value="0">', { values: [-10, -5, 0, 5, 10], values_raw: true }).slider;
    assert.equal(raw.result.from, 2);
});

// Characterization: green before the fix too, found by the text comparison and by the
// string lookup that follows it.
// Mutation: `js_values` computed false -- "c" becomes NaN and the handle falls back to 0.
test('an input value names an entry of a letter array, as before', (t) => {
    const { slider } = createSlider(t, '<input value="c">', { values: ['a', 'b', 'c', 'd'] });
    const start = started(slider);
    assert.equal(start.from, 2);
    assert.equal(start.from_value, 'c');
});

// --------------------------------------------------------- the data-values case

// RED before the fix: from 0 (single) and 0/3 (double) -- the text became NaN.
// Mutation: the data-values branch removed from the constructor's lookup (no entries to
// search without a JS values array).
test('the data-values case: an input value names an entry of data-values', (t) => {
    const { slider } = createSlider(t, '<input value="c" data-values="a,b,c,d">', {});
    const start = started(slider);
    assert.equal(start.from, 2);
    assert.equal(start.from_value, 'c');
});

// Mutation: the to half not looked up (`to_index = -1`) -- to falls back to the last entry.
test('the data-values case: both halves of a double input value name their entries', (t) => {
    const { slider } = createSlider(t, '<input value="b;c" data-values="a,b,c,d" data-type="double">', {});
    const start = started(slider);
    assert.deepEqual([start.from, start.to], [1, 2]);
    assert.deepEqual([start.from_value, start.to_value], ['b', 'c']);
});

// RED before the fix: from 2 -- the number 20 was taken as an index and clamped to the
// last entry, "30".
// Mutation: the data-values branch removed.
test('the data-values case: an input value names a number-like data-values entry', (t) => {
    const { slider } = createSlider(t, '<input value="20" data-values="10,20,30">', {});
    const start = started(slider);
    assert.equal(start.from, 1);
    assert.equal(start.from_value, 20);
});

// readme note "values_raw": "Spaces around the commas in data-values are trimmed while it
// is on." The lookup compares with the trimmed entry the slider will hold.
// RED before the fix: from 0.
// Mutation: the trim dropped from findValueIndex() -- " b" is not "b".
test('the data-values case: with data-values-raw on, the input value names the trimmed entry', (t) => {
    const { slider } = createSlider(t, '<input value="b" data-values="a, b, c" data-values-raw="true">', {});
    const start = started(slider);
    assert.equal(start.from, 1);
    assert.equal(start.from_value, 'b');
});

// values_raw resolves in the usual order: a JS values_raw: true applies to data-values
// when no data-values-raw attribute says otherwise, and the trim then follows it.
// Mutation: values_raw read from data-values-raw alone (`raw_values =
// config_from_data.values_raw`, the `: options.values_raw` half dropped).
test('the data-values case: a JS values_raw option trims the data-values entries for the lookup too', (t) => {
    const { slider } = createSlider(t, '<input value="b" data-values="a, b, c">', { values_raw: true });
    const start = started(slider);
    assert.equal(start.from, 1);
    assert.equal(start.from_value, 'b');
});

// ------------------------------------- values_raw off: the entry as the slider holds it

// With values_raw off, validate() holds a number-like entry as a number (readme note
// "values_raw": "20.0" becomes 20), and that number is what the slider writes into the
// input. The input value names such an entry by the number's text too, compared after
// the text as written.

// RED before this change: from 2 -- " 20" is not "20" as text, and the old lookup then
// reads "20" as the index 20, clamped to the last entry.
// Mutation: the number-form comparison removed from findValueIndex() (its `if
// (as_numbers)` made `if (false)`) -- " 20" is found by neither pass.
test('#880: with values_raw off, "20" names a data-values entry written " 20", which the slider holds as 20', (t) => {
    const { slider } = createSlider(t, '<input value="20" data-values="10, 20, 30">', {});
    const start = started(slider);
    assert.equal(start.from, 1);
    assert.equal(start.from_value, 20);
});

// The round trip: a slider moved onto "20.0" writes 20 into the input (the entry as it
// holds it), and a slider built from that markup must start on the same entry. jsdom has
// no layout, so update({from}) moves the handle; it writes the input the way a drag does
// (writeToInput(), values branch).
// RED before this change: the rebuilt slider starts on 0 -- "20" is not "20.0" as text,
// and the old lookup's number 20 is not in an array of strings.
// Mutation: the number-form comparison removed, as above.
test('#880: with values_raw off, the value the slider writes for "20.0" rebuilds it on the same entry', (t) => {
    const values = ['10', '20.0', '30'];
    const first = createSlider(t, '<input>', { values });
    first.slider.update({ from: 1 });
    const written = first.$input.val();
    assert.equal(written, '20');

    const rebuilt = createSlider(t, `<input value="${written}">`, { values }).slider;
    assert.equal(rebuilt.result.from, 1);
});

// Characterization, green before and after this change. With values_raw on the slider
// holds "20.0" exactly as written and writes "20.0" back, so "20" names no entry; the half
// falls back as before (the old lookup's number 20 is not in the array: the first entry).
// Only values_raw off turns "20.0" into 20, so only then may the number form match.
// Mutation: the number-form comparison run whatever values_raw says (`as_numbers` passed
// as true) -- "20" finds "20.0" at index 1.
test('with values_raw on, "20" does not name the entry "20.0": the number form is not compared', (t) => {
    const { slider } = createSlider(t, '<input value="20">', { values: ['10', '20.0', '30'], values_raw: true });
    assert.equal(started(slider).from, 0);
});

// An entry written exactly as the input value wins over one that only holds the same
// number: the text pass runs over every entry before the number form is tried.
// Mutation: the text pass disabled (`if (entry === text)` made `if (false)`) -- the number
// form answers alone and finds "20.0" at index 0.
test('with values_raw off, an entry written exactly as the input value wins over an earlier one holding the same number', (t) => {
    const { slider } = createSlider(t, '<input value="20">', { values: ['20.0', '20', '30'] });
    assert.equal(started(slider).from, 1);
});

// --------------------------------------------------------- names no entry

// Characterization of the fallback, read on master before the fix: a half whose text
// names no entry starts where it always did. With JS values the old lookup still runs:
// it finds a number entry by value ("20.0" is 20) and otherwise returns -1, which
// validate() clamps to the first entry (and in double type drags from down with it).
// With data-values the half is read as a number, so text falls back to the first and
// last entry and a number such as "2" is taken as an index.
// Mutations: the override made unconditional (`config.from = from_index` without the -1
// check) -- the data-values halves become -1 and clamp to the first entry; and the old
// lookup's `config.from = val[0] && options.values.indexOf(val[0])` made `config.from =
// null` -- "20.0" is no longer found and starts on 10.
test('an input value that names no entry starts where it did before', (t) => {
    const js = createSlider(t, '<input value="x">', { values: ['a', 'b', 'c', 'd'] }).slider;
    assert.equal(js.result.from, 0);

    const jsNumber = createSlider(t, '<input value="20.0">', { values: [10, 20, 30] }).slider;
    assert.equal(jsNumber.result.from, 1);

    const jsDouble = createSlider(t, '<input value="x;y">', { type: 'double', values: ['a', 'b', 'c', 'd'] }).slider;
    assert.deepEqual([jsDouble.result.from, jsDouble.result.to], [0, 0]);

    const data = createSlider(t, '<input value="x" data-values="a,b,c,d">', {}).slider;
    assert.equal(data.result.from, 0);

    const dataDouble = createSlider(t, '<input value="x;y" data-values="a,b,c,d" data-type="double">', {}).slider;
    assert.deepEqual([dataDouble.result.from, dataDouble.result.to], [0, 3]);

    const dataIndex = createSlider(t, '<input value="2" data-values="a,b,c,d">', {}).slider;
    assert.equal(dataIndex.result.from, 2);
});

// Characterization: a slider without values keeps reading the input value as numbers.
// Mutation: the override made unconditional, as above -- with no entries to search both
// halves come back -1 and clamp to min.
test('a numeric slider still reads the input value as numbers', (t) => {
    const { slider } = createSlider(t, '<input value="25;42">', { type: 'double', min: 0, max: 100 });
    assert.deepEqual([slider.result.from, slider.result.to], [25, 42]);
});

// --------------------------------------------------------- precedence

// readme settings table: the input value, then the JavaScript options, then the data-*
// attributes, each overriding the one before. The lookup now finds "c" (index 2) on both
// routes, and a from given either way must still win over it.
// Mutation: `$.extend(config, options)` removed from the constructor -- the JS from: 1 is
// never applied and the slider starts on "c".
test('a JS from overrides the entry the input value names', (t) => {
    const js = createSlider(t, '<input value="c">', { values: ['a', 'b', 'c', 'd'], from: 1 }).slider;
    assert.equal(js.result.from, 1);

    const data = createSlider(t, '<input value="c" data-values="a,b,c,d">', { from: 1 }).slider;
    assert.equal(data.result.from, 1);
});

// Mutation: `$.extend(config, config_from_data)` removed from the constructor -- the
// data-from is never applied and the slider starts on "c".
test('a data-from overrides the entry the input value names', (t) => {
    const js = createSlider(t, '<input value="c" data-from="0">', { values: ['a', 'b', 'c', 'd'] }).slider;
    assert.equal(js.result.from, 0);

    const data = createSlider(t, '<input value="c" data-values="a,b,c,d" data-from="0">', {}).slider;
    assert.equal(data.result.from, 0);
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSlider, plain } from './helpers.mjs';

test('prettify groups thousands with the separator', (t) => {
  assert.equal(createSlider(t, '<input>', { min: 0, max: 10000000 }).slider.prettify(10000000), '10 000 000');
  assert.equal(createSlider(t, '<input>', { min: 0, max: 10000, prettify_separator: ',' }).slider.prettify(1234567), '1,234,567');
});

test('a custom prettify function replaces the default', (t) => {
  const { slider } = createSlider(t, '<input>', { min: 0, max: 100, prettify: (n) => `<${n}>` });
  assert.equal(slider._prettify(42), '<42>');
});

test('a prettify option given as a global function name resolves it (#535)', (t) => {
  const { slider } = createSlider(t, '<input>', { min: 0, max: 100, prettify: 'my_prettify' }, (window) => {
    window.my_prettify = function (n) { return '#' + n; };
  });
  assert.equal(slider._prettify(42), '#42');
});

test('data-prettify resolves a global function by name -- the motivating vue-form-generator path (#535)', (t) => {
  const { slider } = createSlider(t, '<input data-prettify="my_prettify">', { min: 0, max: 100 }, (window) => {
    window.my_prettify = function (n) { return '~' + n; };
  });
  assert.equal(slider._prettify(7), '~7');
});

test('an unresolvable prettify name falls back to default formatting, no throw (#535)', (t) => {
  const { slider } = createSlider(t, '<input>', { min: 0, max: 10000000, prettify: 'does_not_exist_fn' });
  assert.equal(slider._prettify(10000000), '10 000 000');
});

test('update({ prettify: "name" }) resolves a global function named after init (#535)', (t) => {
  const { slider } = createSlider(t, '<input>', { min: 0, max: 100 }, (window) => {
    window.late_prettify = function (n) { return '*' + n + '*'; };
  });
  assert.equal(slider._prettify(5), '5');           // default formatting before update
  slider.update({ prettify: 'late_prettify' });
  assert.equal(slider._prettify(5), '*5*');
});

test('prettify: "eval" is refused even in values mode with prettify_all_values -- no code execution (#535 security)', (t) => {
  const payload = 'window.__pwned = true';
  const { window, slider } = createSlider(t, '<input>', {
    values: ['a', payload, 'c'],
    prettify: 'eval',
    prettify_all_values: true,
  });
  assert.equal(window.__pwned, undefined);                 // the payload string was never executed
  assert.equal(slider.options.p_values[1], payload);        // fell back to default formatting: no digits to group, string passes through unchanged
});

test('the other code-exec globals (Function, setTimeout, setInterval, execScript) are refused the same way (#535 security)', (t) => {
  ['Function', 'setTimeout', 'setInterval', 'execScript'].forEach((name) => {
    const { slider } = createSlider(t, '<input>', { min: 0, max: 10000000, prettify: name });
    assert.equal(slider._prettify(10000000), '10 000 000');   // default formatting, not window[name] bound as prettify
  });
});

test('values mode threads a string-resolved prettify into p_values -- resolution runs before the values loop (#535)', (t) => {
  const { slider } = createSlider(t, '<input>', { values: [10, 20, 30], prettify: 'my_values_prettify' }, (window) => {
    window.my_values_prettify = function (n) { return '#' + n; };
  });
  assert.deepEqual(plain(slider.options.p_values), ['#10', '#20', '#30']);
});

test('an empty string prettify is treated as unset -- default formatting, no throw (#535)', (t) => {
  const { slider } = createSlider(t, '<input>', { min: 0, max: 10000000, prettify: '' });
  assert.equal(slider._prettify(10000000), '10 000 000');
});

test('decorate adds prefix, postfix and max_postfix only on the max value', (t) => {
  const { slider } = createSlider(t, '<input>', { min: 0, max: 100, prefix: '$', postfix: 'k', max_postfix: '+' });
  assert.equal(slider.decorate('50', 50), '$50k');
  assert.equal(slider.decorate('100', 100), '$100+ k');
});

test('prettify_grid and prettify_min_max fall back to prettify when unset, and use their own function when set (#306)', (t) => {
  const { slider: shared } = createSlider(t, '<input>', { min: 0, max: 10000000, prettify: (n) => `P:${n}` });
  assert.equal(shared._prettifyGrid(1000), 'P:1000');      // no prettify_grid -> falls back to prettify
  assert.equal(shared._prettifyMinMax(1000), 'P:1000');    // no prettify_min_max -> falls back to prettify

  const { slider: perSurface } = createSlider(t, '<input>', {
    min: 0, max: 10000000,
    prettify: (n) => `P:${n}`,
    prettify_grid: (n) => `G:${n}`,
    prettify_min_max: (n) => `M:${n}`,
  });
  assert.equal(perSurface._prettifyGrid(1000), 'G:1000');
  assert.equal(perSurface._prettifyMinMax(1000), 'M:1000');
  assert.equal(perSurface._prettify(1000), 'P:1000');      // handle labels still use the shared prettify, untouched
});

test('prettify_enabled: false disables prettify_grid and prettify_min_max exactly like prettify (#306)', (t) => {
  const { slider } = createSlider(t, '<input>', {
    min: 0, max: 10000000,
    prettify_enabled: false,
    prettify_grid: (n) => `G:${n}`,
    prettify_min_max: (n) => `M:${n}`,
  });
  assert.equal(slider._prettifyGrid(1000), 1000);
  assert.equal(slider._prettifyMinMax(1000), 1000);
});

test('prettify_grid and prettify_min_max given as global function names resolve them (#306)', (t) => {
  const { slider } = createSlider(t, '<input>', {
    min: 0, max: 100,
    prettify_grid: 'my_grid_prettify',
    prettify_min_max: 'my_minmax_prettify',
  }, (window) => {
    window.my_grid_prettify = function (n) { return 'G#' + n; };
    window.my_minmax_prettify = function (n) { return 'M#' + n; };
  });
  assert.equal(slider._prettifyGrid(42), 'G#42');
  assert.equal(slider._prettifyMinMax(42), 'M#42');
});

test('an unresolvable prettify_grid/prettify_min_max name falls back to default formatting, no throw (#306)', (t) => {
  const { slider } = createSlider(t, '<input>', {
    min: 0, max: 10000000,
    prettify_grid: 'does_not_exist_grid_fn',
    prettify_min_max: 'does_not_exist_minmax_fn',
  });
  assert.equal(slider._prettifyGrid(10000000), '10 000 000');
  assert.equal(slider._prettifyMinMax(10000000), '10 000 000');
});

test('the prettify_grid and prettify_min_max denylist refusal mirrors prettify -- eval is never bound (#306 security)', (t) => {
  const { slider } = createSlider(t, '<input>', {
    min: 0, max: 10000000,
    prettify_grid: 'eval',
    prettify_min_max: 'eval',
  });
  assert.equal(slider._prettifyGrid(10000000), '10 000 000');   // default formatting, not window.eval bound as prettify_grid
  assert.equal(slider._prettifyMinMax(10000000), '10 000 000'); // default formatting, not window.eval bound as prettify_min_max
});

test('data-prettify-grid and data-prettify-min-max resolve global functions set as HTML attributes (#306)', (t) => {
  const { slider } = createSlider(t, '<input data-prettify-grid="my_grid_fn" data-prettify-min-max="my_minmax_fn">', { min: 0, max: 100 }, (window) => {
    window.my_grid_fn = function (n) { return 'g~' + n; };
    window.my_minmax_fn = function (n) { return 'm~' + n; };
  });
  assert.equal(slider._prettifyGrid(7), 'g~7');
  assert.equal(slider._prettifyMinMax(7), 'm~7');
});

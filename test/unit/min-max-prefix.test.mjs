import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSlider } from './helpers.mjs';

// #679: min_prefix/max_prefix add literal text in front of the min/max bubble
// value, the same way max_postfix already appends literal text after it.
// decorate(num, original) is the single call site that both statics
// (setMinMax(), called unconditionally from init()) and the live from/to/
// single labels route through, so the unit tests exercise decorate()
// directly (pure, no layout needed) and setMinMax()'s rendered output
// (jsdom runs setMinMax() during init() even with zero-width layout).
//
// Design (post fan-out review on PR #832): min_prefix/max_prefix sit
// OUTERMOST, applied before the global prefix, with no injected space
// ("from $0", not "from $ 0" or "$ from 0") -- callers control spacing
// with their own trailing space, exactly like prefix/postfix already do.
// The two are mutually exclusive per call (else-if), so a degenerate
// min === max (or a single-entry values array, where validate() rewrites
// min = max = 0) resolves deterministically to min_prefix, never both.

test('unset min_prefix/max_prefix leave decorate() byte-identical to 2.3.2 (#679)', (t) => {
  const { slider } = createSlider(t, '<input>', { min: 0, max: 100, prefix: '$', postfix: 'k', max_postfix: '+' });
  assert.equal(slider.decorate('0', 0), '$0k');
  assert.equal(slider.decorate('50', 50), '$50k');
  assert.equal(slider.decorate('100', 100), '$100+ k');
});

test('unset min_prefix/max_prefix render the same min/max label text as 2.3.2 (#679)', (t) => {
  const { slider } = createSlider(t, '<input>', { min: 0, max: 100 });
  assert.equal(slider.$cache.min.html(), '0');
  assert.equal(slider.$cache.max.html(), '100');
});

test('decorate() adds min_prefix only when original is the min, max_prefix only when original is the max (#679)', (t) => {
  const { slider } = createSlider(t, '<input>', { min: 0, max: 100, min_prefix: 'from ', max_prefix: 'up to ' });
  assert.equal(slider.decorate('0', 0), 'from 0');
  assert.equal(slider.decorate('100', 100), 'up to 100');
  assert.equal(slider.decorate('50', 50), '50');
});

test('min_prefix/max_prefix sit outside the global prefix, with no injected space (#679)', (t) => {
  const { slider } = createSlider(t, '<input>', { min: 0, max: 100, prefix: '$', min_prefix: 'from ', max_prefix: 'up to ' });
  assert.equal(slider.decorate('0', 0), 'from $0');
  assert.equal(slider.decorate('100', 100), 'up to $100');
  assert.equal(slider.decorate('50', 50), '$50');
});

test('min_prefix and max_postfix combine independently on the max value (#679)', (t) => {
  const { slider } = createSlider(t, '<input>', { min: 0, max: 100, min_prefix: 'from ', max_prefix: 'up to ', postfix: 'k', max_postfix: '+' });
  assert.equal(slider.decorate('0', 0), 'from 0k');
  assert.equal(slider.decorate('100', 100), 'up to 100+ k');
});

test('the rendered min/max labels carry min_prefix/max_prefix (#679)', (t) => {
  const { slider } = createSlider(t, '<input>', { min: 0, max: 100, min_prefix: 'from ', max_prefix: 'up to ' });
  assert.equal(slider.$cache.min.html(), 'from 0');
  assert.equal(slider.$cache.max.html(), 'up to 100');
});

test('min_prefix/max_prefix apply in values mode keyed off the prettified min/max entry (#679)', (t) => {
  const { slider } = createSlider(t, '<input>', { values: ['a', 'b', 'c'], min_prefix: 'from ', max_prefix: 'up to ' });
  assert.equal(slider.$cache.min.html(), 'from a');
  assert.equal(slider.$cache.max.html(), 'up to c');
});

// A degenerate min === max means both the min_prefix and max_prefix
// conditions match the same call; decorate() resolves this with an
// else-if so min_prefix always wins. Catchable mutation: turn the
// `else if (o.max_prefix ...)` back into an independent `if (o.max_prefix
// ...)` -- both branches would then fire and concatenate ("from up to 5"
// instead of "from 5").
test('a degenerate min === max resolves deterministically to min_prefix, not both (#679)', (t) => {
  const { slider } = createSlider(t, '<input>', { min: 5, max: 5, min_prefix: 'from ', max_prefix: 'up to ' });
  assert.equal(slider.$cache.min.html(), 'from 5');
  assert.equal(slider.$cache.max.html(), 'from 5');
});

test('a single-entry values array (validate() rewrites min = max = 0) also resolves to min_prefix (#679)', (t) => {
  const { slider } = createSlider(t, '<input>', { values: ['x'], min_prefix: 'from ', max_prefix: 'up to ' });
  assert.equal(slider.$cache.min.html(), 'from x');
  assert.equal(slider.$cache.max.html(), 'from x');
});

// Characterization test, not a distinct-bug-class regression test: every
// mutation that would break this also breaks the "decorate() adds
// min_prefix only when original is the min..." test above, since both
// exercise the same original === o.min / original === o.max match. It
// exists to document, on the record, the behavior johnwc's comment
// literally asked for -- "add a prefix... when [the slider value is] set
// to min" -- which includes a live from/to handle parked exactly at the
// diapason edge, not just the static min/max labels. This is the same
// scope max_postfix already has (untouched, pre-existing behavior).
test('a from/to label that sits exactly on min or max also picks up min_prefix/max_prefix, per the literal #679 ask (#679)', (t) => {
  const { slider } = createSlider(t, '<input>', {
    type: 'double', min: 0, max: 100, from: 0, to: 100,
    min_prefix: 'from ', max_prefix: 'up to '
  });
  assert.equal(slider.decorate(String(slider.result.from), slider.result.from), 'from 0');
  assert.equal(slider.decorate(String(slider.result.to), slider.result.to), 'up to 100');
});

// decorate_both: false joins from/to into one combined label and decorates
// it as a single unit; drawLabels() always passes result.to as `original`
// for that combined call (js/ion.rangeSlider.js ~line 1573), so a
// min_prefix/max_prefix match is keyed off `to`, and lands at the very
// front of the whole joined string, not just next to the half it names.
// This mirrors max_postfix's identical pre-existing quirk (also keyed off
// a single `original` for the whole combined string) and is kept as-is --
// fixing the position would mean restructuring the frozen combined-label
// contract shared with max_postfix and the global prefix/postfix. Layout
// never runs in jsdom (see helpers.mjs), so drawLabels() itself never
// fires here; decorate() is called directly with the exact arguments
// drawLabels() would use, matching the pattern above.
test('decorate_both: false puts min_prefix/max_prefix at the front of the whole joined label (#679, documented limitation)', (t) => {
  const sep = ' — '; // this.options.values_separator default, " — "

  // "Awkward" case: a normal, non-degenerate double-mode range where `to`
  // sits at max -- easily reached in practice (e.g. a slider left at its
  // full range) -- reads oddly, since max_prefix "up to " visually seems
  // to qualify only the leading number, not the pair.
  const wide = createSlider(t, '<input>', {
    type: 'double', min: 0, max: 100, from: 0, to: 100,
    decorate_both: false, max_prefix: 'up to '
  }).slider;
  assert.equal(wide.decorate('0' + sep + '100', wide.result.to), 'up to 0' + sep + '100');

  // "Fine" case: min_prefix can only match this combined call when `to`
  // itself sits at min, which forces from === to === min (a collapsed
  // double-mode range) -- unlike max_prefix, min_prefix has no
  // non-degenerate trigger through this call site.
  const collapsed = createSlider(t, '<input>', {
    type: 'double', min: 0, max: 100, from: 0, to: 0,
    decorate_both: false, min_prefix: 'from '
  }).slider;
  assert.equal(collapsed.decorate('0' + sep + '0', collapsed.result.to), 'from 0' + sep + '0');
});

test('data-min-prefix/data-max-prefix map to min_prefix/max_prefix and override JS options (#679)', (t) => {
  const { slider } = createSlider(
    t,
    '<input data-min-prefix="From: " data-max-prefix="Up to: ">',
    { min: 0, max: 100, min_prefix: 'x', max_prefix: 'y' }
  );
  assert.equal(slider.options.min_prefix, 'From: ');
  assert.equal(slider.options.max_prefix, 'Up to: ');
  assert.equal(slider.$cache.min.html(), 'From: 0');
  assert.equal(slider.$cache.max.html(), 'Up to: 100');
});

test('update({min_prefix, max_prefix}) re-renders the min/max labels (#679)', (t) => {
  const { slider } = createSlider(t, '<input>', { min: 0, max: 100 });
  assert.equal(slider.$cache.min.html(), '0');
  assert.equal(slider.$cache.max.html(), '100');

  slider.update({ min_prefix: 'from ', max_prefix: 'up to ' });

  assert.equal(slider.options.min_prefix, 'from ');
  assert.equal(slider.options.max_prefix, 'up to ');
  assert.equal(slider.$cache.min.html(), 'from 0');
  assert.equal(slider.$cache.max.html(), 'up to 100');
});

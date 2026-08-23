import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { assertEs3 } from '../../scripts/lib/es3.mjs';

test('rejects ES5+ syntax, object trailing commas and ES3 reserved words', () => {
  assert.throws(() => assertEs3('var a = {b: 1,};', 'x'), /not ES3-safe/);
  assert.throws(() => assertEs3('var f = () => 1;', 'x'), /not ES3-safe/);
  assert.throws(() => assertEs3('var int = 1;', 'x'), /not ES3-safe/);   // reserved in ES3 only: exercises allowReserved
  assert.doesNotThrow(() => assertEs3('var a = {b: 1}; function f() { return a; }', 'x'));
});

test('the shipped source is ES3-safe', () => {
  assertEs3(readFileSync(new URL('../../js/ion.rangeSlider.js', import.meta.url), 'utf8'), 'js/ion.rangeSlider.js');
});

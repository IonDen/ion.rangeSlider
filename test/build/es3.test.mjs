import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { minify } from 'uglify-js';
import { assertEs3 } from '../../scripts/lib/es3.mjs';

test('rejects ES5+ syntax, object trailing commas and ES3 reserved words', () => {
  assert.throws(() => assertEs3('var a = {b: 1,};', 'x'), /not ES3-safe/);
  assert.throws(() => assertEs3('var f = () => 1;', 'x'), /not ES3-safe/);
  assert.throws(() => assertEs3('var int = 1;', 'x'), /not ES3-safe/);   // reserved in ES3 only: exercises allowReserved
  assert.throws(() => assertEs3('var o = {}; o.class = 1;', 'x'), /not ES3-safe/);   // reserved word after a dot
  assert.throws(() => assertEs3('var o = {class: 1};', 'x'), /not ES3-safe/);   // reserved word as an object key
  assert.doesNotThrow(() => assertEs3('var a = {b: 1}; function f() { return a; }', 'x'));
});

test('the shipped source is ES3-safe', () => {
  assertEs3(readFileSync(new URL('../../js/ion.rangeSlider.js', import.meta.url), 'utf8'), 'js/ion.rangeSlider.js');
});

test('uglify-js in ie mode keeps the minified output ES3-safe', () => {
  const source = readFileSync(new URL('../../js/ion.rangeSlider.js', import.meta.url), 'utf8');
  const min = minify(source, { ie: true });
  if (min.error) throw min.error;
  assertEs3(min.code, 'js/ion.rangeSlider.min.js');
});

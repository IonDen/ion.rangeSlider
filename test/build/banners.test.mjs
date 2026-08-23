import { test } from 'node:test';
import assert from 'node:assert/strict';
import { banners } from '../../scripts/lib/banners.mjs';

const pkg = { version: '2.3.1', config: { build: 382, buildDate: '2019-12-19 16:51:02' } };

test('banners reproduce the 2.3.1 formats byte for byte', () => {
  const b = banners(pkg);
  assert.equal(b.css, '/**\nIon.RangeSlider, 2.3.1\n© Denis Ineshin, 2010 - 2019, IonDen.com\nBuild date: 2019-12-19 16:51:02\n*/\n');
  assert.equal(b.cssMin, '/*!Ion.RangeSlider, 2.3.1, © Denis Ineshin, 2010 - 2019, IonDen.com, Build date: 2019-12-19 16:51:02*/');
  assert.equal(b.js, '// Ion.RangeSlider, 2.3.1, © Denis Ineshin, 2010 - 2019, IonDen.com, Build date: 2019-12-19 16:51:02');
  assert.equal(b.sourceHeader, '// version 2.3.1 Build: 382');
  assert.equal(b.sourceCopyright, '// © Denis Ineshin, 2019');
});

test('year follows the build date', () => {
  const b = banners({ version: '2.4.0', config: { build: 400, buildDate: '2027-01-05 10:00:00' } });
  assert.match(b.js, / 2010 - 2027, /);
  assert.equal(b.sourceCopyright, '// © Denis Ineshin, 2027');
});

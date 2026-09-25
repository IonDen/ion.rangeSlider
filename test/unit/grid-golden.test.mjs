import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createSlider, plain } from './helpers.mjs';
import { GOLDEN_CONFIGS, gridSnapshot } from './grid-golden.configs.mjs';

const GOLDEN = JSON.parse(readFileSync(new URL('./fixtures/grid-golden.json', import.meta.url), 'utf8'));

// Mutation this catches: any change to the grid build that moves a big or small tick of a grid that is truthful
// today, or drops or re-texts a label (for example big_p computed as 100 / (big_num + 1)).
for (const c of GOLDEN_CONFIGS) {
  test(`grid is byte-identical to master: ${c.name}`, (t) => {
    const { slider } = createSlider(t, '<input>', c.options);
    assert.deepEqual(plain(gridSnapshot(slider)), GOLDEN[c.name]);
  });
}

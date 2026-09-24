// Label and shadow reading helpers shared by the contract specs. Both go
// through page-observable surfaces only (rendered text, computed style,
// geometry) -- never the instance's internal `.options`/`.result`/`.coords`.

import { expect } from '@playwright/test';
import { readState } from './state.mjs';
import { xForFraction } from './interact.mjs';

/** Exact rendered text of one element, polled so it outlasts the idle render tick. */
export const labelText = (page, selector) => expect.poll(() => page.locator(selector).evaluate((el) => el.textContent));

/** Asserts the shadow of handle `which` spans exactly the two track fractions given. */
export async function expectShadowSpans(page, which, startFraction, endFraction) {
    const state = await readState(page);
    const shadow = state.shadows[which];
    const handleWidth = state.handles[which].box.width;
    expect(shadow.visible).toBe(true);
    expect(Math.abs(shadow.box.x - xForFraction(state.line, handleWidth, startFraction))).toBeLessThanOrEqual(2);
    expect(Math.abs(shadow.box.x + shadow.box.width - xForFraction(state.line, handleWidth, endFraction))).toBeLessThanOrEqual(2);
}

![ion.rangeSlider](_tmp/logo-ion-range-slider.png)

[Support the plugin on GitHub sponsors](https://github.com/sponsors/IonDen)

# Update History

### Version 2.6.0. October 18, 2026
* Grid: a `grid_num` below 1 after rounding (such as 0 or a negative number), or one that is not a number, draws the default 4 units and logs one console warning; a fractional `grid_num` is rounded
* Grid: a value range whose `min` equals `max`, or a `values` array with one entry, draws a single grid tick instead of five ticks on the same value, a lone "NaN" tick (with `grid_snap`) or a lone "undefined" tick
* Grid: a `prettify_grid` that returns `undefined` or `null` falls back to `prettify` and then to the built-in formatting; one that throws no longer stops the slider from being created
* Grid: the first grid label is always visible, and so is the last unless it would overlap the first on a very narrow slider; no two visible grid labels overlap
* Grid: every labelled grid tick names a value the handle can reach and sits where the handle stops on it. `grid_num` is a target, so the grid can use more or fewer units than it names: from 0 to 100 with `step: 10` and the default `grid_num` of 4, the grid shows 0, 20, 40, 60, 80 and 100
* Grid: with `grid_margin` on (the default) every grid label is centred on its tick, a shift of a few pixels at most. Shown grid labels no longer carry an inline `visibility: visible`, so a stylesheet rule that hides `.irs-grid-text` now applies to them
* Grid: with `grid_snap`, a value range such as 0 to 2.7 with `step: 0.3` no longer draws a blank extra tick
* `destroy()` hands the input back as it was: no `from` or `to` left in its data, and its disabled state restored
* A slider with `block` no longer responds to the keyboard; the arrow keys used to move it. On a focused blocked slider the arrow keys now reach the page, as with `keyboard: false`
* The input's value is matched against the text of each `values` entry, so `data-values` lists and number-like entries find the right one. With `data-values="1,2,3,4"` and `value="2"` the slider now starts on the entry 2; it used to start on the entry at index 2, which is 3
* On a slider without `values`, `from_value` and `to_value` are `null` after `update()` too; they used to be `undefined` there
* The max label has one space between `max_postfix` and a `postfix` that starts with a space; it used to have two
* On the single type the callback data has `to_pretty`, `to_percent` and `to_value` from the first callback; until the first `update()` or `reset()`, `to_pretty` used to be missing and `to_percent` was 0
* `min_interval` and `max_interval` now also apply when the slider is created and when `update()` runs: a starting pair that breaks either one is moved to keep it, so such a slider can start on different values than before
* With `prettify_enabled: false` the `*_pretty` callback fields are strings, the same as the labels
* The built-in formatting no longer puts the thousands separator inside the decimals: 1.2345 reads "1.2345", not "1.2 345". Values with three decimals or fewer read as before; with `prettify_all_values`, a decimal number inside a text entry is no longer split either
* On the double type a click on the track moves the nearer handle; just past the middle between the handles it used to move the farther one. A click exactly halfway between the handles moves the to handle
* With `drag_interval` and both handles on one value, a click on the track, the key presses after it and a drag of the bar keep the value label visible; they used to hide every value label
* With `drag_interval` and a fixed handle, a key press after a click on the bar now fires `onFinish` and still moves nothing. Since 2.4.0 that press fired nothing, so code that counts `onFinish` calls sees one more
* When `min` is not a whole number of steps (such as `min: 0.5, step: 1`), each arrow key press moves to the next or previous value a drag can reach; a press used to skip a value or do nothing
* `min_interval` now holds when rounding would leave it short with the other handle on `min` or `max`. With `min: 0.5, max: 10.5, step: 1` and `min_interval: 1`, the from handle stops at 9 while the to handle sits on 10.5; it used to stop at 10. The same holds for a `min_interval` that is not a whole number of steps
* That `min_interval` change leaves sliders with `max_interval`, with `step_from_min` or in values mode, and whole-interval drags, as they were before
* README: a note on jQuery 3.0.x and 3.1.x, which measure the `square` skin's handle too wide, so values picked by mouse or touch land slightly off; jQuery 3.2.1 or newer measures it correctly
* README rewritten for first-time readers, with the contributing and releasing guides and the package description revised; the CDN examples list jsDelivr first
* The browser test suite now covers every option, every interaction and a combination matrix of 128 configurations; on every change it runs against jQuery 1.8.3, 3.7.1 and 4.0.0 slim and the minified build (the matrix on 1.8.3 and 3.7.1), and weekly against 19 jQuery builds
* Issues: #875, #877, #880, #881, #883, #884, #885, #886, #887, #889, #890, #891, #892, #893, #898, #903, #906, #909, #910, #911, #918

### Version 2.5.0. September 09, 2026
* New `step_from_min` option makes every value `min` plus a whole number of steps: with `min: 0.5, step: 1` the values are 0.5, 1.5, 2.5 instead of 0.5, 2, 3, and the grid labels follow the same scale. Off by default. An initial `from`/`to`, the handle limits and `min_interval`/`max_interval` should sit on that scale too; a value off it is moved to the nearest point
* New `values_raw` option keeps `values` entries exactly as given, so "20.0" stays "20.0" in `from_value`/`to_value`, in the input and on the label instead of becoming the number 20. Off by default. Spaces around the commas in `data-values` are ignored when it is on
* `drag_interval`: an interval whose width is not a multiple of `step` keeps that width while the bar is dragged, fires one `onChange` per step instead of two, and no longer ends up a step wider after a release. When the width is off the step grid the upper end now sits off the grid instead of the interval changing size
* The built `js` and `css` files on the master branch are now rebuilt and committed after every merge, so master always carries a current build between releases
* Issues: #505, #867, #869

### Version 2.4.2. September 05, 2026
* A double slider whose handles start at the same value can now be opened in either direction: the first drag or key press after the coincident start decides which handle moves, on mouse, touch and keyboard alike
* `data-prettify-separator=""` now disables the thousands separator instead of being ignored, matching what the JavaScript `prettify_separator: ''` option already did
* Fixed a `step`, `min` or `max` written in exponent notation (such as `1e-8`) rounding every interior drag to 0
* Fixed floating-point noise in the from/to values, handle labels and grid ticks on sliders with a negative fractional `min` and a whole-number `step`
* Fixed the grid repeating a label when two ticks land on the same value; the tick mark stays, only the duplicate number is blanked
* Releasing a drag without further movement, a motionless press, or a click or key press that doesn't change the value no longer fires an extra `onChange`
* Fixed `result.min_pretty`/`max_pretty` staying unset or stale when `hide_min_max` is on
* Pull requests no longer need to carry rebuilt `js`/`css` files; CI builds them from source and checks a PR's built files only if the PR itself touched one
* Issues: #507, #681, #684, #760, #772, #851, #852, #853

### Version 2.4.1. September 02, 2026
* `drag_interval`: dragging the whole interval by its bar fires one `onChange` per step instead of two, and the event no longer reports the interval one step wider than it is. On sliders with a visible handle the first leftward step now fires after one step of mouse travel, where it used to need more. Dragging the bar past the left limit keeps the left edge pinned at `from_min` (or `min`)
* Values mode: the callback data object now has `min_pretty` and `max_pretty` (they were undefined), and `from_pretty`/`to_pretty` hold the prettified entry the handle bubble shows rather than the prettified index. A custom `prettify` function is called with real entries only, once per entry when the slider is built or updated. The index-based calls and the stray `0` calls are gone
* The slider renders correctly inside `display: flex` and `inline-flex` containers: `.irs` now declares `width: 100%`. Block layouts are unaffected
* README: the "Callback data" section now says which fields hold the index and which hold the value in values mode
* Tests: pinned that a Tab-key focus never changes the value (the fix itself shipped in 2.4.0)
* Issues: #319, #557, #577, #639, #661, #776

### Version 2.4.0. August 30, 2026
* New `onInit` callback fires once when the slider is created and its first render is done
* New `drag_over_limit` option lets a dragged handle push the other handle instead of stopping at it (mouse/touch drag only)
* New `min_prefix`/`max_prefix` options add a prefix wherever the minimum or maximum value appears, including a from/to bubble that lands on it
* New `prettify_grid`/`prettify_min_max` options format the grid and the min/max labels separately from `prettify`
* New `prettify_all_values` option runs `prettify` on non-numeric `values` entries too
* `prettify` now also accepts the name of a window-global function as a string, checked against a denylist to block arbitrary code execution
* `result` now also mirrors `from_min`, `from_max`, `to_min` and `to_max`
* `to_max` is now applied at initial render, not only afterward
* Arrow-key step no longer doubles when moving the whole interval in `drag_interval` mode, completing the fix started in 2.3.2
* Focusing the slider with keyboard navigation no longer fires callbacks on its own; only real interaction does
* Backfilled browser (Playwright) test coverage for existing behavior
* RELEASING.md now includes a GitHub Release creation step
* npm releases are now published from CI via trusted publishing, with provenance
* Issues: #276, #302, #306, #359, #503, #535, #679, #742, #825, #827, #830, #831, #836

### Version 2.3.2. August 24, 2026
* Keyboard controls in double mode now work on focus, without needing a mouse click first
* Arrow-key step no longer doubles on the single, `from` and `to` handles. `drag_interval` whole-interval stepping is unchanged, tracked in #825
* Fixed the caller's `values` array being mutated by the plugin
* Fixed IE8 syntax hazards in the unminified source (trailing comma, `console` guard)
* Corrected the readme defaults table
* Removed Bower support
* Added build/test/release tooling and CI (npm run build/test, GitHub Actions), with CI covering jQuery 1.8.3 through 4.0.0, full and slim builds
* Issues: #506, #696, #759, #797, #798, #799, #818

### Version 2.3.1. December 19, 2019
* Website update
* Minor bugfixes

### Version 2.3.0. December 11, 2018
* Website update
* Big skins update
* Minor bugfixes

### Version 2.2.0. June 21, 2017
* Slider has `TabIndex` support now. Issue #321
* `keyboard_step` option removed as confusing.
* `keyboard` controls are enabled by default now
* `keyboard` movement is bind to step now
* Traverse extra class names to container. Issue #318
* Prettified values added to `result object`. Issue #356
* It is possible to pass `scope` for callbacks now. Issue #402
* New option `block`. Light version of `disabled` but sliders value can be send with form. Issue #242

### Version 2.1.8. June 19, 2017
* Issues resolved: #420, #423, #441, #464, #479

### Version 2.1.7. March 26, 2017
* Issues: #438
* Reverted: #390

### Version 2.1.6. December 27, 2016
* Issues: #393, #406, #429, #431, #432

### Version 2.1.5. December 12, 2016
* Issues: #331, #332, #333, #337, #338, #343, #358, #374, #380, #389, #390, #394, #411, #412, #413

### Version 2.1.4. April 27, 2016
* Issues: #330, #369

### Version 2.1.3. April 10, 2016
* Issues: #342, #350

### Version 2.1.2. October 13, 2015
* Fixed bugs. Issues: #310, #312, #313, #316

### Version 2.1.1. September 21, 2015
* Fixed bugs. Issues: #305
* New features. Requests: #282

### Version 2.1.0. September 20, 2015
* Fixed bugs. Issues: #288
* New features. Requests: #281, #284, #286, #289
* Some code refactoring
* Code documentation updated

### Version 2.0.13. July 25, 2015
* Fixed bugs. Issues: #208, #270, #273
* New features. Requests: #233

### Version 2.0.12. July 10, 2015
* Fixed more bugs. Issues: #247, #263, #265, #269

### Version 2.0.11. July 02, 2015
* Fixed more bugs. Issues: #247, #253

### Version 2.0.10. June 06, 2015
* Fixed rounding bug. Issue #247

### Version 2.0.9. May 30, 2015
* Fixed critical bug. Issue #246

### Version 2.0.8. May 30, 2015
* Fixed some bugs. Issues: #219, #228, #230, #245

### Version 2.0.7. May 26, 2015
* Fixed memory issue: #220
* Fixed CPU issue: #186
* Merged PRs: #209, #226, #235

### Version 2.0.6. February 17, 2015
* Issues done: #197
* Fixed bug with broken From and To

### Version 2.0.5. February 13, 2015
* Issues done: #193, #195, #201

### Version 2.0.4. February 12, 2015
* Issues done: #174, #184
* NPM support added
* Readme files optimisations

### Version 2.0.3. December 29, 2014
* Issues done: #160, #165, #166, #168, #170

### Version 2.0.2: December 02, 2014
* Issues done: #143, #148, #153, #155, #159
* API update.

### Version 2.0.1: November 15, 2014
* Some bugs fixed
* Some new methods

### Version 2.0.0: November 08, 2014
* New Core
* New API
* Lot's of bug fixes
* Many improvements
* SPM support added

### Version 1.9.3: August 06, 2014
* Bower support added

### Version 1.9.2: August 04, 2014
* New param gridMargin
* Issues done: #89, #94, #96, #97, #98, #103

### Version 1.9.1: April 15, 2014
* Issues done: #81, #82, #85

### Version 1.9.0: March 16, 2014
* Issues done: #65, #68, #70, #77, #78
* New plugin description
* New demos design
* Some new slider params

### Version 1.8.5: January 12, 2014
* Issues done: #12, #30, #33, #43, #47, #52, #58
* Bug fixes
* New param "disable"
* Link to input and slider in all callbacks
* Click on slider to move it

### Version 1.8.2: October 31, 2013
* Issues done: #13, #31, #35, #37, #40
* Some code optimisations

### Version 1.8.1: October 10, 2013
* Issues done: #25
* New Flat UI Skin
* Some skin optimisations

### Version 1.8.0: October 08, 2013
* Issues done: #20, #21, #23, #24, #26
* Removed hideText option
* New method and options
* Improved code style
* Minor optimisations

### Version 1.7.2: September 11, 2013
* Issues done: #15, #16
* Fixed bug on Android-devices
* Added support for negative and fractional values

### Version 1.7.0: August 23, 2013
* Issues done: #7, #8, #9, #10
* Some enhancements

### Version 1.6.3: July 29, 2013
* Issues done: #2
* Moved to Semantic Versioning

### December, 2012
* Plugin release

***

[Support the plugin on GitHub sponsors](https://github.com/sponsors/IonDen)

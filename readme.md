![Ion.RangeSlider](_tmp/logo-ion-range-slider.png)

Ion.RangeSlider is a jQuery range slider with one or two handles, six skins, touch and keyboard support, custom values and a value grid.

***

* Version: 2.5.0
* [Project page and demos](http://ionden.com/a/plugins/ion.rangeSlider/)
* [Download ZIP](https://github.com/IonDen/ion.rangeSlider/archive/2.5.0.zip)
* [Support on GitHub Sponsors](https://github.com/sponsors/IonDen)

## Features

* 6 built-in skins (flat, big, modern, round, sharp, square)
* Single type (one handle, also called a thumb) or double type (two handles)
* Negative and fractional values, custom step
* Custom values array (numbers or strings)
* Value grid (tick marks with labels), optionally one labelled tick per step
* Drag the interval (the selected range between the two handles) as a whole
* Per-handle minimum and maximum limits
* Prefix and postfix for displayed values ($100, 100k, etc.)
* Large number formatting (10000000 → 10 000 000)
* Reads from and writes to a native `<input>` element, so it works in any HTML form
* Initialization via JavaScript or `data-*` attributes
* Public methods: update, reset, destroy
* Callbacks: onStart, onChange, onFinish, onUpdate, onInit
* Keyboard navigation
* Touch device support
* Works in Internet Explorer 8+ and all modern browsers
* MIT license

![Ion.RangeSlider](_tmp/ion-range-slider.png)

## Demos

* [Basic demo](http://ionden.com/a/plugins/ion.rangeSlider/demo.html)
* [Advanced demo](http://ionden.com/a/plugins/ion.rangeSlider/demo_advanced.html)
* [Interactions demo](http://ionden.com/a/plugins/ion.rangeSlider/demo_interactions.html)


## Dependencies

* [jQuery](http://jquery.com/) 1.8 or newer, up to and including 4.x. The slim builds work too.
* Nothing else. The plugin runs in Internet Explorer 8+ and every modern browser.

The browser suite runs once a week against 19 jQuery builds: 17 versions from 1.8.3 to 4.0.0 plus the 3.7.1 and 4.0.0 slim builds. Every change runs it against 1.8.3, 3.7.1 and 4.0.0-slim, and once more against the plugin's minified files under 3.7.1.


## Install

npm:
```
npm install ion-rangeslider
```

Yarn:
```
yarn add ion-rangeslider
```

Then load the stylesheet and the plugin:

```javascript
import "ion-rangeslider/css/ion.rangeSlider.min.css";
import "ion-rangeslider";
```

The stylesheet is a separate file, so importing the plugin alone gives you an unstyled slider. Under a bundler the plugin requires `jquery` by itself when no global `jQuery` is present yet.


## CDN

Use [jsDelivr](https://www.jsdelivr.com/package/npm/ion-rangeslider) or [cdnjs](https://cdnjs.com/libraries/ion-rangeslider).

```html
<!-- CSS -->
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/ion-rangeslider@2.5.0/css/ion.rangeSlider.min.css"/>

<!-- jQuery -->
<script src="https://cdn.jsdelivr.net/npm/jquery@3.7.1/dist/jquery.min.js"></script>

<!-- Plugin -->
<script src="https://cdn.jsdelivr.net/npm/ion-rangeslider@2.5.0/js/ion.rangeSlider.min.js"></script>
```

The same two files on cdnjs:

```html
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/ion-rangeslider/2.5.0/css/ion.rangeSlider.min.css"/>
<script src="https://cdnjs.cloudflare.com/ajax/libs/ion-rangeslider/2.5.0/js/ion.rangeSlider.min.js"></script>
```


## Usage

The slider is built from a regular text input. The input stays in the form, hidden, and always holds the current value:

```html
<input type="text" id="example_id" name="example_name" value="" />
```

Initialize it with:

```javascript
$("#example_id").ionRangeSlider();
```


## Full example

```javascript
$("#example").ionRangeSlider({
    skin: "big",
    min: 0,
    max: 10000,
    from: 1000,
    to: 9000,
    type: "double",
    prefix: "$",
    grid: true,
    grid_num: 10
});
```

Or use `data-*` attributes on the input:

```html
<input type="text" id="example"
    data-min="0"
    data-max="10000"
    data-from="1000"
    data-to="9000"
    data-type="double"
    data-prefix="$"
    data-grid="true"
    data-grid-num="10"
/>
```


## Settings

| Option | Data-Attr | Defaults | Type | Description |
| --- | --- | --- | --- | --- |
| `skin` | `data-skin` | `flat` | string | Skin (flat, big, modern, round, sharp, square) |
| `type` | `data-type` | `single` | string | `single` for one handle, `double` for two handles |
| `min` | `data-min` | `10` | number | Minimum value |
| `max` | `data-max` | `100` | number | Maximum value |
| `from` | `data-from` | `min` | number | Start value of the from handle (the left one, and the only one in single type) |
| `to` | `data-to` | `max` | number | Start value of the to handle (the right one). Double type only |
| `step` | `data-step` | `1` | number | Step size. Always > 0, can be fractional. [See notes](#step) |
| `step_from_min` | `data-step-from-min` | `false` | boolean | Keep every value on `min` plus whole steps, whatever the decimals of `min`. [See notes](#step_from_min) |
| `min_interval` | `data-min-interval` | `0` | number | Smallest interval between the handles. 0 means no limit. Double type only |
| `max_interval` | `data-max-interval` | `0` | number | Largest interval between the handles. 0 means no limit. Double type only |
| `drag_interval` | `data-drag-interval` | `false` | boolean | Let the user drag the whole interval by its bar. Double type only |
| `drag_over_limit` | `data-drag-over-limit` | `false` | boolean | Let a dragged handle push the other handle instead of stopping at it. Mouse and touch drag only, and it still respects `min_interval`, `max_interval`, `from_fixed` and `to_fixed`. Double type only |
| `values` | `data-values` | `[]` | array | Custom array of possible values (numbers or strings). The slider then works on array indexes. [See notes](#values) |
| `values_raw` | `data-values-raw` | `false` | boolean | Keep the `values` entries exactly as given, so "20.0" stays "20.0" instead of becoming 20. [See notes](#values_raw) |
| `from_fixed` | `data-from-fixed` | `false` | boolean | Fix the position of the from handle |
| `from_min` | `data-from-min` | `min` | number | Minimum limit for the from handle |
| `from_max` | `data-from-max` | `max` | number | Maximum limit for the from handle |
| `from_shadow` | `data-from-shadow` | `false` | boolean | Highlight the limits of the from handle |
| `to_fixed` | `data-to-fixed` | `false` | boolean | Fix the position of the to handle |
| `to_min` | `data-to-min` | `min` | number | Minimum limit for the to handle |
| `to_max` | `data-to-max` | `max` | number | Maximum limit for the to handle |
| `to_shadow` | `data-to-shadow` | `false` | boolean | Highlight the limits of the to handle |
| `prettify_enabled` | `data-prettify-enabled` | `true` | boolean | Format long numbers: 10000000 → 10 000 000 |
| `prettify_separator` | `data-prettify-separator` | `" "` | string | Thousands separator for the built-in formatting. A space by default (10 000 000); set it to "," for 10,000,000, or to an empty string to turn the separator off |
| `prettify` | `data-prettify` | `null` | function, string | Custom formatting function, or the name of a global one. [See notes](#prettify) |
| `prettify_grid` | `data-prettify-grid` | `null` | function, string | Formatting function for the grid labels only. [See notes](#prettify_grid) |
| `prettify_min_max` | `data-prettify-min-max` | `null` | function, string | Formatting function for the min and max labels only. [See notes](#prettify_min_max) |
| `prettify_all_values` | `data-prettify-all-values` | `false` | boolean | In `values` mode, also run `prettify` on non-numeric entries |
| `force_edges` | `data-force-edges` | `false` | boolean | Keep the value labels (shown above each handle), and the first and last grid labels, inside the container instead of letting them overhang its edges |
| `keyboard` | `data-keyboard` | `true` | boolean | Keyboard controls. Left: ←, ↓, A, S. Right: →, ↑, W, D |
| `grid` | `data-grid` | `false` | boolean | Show the value grid below the slider |
| `grid_margin` | `data-grid-margin` | `true` | boolean | Add a grid margin on the left and right, half a handle wide, so the first and last grid labels line up with the handle centers |
| `grid_num` | `data-grid-num` | `4` | number | Number of grid units the value range is cut into, at most 50. A labelled tick mark sits at each unit boundary, with smaller unlabelled ticks between them (up to 28 units). Ignored when `grid_snap` is on or `values` is used |
| `grid_snap` | `data-grid-snap` | `false` | boolean | Use one grid unit per step instead of `grid_num`. Still capped at 50 units |
| `hide_min_max` | `data-hide-min-max` | `false` | boolean | Hide the min and max labels |
| `hide_from_to` | `data-hide-from-to` | `false` | boolean | Hide the from and to value labels |
| `prefix` | `data-prefix` | `""` | string | Prefix for values: **$**100 |
| `min_prefix` | `data-min-prefix` | `""` | string | Prefix for the minimum value only: **From:** 0 — 100 |
| `max_prefix` | `data-max-prefix` | `""` | string | Prefix for the maximum value only: 0 — **Up to:** 100 |
| `postfix` | `data-postfix` | `""` | string | Postfix for values: 100**k** |
| `max_postfix` | `data-max-postfix` | `""` | string | Postfix for the maximum value only: 0 — 100**+** |
| `decorate_both` | `data-decorate-both` | `true` | boolean | When the from and to value labels merge into one, decorate both values (**$10k — $100k**) instead of only the merged pair (**$10 — 100k**). Double type only |
| `values_separator` | `data-values-separator` | `" — "` | string | Separator between the from and to values in the merged label. Double type only |
| `input_values_separator` | `data-input-values-separator` | `;` | string | Separator in the input value in double type: `<input value="25;42">` |
| `disable` | `data-disable` | `false` | boolean | Disable the slider and the input, so its value is not submitted with the form |
| `block` | `data-block` | `false` | boolean | Block the slider but keep the input enabled. Value is still submitted with the form |
| `extra_classes` | `data-extra-classes` | `""` | string | Extra CSS classes for the slider container |
| `scope` | `-` | `null` | object | Scope for callbacks |
| `onStart` | `-` | `null` | function | Fires once when the slider is created, before its first render. Edit the DOM from `onInit` instead |
| `onChange` | `-` | `null` | function | Fires on each value change made by the user. Not fired by `update()`, `reset()` or a container resize |
| `onFinish` | `-` | `null` | function | Fires when an interaction ends: a handle is released (even without moving), the track (the line the handles move on) is clicked, or a key is pressed |
| `onUpdate` | `-` | `null` | function | Fires when the slider is modified by `update()` or `reset()` |
| `onInit` | `-` | `null` | function | Fires once when the slider is created and its first render is done; for a slider that starts hidden, edit its DOM only after it first becomes visible |


## Notes on some options

#### step

Every value is `min` plus a whole number of steps, rounded to the decimals of `step`. With a whole-number `step` that rounding produces whole numbers, so `min: 0.5, step: 1` gives 0.5, 2, 3, 4 and `min: 1.2, step: 4` gives 1.2, 5, 9, 13; a negative `min` keeps its decimals instead (`min: -0.5, step: 1` gives -0.5, 0.5, 1.5). With a fractional `step` the values keep the decimals of `step` (`min: 0.3, step: 0.25` gives 0.3, 0.55, 0.8). `step_from_min` keeps every value exactly on `min` plus whole steps in all cases.

#### step_from_min

Every value becomes `min` plus a whole number of steps, so `min: 0.5` with `step: 1` gives 0.5, 1.5, 2.5 and so on instead of 0.5, 2, 3. The grid labels follow the same scale.

Put the starting `from` and `to`, the per-handle limits (`from_min`, `from_max`, `to_min`, `to_max`) and `min_interval` / `max_interval` on that scale as well. A value that does not sit on the scale is moved to the nearest point that does.

#### values

The slider works on array indexes instead of numbers: whatever you pass for `min`, `max` and `step` is replaced by 0, `values.length - 1` and 1. The grid gets one labelled tick per entry, up to the 50-unit cap, because `grid_num` and `grid_snap` are set for you.

A numeric-looking entry such as "20.0" is converted to the number 20 unless `values_raw` is on.

#### values_raw

By default a numeric-looking entry in `values` is converted to a number, so "20.0" becomes 20 in `from_value` and `to_value`, in the value written to the input and on the label. Turn `values_raw` on to keep the entry exactly as written. Spaces around the commas in `data-values` are trimmed while it is on.

Set it when the slider is created, or pass `values` again in the same `update()` call. Entries that were already converted cannot be restored.

#### prettify

A function that receives a number and returns the string to show. With `prettify_all_values` on, non-numeric `values` entries are passed to it as well.

A string is read as the name of a global function (`window[name]`); a name that does not resolve falls back to the built-in formatting. As with every option, only feed it configuration you control.

#### prettify_grid

Formats the grid labels only. When it is not set, the grid labels fall back to `prettify`, and then to the built-in number formatting. It takes a function or a global name exactly like `prettify`, and it does not apply in `values` mode.

#### prettify_min_max

Formats the min and max labels only. When it is not set, those labels fall back to `prettify`, and then to the built-in number formatting. Same function-or-global-name rules as `prettify`, and it does not apply in `values` mode either.


## Callback data

All callbacks receive the same object as their first argument. The plugin reuses that object and rewrites it on every change, so copy it with `$.extend({}, data)` if you need to keep a snapshot:

```javascript
{
    "input": object,            // jQuery reference to the input
    "slider": object,           // jQuery reference to the slider container
    "min": 0,                   // MIN value
    "max": 100000,              // MAX value
    "from": 10000,              // FROM value
    "from_percent": 10,         // FROM value in percent
    "from_value": null,         // the entry at this index when values is used (null until the first update() or reset() on a slider without values, then undefined)
    "from_min": null,           // FROM minimum limit (null if unset)
    "from_max": null,           // FROM maximum limit (null if unset)
    "to": 90000,                // TO value
    "to_percent": 90,           // TO value in percent
    "to_value": null,           // the entry at this index when values is used (null until the first update() or reset() on a slider without values, then undefined)
    "to_min": null,             // TO minimum limit (null if unset)
    "to_max": null,             // TO maximum limit (null if unset)
    "min_pretty": "0",          // MIN formatted
    "max_pretty": "100 000",    // MAX formatted
    "from_pretty": "10 000",    // FROM formatted (values mode: the prettified entry, not the index)
    "to_pretty": "90 000"       // TO formatted (values mode: the prettified entry, not the index)
}
```

When the `values` option is used, `from` and `to` hold the index of the selected
entry in the `values` array, not the entry itself. `from_value` and `to_value`
hold the actual entry at that index. In this mode `min` and `max` hold the
first and last index of the `values` array, and `min_pretty`/`max_pretty` hold
the label text of those entries. By default a numeric-looking entry like
"20.0" comes back as the number 20; set `values_raw` to keep it as the string
"20.0" instead.


## Public methods

Save the slider instance, then call methods on it:

```javascript
// Create
$("#range").ionRangeSlider({
    type: "double",
    min: 0,
    max: 1000,
    from: 200,
    to: 500,
    grid: true
});

// Get the instance
var slider = $("#range").data("ionRangeSlider");

// Update values
slider.update({
    from: 300,
    to: 400
});

// Reset to the values the slider was last built with
slider.reset();

// Remove the slider and restore the original input
slider.destroy();
```

`update()` merges the options you pass into the current ones and rebuilds the slider, so options you leave out keep the value they have now, including the current `from` and `to`. `reset()` goes back to the `from` and `to` the slider was created or last updated with. Calling `$("#range").ionRangeSlider()` a second time on an input that already has a slider does nothing, so reach for `update()` instead. After `destroy()` the input is back to normal and can be initialized again.


## Advanced examples

[Experiments playground on JSFiddle](https://jsfiddle.net/IonDen/uqs7njp9/)

* [Custom marks on slider](https://jsfiddle.net/IonDen/tdvxs3zL/)
* [One handle bound to one input](https://jsfiddle.net/IonDen/khngpw3m/)
* [Two handles bound to two inputs](https://jsfiddle.net/IonDen/avcm6wpj/)
* [Two sliders connected to each other](https://jsfiddle.net/IonDen/1hnvxsg5/)
* [Two dependent sliders](https://jsfiddle.net/IonDen/f1t6qpx0/)
* [1st slider enables/disables 2nd slider](https://jsfiddle.net/IonDen/kqwm1294/)
* [Non-linear slider](https://jsfiddle.net/IonDen/5f2730ds/)
* [Plus and minus buttons](https://jsfiddle.net/IonDen/e9as5k2m/)
* [Calculating sum](https://jsfiddle.net/IonDen/dfcmryn2/)
* [A second interval on one slider](https://jsfiddle.net/IonDen/ckwrqv75/)
* [Live editing of min and max values](https://jsfiddle.net/IonDen/wgfv76je/)
* [Prettify and transform values at the same time](https://jsfiddle.net/IonDen/kc0tzreu/)
* [Rendering money value n.nn](https://jsfiddle.net/IonDen/a0rghmd7/)
* [Changing step live](https://jsfiddle.net/IonDen/5ptjgm6h/)
* [Toggle slider](https://jsfiddle.net/IonDen/7m4otxwp/)
* [Skip some values](https://jsfiddle.net/IonDen/bqyw1e7k/)
* [Values array + prettify](https://jsfiddle.net/IonDen/p9gu71sL/)


## [Update history](history.md)

***

#### Support the project

* [GitHub Sponsors](https://github.com/sponsors/IonDen)
* [Buy me a coffee](https://www.buymeacoffee.com/ionden)

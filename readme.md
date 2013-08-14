# Ion.Range Slider 1.6.3

English | [русском](readme.ru.md)

-----

Easy and lightweight range input slider.

- [Project page and demos](http://ionden.com/a/plugins/ion.rangeSlider/en.html)
- [Download](http://ionden.com/a/plugins/ion.rangeSlider/ion.rangeSlider-1.6.3.zip)


-----


## Description

Ion.RangeSlider is a simple, lightweight and easily customizable range slider with skins support. Supports events, public methods, has flexible settings, and can be completely styled and altered with CSS.

Ion.RangeSlider supports touch-devices (iPhone, iPad, etc.).

Ion.RangeSlider is freely distributed under the [MIT licence](http://ionden.com/a/plugins/licence-en.html).


## Dependencies

- [jQuery 1.9+](http://jquery.com/)


## Usage

Add the following libraries to the page:

- jQuery
- ion.rangeSlider.min.js

Add the following stylesheets to the page:

- normalize.min.css _(If not already present)_
- ion.rangeSlider.css

Plus, a skin for the slider. Two skins are included:

- ion.rangeSlider.skinNice.css
- ion.rangeSlider.skinSimple.css

Don't forget to include the skin image sprite:

- sprite-skin-simple.png _(Simple skin)_
- sprite-skin-nice.png _(Nice skin)_

_Or use the included PSD file and design a custom skin._


### Initialisation

The slider overrides a native text `input` element. The input must have the default value of `"{min};{max}"`, where `{min}` and `{max}` are two numbers.

```html
<input type="text" id="someID" name="rangeName" value="10;100" />
```

To initialise the slider, call `ionRangeSlider` on the element:

Initialize slider:
```javascript
$("#someID").ionRangeSlider();
```


### Settings

A settings object can optionally be passed into the `ionRangeSlider()` method to customise the slider.

_All settings are optional._

| Property    | Default     | Description |
|-------------|-------------|-------------|
| `type`      | `"single"`  | One of `single` for a single-range slider or `double` for a double-range slider |
| `min`       | _input min_ | Override of the value in the `value` attribute of the base input (`<input value="10;100">` is a min of `10`) |
| `max`       | _input max_ | Override of the value in the `value` attribute of the base input (`<input value="10;100">` is a max of `100`) |
| `from`      | _min_       | The starting minimum value, defaulting to the `min` value |
| `to`        | _max_       | The starting maximum value, defaulting to the `max` value |
| `step`      | `1`         | The step increments selectable with the slider |
| `prefix`    | `""`        | A string to prepend before all values (eg: a prefix of `"$"` with a value of `10` produces `"$10"`) |
| `postfix`   | `""`        | A string to append to all values (eg: a postfix of `" kg"` with a value of `10` produces `"10 kg"`) |
| `hasGrid`   | `false`     | Whether to display the grid marks below the slider |
| `hideText`  | `false`     | Whether to hide all helper text (current value labels and min/max labels) |

#### Callbacks

The following settings can be provided as callbacks which will be triggered during operation.

| Property    | Description  |
|-------------|--------------|
| `onChange`  | Triggered live as the slider value is changed |
| `onFinish`  | Triggered after release if the slider value was changed |

An object with the following properties is provided to all callbacks upon triggering:

| Property     | Type  | Description |
|--------------|-------|-------------|
| `fromNumber` | int   | The low value selected |
| `toNumber`   | int   | The high value selected |
| `fromX`      | int   | The minimum possible value |
| `toX`        | int   | The maximum possible value |
| `toPers`     | float | The percentage selected _(Note: Unpredictable for `double` range inputs)_ |


An example of a customised slider:

```javascript
$("#someID").ionRangeSlider({
    min: 10,
    max: 100,
    from: 30,
    to: 80,
    type: "single",
    step: 10,
    postfix: " pounds",
    hasGrid: true,
    hideText: true,
    onChange: function(obj){
        console.log(obj.fromNumber, obj.toNumber);
    },
    onFinish: function(obj){
        console.log(obj.fromNumber, obj.toNumber);
    }
});
```

You can also initialize the slider with `data-*` attributes of the input tag:

- `data-from`: `from` setting
- `data-to`: `to` setting
- `data-type`: `type` setting
- `data-step`: `step` setting
- `data-prefix`: `prefix` setting
- `data-postfix`: `postfix` setting
- `data-hasgrid`: `hasgrid` setting
- `data-hidetext`: `hidetext` setting

For example, the input `<input data-from="30" data-to="70" data-type="double">` would be the same as the following settings:

```javascript
{
	type: "double",
	from: 30,
	to:   70
}
```


## Public Methods

- ### `update`

	Updates the settings for an existing range slider.
	
	```javascript
	$("#someID").ionRangeSlider("update", {
		/* (Update values) */
		min:  20,
		max:  90,
		from: 40,
		to:   70,
		step: 5
	});
	```

- ### `remove`

	Destroys a range slider, restoring the original input.
	
	```javascript
	$("#someID").ionRangeSlider("remove");
	```



## Update History

- **July 29, 2013:** [Issue #2](https://github.com/ionDen/ion.rangeSlider/issues/2) fixed. Versioning changed
- **June 30, 2013:** Minor bug fixes and new option "hideText"
- **June 21, 2013:** Added the ability to display the grid
- **June 21, 2013:** Minor bug fix
- **June 06, 2013:** New public methods and some code optimisations
- **June 06, 2013:** Some small css updates
- **April 30, 2013:** New method onFinish
- **February 15, 2013:** New feature to set slider settings through data-* attributes of input tag

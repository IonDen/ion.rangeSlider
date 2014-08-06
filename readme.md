# Ion.Range Slider 1.9.3

> English description | <a href="readme.ru.md">Описание на русском</a>

Easy and light range slider <a href="http://ionden.com/a/plugins/ion.rangeSlider/en.html">Project page and demos</a>

Download: <a href="http://ionden.com/a/plugins/ion.rangeSlider/ion.rangeSlider-1.9.3.zip">ion.rangeSlider-1.9.3.zip</a>

***

## Description
* Ion.RangeSlider — cool, comfortable and easily customizable range slider
* Supports events and public methods, has flexible settings, can be completely altered with CSS
* Cross-browser: Google Chrome, Mozilla Firefox 3.6+, Opera 12+, Safari 5+, Internet Explorer 8+
* Ion.RangeSlider supports touch-devices (iPhone, iPad, Nexus, etc.).
* Ion.RangeSlider freely distributed under terms of <a href="http://ionden.com/a/plugins/licence.html" target="_blank">MIT licence</a>.

## Key features
* Skin support. (3 skins included and PSD for skin creation)
* Any number of sliders at one page without conflicts and big performance problems
* Two slider types single (1 slider) and double (2 sliders)
* Support of negative and fractional values
* Ability to edit step
* Support of custom values diapason (See months example)
* Automatically generated grid
* Ability to disable UI elements (min and max, current value, grid)
* Postfixes and prefixes for you numbers ($20, 20 &euro; etc.)
* Additional postfix for maximum value (eg. $0 — $100<b>+</b>)
* Ability to prettify large numbers (eg. 10000000 -> 10 000 000)
* Slider writes it's value right into input value field. This makes it easy to use in any html form
* Any slider value can be set through input data-attribute (eg. data-min="10")
* Slider supports disable param. You can set it true to make slider inactive
* Slider supports external methods (update and remove) to control it after creation
* For advanced users slider has callbacks (onLoad, onChange, onFinish). Slider paste all it's params to callback first argument as object

## Dependencies
* <a href="http://jquery.com/" target="_blank">jQuery 1.9+</a>

## Usage

Add the following libraries to the page:
* jQuery
* ion.rangeSlider.min.js

Add the following stylesheets to the page:
* normalize.min.css (If not already present)
* ion.rangeSlider.css

Plus, a skin for the slider. Two skins are included:
* ion.rangeSlider.skinNice.css
* ion.rangeSlider.skinSimple.css

Don't forget about skin image sprite:
* sprite-skin-simple.png - Simple skin
* sprite-skin-nice.png - Nice skin
Or use the included PSD file and design a custom skin.


## Initialisation

The slider overrides a native text <code>input</code> element.
```html
<input type="text" id="example_id" name="example_name" value="" />
```

To initialise the slider, call ionRangeSlider on the element:
```javascript
$("#example_id").ionRangeSlider();
```


## Settings

<table class="options">
    <thead>
        <tr>
            <th>Property</th>
            <th>Default</th>
            <th>Description</th>
        </tr>
    </thead>
    <tbody>
        <tr>
            <td>type</td>
            <td>"single"</td>
            <td>Optional property, will select slider type from two options: <code>single</code> - for single range slider, or <code>double</code> - for double range slider</td>
        </tr>
        <tr>
            <td>min</td>
            <td>10</td>
            <td>Optional property, automatically set from the <code>value</code> attribute of base input. For example: if value="10;100", it will be 10</td>
        </tr>
        <tr>
            <td>max</td>
            <td>100</td>
            <td>Optional property, automatically set from the <code>value</code> attribute of base input. For example: if value="10;100", it will be 100</td>
        </tr>
        <tr>
            <td>from</td>
            <td>min</td>
            <td>Optional property, on default has the same value as min. overwrite default FROM setting</td>
        </tr>
        <tr>
            <td>to</td>
            <td>max</td>
            <td>Optional property, on default has the same value as max. overwrite default TO setting</td>
        </tr>
        <tr>
            <td>step</td>
            <td>1</td>
            <td>Optional property, set slider step value</td>
        </tr>
        <tr>
            <td>prefix</td>
            <td>-</td>
            <td>Optional property, set prefix text to all values. For example: "$" will convert "100" in to "$100"</td>
        </tr>
        <tr>
            <td>postfix</td>
            <td>-</td>
            <td>Optional property, set postfix text to all values. For example: " &euro;" will convert "100" in to "100 &euro;"</td>
        </tr>
        <tr>
            <td>maxPostfix</td>
            <td>-</td>
            <td>Optional property, set postfix text to maximum value. For example: maxPostfix - "+" will convert "100" to "100+"</td>
        </tr>
        <tr>
            <td>hasGrid</td>
            <td>false</td>
            <td>Optional property, enables grid at the bottom of the slider (it adds 20px height and this can be customised through CSS)</td>
        </tr>
        <tr>
            <td>gridMargin</td>
            <td>0</td>
            <td>Optional property, enables margin between slider corner and grid</td>
        </tr>
        <tr>
            <td>hideMinMax</td>
            <td>false</td>
            <td>Optional property, disables Min and Max fields.</td>
        </tr>
        <tr>
            <td>hideFromTo</td>
            <td>false</td>
            <td>Optional property, disables From an To fields.</td>
        </tr>
        <tr>
            <td>prettify</td>
            <td>true</td>
            <td>Optional property, allow to separate large numbers with spaces, eg. 10 000 than 10000</td>
        </tr>
        <tr>
            <td>disable</td>
            <td>false</td>
            <td>Disables the slider</td>
        </tr>
        <tr>
            <td>values</td>
            <td>null</td>
            <td>Array of custom values: [a, b, c] etc.</td>
        </tr>
    </tbody>
</table>


## Callbacks

<table class="options">
    <thead>
        <tr>
            <th>Property</th>
            <th>Default</th>
            <th>Description</th>
        </tr>
    </thead>
    <tbody>
        <tr>
            <td>onLoad</td>
            <td>-</td>
            <td>Triggered once, after slider loaded and each time after slider updated via method Update.</td>
        </tr>
        <tr>
            <td>onChange</td>
            <td>-</td>
            <td>Triggered live as the slider value is changed. Returns object with all slider values</td>
        </tr>
        <tr>
            <td>onFinish</td>
            <td>-</td>
            <td>Triggered once, after slider work is done. Returns object with all slider values</td>
        </tr>
    </tbody>
</table>


## Description of data passed to callbacks
Each callback have object with slider data as a first argument:
```javascript
Obj: {
    "input": object,    // jQuery-link to input
    "slider": object,   // jQuery-link to slider container
    "min": 10,          // MIN value
    "max": 20,          // MAX value
    "fromNumber": 10,   // FROM value
    "toNumber": 20,     // TO value
    "fromPers": 25,     // FROM value in percents
    "toPers": 75,       // TO value in percents
    "fromX": 100,       // x-coordinate of FROM-slider in pixels
    "toX": 200          // x-coordinate of TO-slider in pixels
}
```

## Creating slider (all params)
An example of a customised slider:
```javascript
$("#someID").ionRangeSlider({
    min: 10,                        // min value
    max: 100,                       // max value
    from: 30,                       // overwrite default FROM setting
    to: 80,                         // overwrite default TO setting
    type: "single",                 // slider type
    step: 10,                       // slider step
    prefix: "$",                    // prefix value
    postfix: " €",                  // postfix value
    maxPostfix: "+",                // postfix to maximum value
    hasGrid: true,                  // enable grid
    gridMargin: 7,                  // margin between slider corner and grid
    hideMinMax: true,               // hide Min and Max fields
    hideFromTo: true,               // hide From and To fields
    prettify: true,                 // separate large numbers with space, eg. 10 000
    disable: false,                 // disable slider
    values: ["a", "b", "c"],        // array of custom values
    onLoad: function (obj) {        // callback is called after slider load and update
        console.log(obj);
    },
    onChange: function (obj) {      // callback is called on every slider change
        console.log(obj);
    },
    onFinish: function (obj) {      // callback is called on slider action is finished
        console.log(obj);
    }
});
```

You can also initialise slider with <code>data-*</code> attributes of input tag:
```html
data-from="30"                      // default FROM setting
data-to="70"                        // default TO setting
data-type="double"                  // slider type
data-step="10"                      // slider step
data-prefix="$"                     // prefix value
data-postfix=" €"                   // postfix value
data-maxpostfix="+"                 // postfix to maximum value
data-hasgrid="true"                 // enable grid
data-gridmargin="7"                 // set grid margin
data-hideminmax="true"              // hide Min and Max fields
data-hidefromto="true"              // hide From and To fields
data-prettify="false"               // don't use spaces in large numbers, eg. 10000 than 10 000
data-values="a,b,c"                 // comma separated predefined slider values
```

## Public methods

Slider update, method <code>update</code>:
```javascript
$("#someID").ionRangeSlider("update", {
    min: 20,                        // change min value
    max: 90,                        // change max value
    from: 40,                       // change default FROM setting
    to: 70,                         // change default TO setting
    step: 5                         // change slider step
});
```

Slider remove, method <code>remove</code>:
```javascript
$("#someID").ionRangeSlider("remove");
```


## Update history
* 1.9.3: August 06, 2014 - Bower support added
* 1.9.2: August 04, 2014 - New param gridMargin. Resolved some issues: #89, #94, #96, #97, #98, #103
* 1.9.1: April 15, 2014 - Fixed some bugs: #81, #82, #85
* March 16, 2014 - New plugin description. New demos design. Some new slider params. Issues: #65, #68, #70, #77, #78
* January 12, 2014 - Fixed some bugs and some new features. Issues: #12, #30, #33, #43, #47, #52, #58
* October 31, 2013 - Fixed bugs: #13, #31, #35, #37, #40, and some code optimisations
* October 10, 2013 - New Flat UI Skin. Some skin optimisations. Fixed issue #25.
* October 08, 2013 - Fixed issues #20, #21, #23, #24, #26. Removed hideText option. New method and options. Improved code style. Minor optimisations.
* September 11, 2013 - Fixed bug on Android-devices. Added support for negative and fractional values. Issues #15, #16
* August 23, 2013 - Issues #7, #8, #9, #10 fixed and some enhancements
* July 29, 2013 - Issue #2 fixed. Versioning changed
* June 30, 2013 - minor bug fixes and new option "hideText"
* June 21, 2013 - added the ability to display the grid
* June 21, 2013 - minor bug fix
* June 06, 2013 - new public methods and some code optimisations
* June 06, 2013 - some small css updates
* April 30, 2013 - new method onFinish
* February 15, 2013 - new feature to set slider settings through data-* attributes of input tag
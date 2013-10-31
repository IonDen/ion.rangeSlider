# Ion.Range Slider 1.8.2

> English description | <a href="readme.ru.md">Описание на русском</a>

Easy and light range slider <a href="http://ionden.com/a/plugins/ion.rangeSlider/en.html">Project page and demos</a>

Download: <a href="http://ionden.com/a/plugins/ion.rangeSlider/ion.rangeSlider-1.8.2.zip">ion.rangeSlider-1.8.2.zip</a>

***

## Description
Ion.RangeSlider — Nice, comfortable and easily customizable range slider with skins support. Also support events and public methods, has flexible settings, can be completely altered with CSS.<br />
Slider supports negative and fractional values<br />
Ion.RangeSlider supports touch-devices (iPhone, iPad, etc.).<br />
Ion.RangeSlider freely distributed under <a href="http://ionden.com/a/plugins/licence-en.html" target="_blank">MIT licence</a>.

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

The slider overrides a native text <code>input</code> element. The input may have the default value of "<code>{min}</code>;<code>{max}</code>", where <code>{min}</code> and <code>{max}</code> are two numbers.
```html
<input type="text" id="someID" name="rangeName" value="10;100" />
```

To initialise the slider, call ionRangeSlider on the element:
```javascript
$("#someID").ionRangeSlider();
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
            <td>postfix</td>
            <td>-</td>
            <td>Optional property, set postfix text to all values. For example: " pounds" will convert "100" in to "100 pounds"</td>
        </tr>
        <tr>
            <td>hasGrid</td>
            <td>false</td>
            <td>Optional property, enables grid at the bottom of the slider (it adds 20px height and this can be customised through CSS)</td>
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


An example of a customised slider:
```javascript
$("#someID").ionRangeSlider({
    min: 10,                        // min value
    max: 100,                       // max value
    from: 30,                       // overwrite default FROM setting
    to: 80,                         // overwrite default TO setting
    type: "single",                 // slider type
    step: 10,                       // slider step
    postfix: " pounds",             // postfix text
    hasGrid: true,                  // enable grid
    hideMinMax: true,               // hide Min and Max fields
    hideFromTo: true,               // hide From and To fields
    prettify: true,                 // separate large numbers with space, eg. 10 000
    onChange: function(obj){        // function-callback, is called on every change
        console.log(obj);
    },
    onFinish: function(obj){        // function-callback, is called once, after slider finished it's work
        console.log(obj);
    }
});
```

You can also initialise slider with <code>data-*</code> attributes of input tag:
```html
data-from="30"                      // overwrite default FROM setting
data-to="70"                        // overwrite default TO setting
data-type="double"                  // slider type
data-step="10"                      // slider step
data-postfix=" pounds"              // postfix text
data-hasgrid="true"                 // enable grid
data-hideminmax="true"              // hide Min and Max fields
data-hidefromto="true"              // hide From and To fields
data-prettify="false"               // don't use spaces in large numbers, eg. 10000 than 10 000
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
* October 31, 2013 - Fixed bugs: # 13, 31, 35, 37, 40, and some code optimisations
* October 10, 2013 - New Flat UI Skin. Some skin optimisations. Fixed issue #25.
* October 08, 2013 - Fixed issues #20, #21, #23, #24, #26. Removed hideText option. New method and options. Improved code style. Minor optimisations.
* September 11, 2013 - Fixed bug on Android-devices. Added support for negative and fractional values. Issues #15, 16
* August 23, 2013 - Issues #7-10 fixed and some enhancements
* July 29, 2013 - Issue #2 fixed. Versioning changed
* June 30, 2013 - minor bug fixes and new option "hideText"
* June 21, 2013 - added the ability to display the grid
* June 21, 2013 - minor bug fix
* June 06, 2013 - new public methods and some code optimisations
* June 06, 2013 - some small css updates
* April 30, 2013 - new method onFinish
* February 15, 2013 - new feature to set slider settings through data-* attributes of input tag
# Ion.Range Slider 1.6.3

> English description | <a href="readme.ru.md">Описание на русском</a>

Easy and light range slider <a href="http://ionden.com/a/plugins/ion.rangeSlider/en.html">Project page and demos</a>

Download: <a href="http://ionden.com/a/plugins/ion.rangeSlider/ion.rangeSlider-1.6.3.zip">ion.rangeSlider-1.6.3.zip</a>

***

## Description
Ion.RangeSlider — Nice, comfortable and easily customizable range slider with skins support. Also support events and public methods, has flexible settings, can be completely altered with CSS.<br />
Ion.RangeSlider supports touch-devices (iPhone, iPad, etc.).<br />
Ion.RangeSlider freely distributed under <a href="http://ionden.com/a/plugins/licence-en.html" target="_blank">MIT licence</a>.

## Dependencies
* <a href="http://jquery.com/" target="_blank">jQuery 1.9+</a>

## Using script

Import this libraries:
* jQuery
* ion.rangeSlider.min.js

And CSS:
* normalize.min.css - desirable if you have not yet connected one
* ion.rangeSlider.css
* ion.rangeSlider.skinName.css

Don't forget about skin image:
* sprite-skin-simple.png - Simple skin
* sprite-skin-nice.png - Nice skin
* Or use included PSD file and draw your own skin (don't forget to modify skin css after that)

Create base input element:
```html
<input type="text" id="someID" name="rangeName" value="10;100" />
```

Initialize slider:
```javascript
$("#someID").ionRangeSlider();
```

Or initialize slider with custom settings:
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
    hideText: true,                 // hide all text data
    onChange: function(obj){        // function-callback, is called on every change
        console.log(obj);
    },
    onFinish: function(obj){        // function-callback, is called once, after slider finished it's work
        console.log(obj);
    }
});
```

You can also initialize slider with data-* attributes of input tag:
```html
data-from="30"                      // overwrite default FROM setting
data-to="70"                        // overwrite default TO setting
data-type="double"                  // slider type
data-step="10"                      // slider step
data-postfix=" pounds"              // postfix text
data-hasgrid="true"                 // enable grid
data-hidetext="true"                // hide all text data
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


## Settings

<table>
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
            <td>= min</td>
            <td>Optional property, on default has the same value as min. overwrite default FROM setting</td>
        </tr>
        <tr>
            <td>to</td>
            <td>= max</td>
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
            <td>hideText</td>
            <td>false</td>
            <td>Optional property, disables all visual text data.</td>
        </tr>
        <tr>
            <td>onChange</td>
            <td>-</td>
            <td>Function-callback, is called on every change, returns object with all slider values</td>
        </tr>
        <tr>
            <td>onFinish</td>
            <td>-</td>
            <td>Function-callback, is called once, then slider work is done. Returns object with all slider values</td>
        </tr>
    </tbody>
</table>

## Update history
* July 29, 2013 - Issue #2 fixed. Versioning changed
* June 30, 2013 - minor bug fixes and new option "hideText"
* June 21, 2013 - added the ability to display the grid
* June 21, 2013 - minor bug fix
* June 06, 2013 - new public methods and some code optimisations
* June 06, 2013 - some small css updates
* April 30, 2013 - new method onFinish
* February 15, 2013 - new feature to set slider settings through data-* attributes of input tag
# Ion.Range Slider 1.5

> English description

Easy and light range. slider <a href="http://ionden.com/a/plugins/ion.rangeSlider/en.html">Project page and demos</a>

Download: <a href="http://ionden.com/a/plugins/ion.rangeSlider/ion.rangeSlider-1.5.zip">ion.rangeSlider-1.5.zip</a>

***

## Description
Ion.Range Slider — beautiful, comfortable and easily customizable range slider with skins support. Also support events and public methods, has flexible settings, can be completely altered with CSS.<br />
Ion.Range Slider supports touch-devices (iPhone, iPad, etc.).<br />
Ion.Range Slider freely distributed under <a href="http://ionden.com/a/licence-en.html" target="_blank">MIT licence</a>.

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
* 06.06.2013 - new public methods and some code optimisations
* 06.06.2013 - some small css updates
* 30.04.2013 - new method onFinish
* 15.02.2013 - new feature to set slider settings through data-* attributes of input tag

<br />
<br />
***
<br />
<br />

> Описание на русском

Удобный легкий слайдер диапазонов. <a href="http://ionden.com/a/plugins/ion.rangeSlider/">Страница проекта и демо</a>

Скачать: <a href="http://ionden.com/a/plugins/ion.rangeSlider/ion.rangeSlider-1.5.zip">ion.rangeSlider-1.5.zip</a>

***

## Описание
ion.rangeSlider — красивый, удобный и легко настраиваемый слайдер диапазонов, поддерживающий скины. Слайдер поддерживает события, имеет гибкие настройки, может быть полностью видоизменен через CSS.<br />
Слайдер поддерживает устройства с touch-экраном (iPhone, iPad, etc.).<br />
Слайдер свободно распространяется на условиях <a href="http://ionden.com/a/licence.html" target="_blank">лицензии MIT</a>.

## Зависимости
* <a href="http://jquery.com/" target="_blank">jQuery 1.9+</a>


## Подключение

Подключаем библиотеки:
* jQuery
* ion.rangeSlider.min.js

И CSS:
* normalize.min.css - желательно, если он у вас еще не подключен
* ion.rangeSlider.css
* ion.rangeSlider.skinName.css

Не забываем про скин:
* sprite-skin-simple.png - простецкий скин
* sprite-skin-nice.png - приличный скин
* Либо воспользуйтесь вложенным в архив PSD файлом, и нарисуйте собственный скин (не забудьте модифицировать размеры элементов в CSS файле)

Создаем базовое поле инпут:
```html
<input type="text" id="someID" name="rangeName" value="10;100" />
```

Инициализируем слайдер:
```javascript
$("#someID").ionRangeSlider();
```

Или инициализируем слайдер с параметрами:
```javascript
$("#someID").ionRangeSlider({
    min: 10,                        // минимальное значение
    max: 100,                       // максимальное значение
    from: 30,                       // предустановленное значение ОТ
    to: 80,                         // предустановленное значение ДО
    type: "single",                 // тип слайдера
    step: 10,                       // шаг слайдера
    postfix: " грамм",              // постфикс значение
    onChange: function(obj){        // callback функция, вызывается при изменении состояния
        console.log(obj);
    },
    onFinish: function(obj){        // callback функция, вызывается один раз по окончании использования слайдера
        console.log(obj);
    }
});
```

Слайдер с параметрами можно также инициализировать используя атрибуты data-* у тэга input:
```html
data-from="30"                      // предустановленное значение ОТ
data-to="70"                        // предустановленное значение ДО
data-type="double"                  // тип слайдера
data-step="10"                      // шаг слайдера
data-postfix=" грамм"               // постфикс значение
```

## Публичные методы

Обновление слайдера, метод <code>update</code>:
```javascript
$("#someID").ionRangeSlider("update", {
    min: 20,                        // меняем минимальное значение
    max: 90,                        // меняем максимальное значение
    from: 40,                       // меняем предустановленное значение ОТ
    to: 70,                         // меняем предустановленное значение ДО
    step: 5                         // меняем шаг слайдера
});
```

Удаление слайдера, метод <code>remove</code>:
```javascript
$("#someID").ionRangeSlider("remove");
```


## Настройка

<table>
    <thead>
        <tr>
            <th>Атрибут</th>
            <th>По умолчанию</th>
            <th>Описание</th>
        </tr>
    </thead>
    <tbody>
        <tr>
            <td>type</td>
            <td>"single"</td>
            <td>Не обязательный параметр, позволяет выбрать тип слайдера, может принимать значение <code>single</code> - для одиночного слайдера или <code>double</code> - для двойного слайдера</td>
        </tr>
        <tr>
            <td>min</td>
            <td>10</td>
            <td>Не обязательный параметр, автоматически устанавливается из атрибута <code>value</code> базового поля input. Например если value="10;100", то примет значение 10</td>
        </tr>
        <tr>
            <td>max</td>
            <td>100</td>
            <td>Не обязательный параметр, автоматически устанавливается из атрибута <code>value</code> базового поля input. Например если value="10;100", то примет значение 100</td>
        </tr>
        <tr>
            <td>from</td>
            <td>= min</td>
            <td>Не обязательный параметр, по умолчанию равен значению min. Позволяет задать стартовую позицию слайдера "ОТ"</td>
        </tr>
        <tr>
            <td>to</td>
            <td>= max</td>
            <td>Не обязательный параметр, по умолчанию равен значению max. Позволяет задать стартовую позицию слайдера "ДО"</td>
        </tr>
        <tr>
            <td>step</td>
            <td>1</td>
            <td>Не обязательный параметр, задает шаг слайдера</td>
        </tr>
        <tr>
            <td>postfix</td>
            <td>-</td>
            <td>Не обязательный параметр, добавляет текст после всех значений. Например postfix - " грамм" модифицирует значение "100" в "100 грамм"</td>
        </tr>
        <tr>
            <td>onChange</td>
            <td>-</td>
            <td>Callback функция, вызывается при смене состояния слайдера, возвращает объект, содержащий параметры слайдера</td>
        </tr>
        <tr>
            <td>onFinish</td>
            <td>-</td>
            <td>Callback функция, вызывается один раз при смене состояния слайдера, когда работа слайдера завершена. Возвращает объект, содержащий параметры слайдера</td>
        </tr>
    </tbody>
</table>

## История обновлений
* 06.06.2013 - добавлены публичные методы и произведена оптимизация кода
* 06.06.2013 - мелкие обновления CSS файлов
* 30.04.2013 - добавлен новый метод onFinish
* 15.02.2013 - добавлена возможность настраивать слайдер через атрибуты data-*
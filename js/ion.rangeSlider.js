// Ion.RangeSlider
// version 1.0.42
// © 2013 Denis Ineshin | IonDen.com
//
// Project page:    http://ionden.com/a/plugins/ion.rangeSlider/
// GitHub page:     https://github.com/IonDen/ion.rangeSlider
//
// Released under MIT licence:
// http://ionden.com/a/licence.html
// =====================================================================================================================

(function($){
    $.fn.ionRangeSlider = function(options){
        var slider = this;
        var settings = $.extend({
            min: parseInt(slider.attr("value").split(";")[0]) || 10,
            max: parseInt(slider.attr("value").split(";")[1]) || 100,
            from: parseInt(slider.attr("value").split(";")[0]) || 10,
            to: parseInt(slider.attr("value").split(";")[1]) || 100,
            type: "single",
            step: 1,
            postfix: "",
            onChange: null
        }, options);

        var id = "ion-range-slider-" + parseInt(Math.random() * 100000000000);

        var baseHTML =  '<span class="irs" id="' + id + '">'; // irs = ion range slider css prefix
            baseHTML += '<span class="irs-line"><span class="irs-line-left"></span><span class="irs-line-right"></span></span>';
            baseHTML += '<span class="irs-min">0</span><span class="irs-max">1</span>';
            baseHTML += '<span class="irs-from">0</span><span class="irs-to">0</span><span class="irs-single">0</span>';
            baseHTML += '</span>';
        var singleHTML = '<span class="irs-slider single"></span>';
        var doubleHTML =  '<span class="irs-diapazon"></span>';
            doubleHTML += '<span class="irs-slider from"></span>';
            doubleHTML += '<span class="irs-slider to"></span>';

        var func = {
            init: function(){
                var self = this;

                this.allowDrag = false;
                this.mouseX = 0;

                this.normalWidth = 0;
                this.fullWidth = 0;
                this.sliderWidth = 0;
                this.numbers = {};

                slider[0].style.display = "none";
                slider.after(baseHTML);
                this.rangeSlider = $("#" + id);

                this.fieldMin = this.rangeSlider.find(".irs-min");
                this.fieldMax = this.rangeSlider.find(".irs-max");
                this.fieldMin.html(this.prettify(settings.min) + settings.postfix);
                this.fieldMax.html(this.prettify(settings.max) + settings.postfix);
                this.fieldMinWidth = this.fieldMin.outerWidth();
                this.fieldMaxWidth = this.fieldMax.outerWidth();

                this.fieldFrom = this.rangeSlider.find(".irs-from");
                this.fieldTo = this.rangeSlider.find(".irs-to");
                this.fieldSingle = this.rangeSlider.find(".irs-single");

                if(settings.type == "single") {

                    this.rangeSlider.append(singleHTML);
                    this.singleSlider = this.rangeSlider.find(".single");

                    this.singleSlider.on("mousedown", function(e){
                        e.preventDefault();
                        e.stopPropagation();
                        self.calcDimentions(e, $(this), null);
                        self.allowDrag = true;
                        if(oldie) $("*").prop("unselectable",true);
                    });

                } else if(settings.type == "double") {

                    this.rangeSlider.append(doubleHTML);
                    this.fromSlider = this.rangeSlider.find(".from");
                    this.toSlider = this.rangeSlider.find(".to");
                    this.diapazon = this.rangeSlider.find(".irs-diapazon");
                    this.setDiapazon();

                    this.fromSlider.on("mousedown", function(e){
                        e.preventDefault();
                        e.stopPropagation();
                        $(this).addClass("last");
                        self.toSlider.removeClass("last");
                        self.calcDimentions(e, $(this), "from");
                        self.allowDrag = true;
                        if(oldie) $("*").prop("unselectable",true);
                    });
                    this.toSlider.on("mousedown", function(e){
                        e.preventDefault();
                        e.stopPropagation();
                        $(this).addClass("last");
                        self.fromSlider.removeClass("last");
                        self.calcDimentions(e, $(this), "to");
                        self.allowDrag = true;
                        if(oldie) $("*").prop("unselectable",true);
                    });

                }

                $(document.body).on("mouseup", function(){
                    self.allowDrag = false;
                    self.activeSlider = null;
                    if(settings.type == "double") self.setDiapazon();
                    self.getNumbers();
                    if(oldie) $("*").prop("unselectable",false);
                });
                $(document.body).on("mousemove", function(e){
                    if(self.allowDrag) {
                        self.mouseX = e.pageX;
                        self.dragSlider();
                    }
                });

                this.getSize();
                this.setNumbers();
            },
            getSize: function(){
                this.normalWidth = this.rangeSlider.width();
                if(this.singleSlider) this.sliderWidth = this.singleSlider.width();
                else this.sliderWidth = this.fromSlider.width();
                this.fullWidth = this.normalWidth - this.sliderWidth;
            },
            calcDimentions: function(e, currentSlider, whichSlider){
                this.getSize();

                this.activeSlider = currentSlider;

                var _x1 = this.activeSlider.offset().left,
                    _x2 = e.pageX - _x1;
                this.minusX = _x1 + _x2 - this.activeSlider.position().left;

                if(settings.type == "single") {

                    this.width = this.rangeSlider.width() - this.sliderWidth;

                } else if(settings.type == "double") {

                    if(whichSlider == "from") {
                        this.left = 0;
                        this.right = parseInt(this.toSlider.css("left"));
                    } else {
                        this.left = parseInt(this.fromSlider.css("left"));
                        this.right = this.rangeSlider.width() - this.sliderWidth;
                    }

                }
            },
            dragSlider: function(){
                var x = Math.round(this.mouseX - this.minusX);

                if(settings.type == "single") {

                    if(x < 0) x = 0;
                    if(x > this.width) x = this.width;
                    this.getNumbers();

                } else if(settings.type == "double") {

                    if(x < this.left) x = this.left;
                    if(x > this.right) x = this.right;
                    this.getNumbers();
                    this.setDiapazon();

                }

                this.activeSlider[0].style.left = x + "px";
            },
            getNumbers: function(){
                var numbers = {
                    fromNumber: 0,
                    toNumber: 0,
                    fromPers: 0,
                    toPers: 0,
                    fromX: 0,
                    toX: 0
                };
                var diapazon = settings.max - settings.min, _from, _to;

                if(settings.type == "single") {

                    numbers.fromX = parseInt(this.singleSlider[0].style.left) || this.singleSlider.position().left;
                    numbers.fromPers = numbers.fromX / this.fullWidth * 100;
                    _from = (diapazon / 100 * numbers.fromPers) + parseInt(settings.min);
                    numbers.fromNumber = Math.round(_from / settings.step) * settings.step;

                } else if(settings.type == "double") {

                    numbers.fromX = parseInt(this.fromSlider[0].style.left) || this.fromSlider.position().left;
                    numbers.fromPers = numbers.fromX / this.fullWidth * 100;
                    _from = (diapazon / 100 * numbers.fromPers) + parseInt(settings.min);
                    numbers.fromNumber = Math.round(_from / settings.step) * settings.step;

                    numbers.toX = parseInt(this.toSlider[0].style.left) || this.toSlider.position().left;
                    numbers.toPers = numbers.toX / this.fullWidth * 100;
                    _to = (diapazon / 100 * numbers.toPers) + parseInt(settings.min);
                    numbers.toNumber = Math.round(_to / settings.step) * settings.step;

                }

                this.numbers = numbers;
                this.setFileds();

            },
            setNumbers: function(){
                var numbers = {
                    fromNumber: settings.from,
                    toNumber: settings.to,
                    fromPers: 0,
                    toPers: 0,
                    fromX: 0,
                    toX: 0
                };
                var diapazon = settings.max - settings.min;

                if(settings.type == "single") {

                    numbers.fromPers = (numbers.fromNumber - settings.min) / diapazon * 100;
                    numbers.fromX = Math.round(this.fullWidth / 100 * numbers.fromPers);
                    this.singleSlider[0].style.left = numbers.fromX + "px";

                } else if(settings.type == "double") {

                    numbers.fromPers = (numbers.fromNumber - settings.min) / diapazon * 100;
                    numbers.fromX = Math.round(this.fullWidth / 100 * numbers.fromPers);
                    this.fromSlider[0].style.left = numbers.fromX + "px";
                    numbers.toPers = (numbers.toNumber - settings.min) / diapazon * 100;
                    numbers.toX = Math.round(this.fullWidth / 100 * numbers.toPers);
                    this.toSlider[0].style.left = numbers.toX + "px";
                    this.setDiapazon();

                }

                this.numbers = numbers;
                this.setFileds();
            },
            setFileds: function(){
                var _from, _fromW, _fromX,
                    _to, _toW, _toX,
                    _single, _singleW, _singleX,
                    _slW = (this.sliderWidth / 2);

                if(settings.type == "single") {

                    this.fieldFrom[0].style.display = "none";
                    this.fieldTo[0].style.display = "none";

                    _single = this.prettify(this.numbers.fromNumber) + settings.postfix;
                    this.fieldSingle.html(_single);

                    _singleW = this.fieldSingle.outerWidth();
                    _singleX = this.numbers.fromX - (_singleW / 2) + _slW;
                    if(_singleX < 0) _singleX = 0;
                    if(_singleX > this.normalWidth - _singleW) _singleX = this.normalWidth - _singleW;
                    this.fieldSingle[0].style.left = _singleX + "px";

                    if(_singleX < this.fieldMinWidth) {
                        this.fieldMin[0].style.display = "none";
                    } else {
                        this.fieldMin[0].style.display = "block";
                    }

                    if(_singleX + _singleW > this.normalWidth - this.fieldMaxWidth) {
                        this.fieldMax[0].style.display = "none";
                    } else {
                        this.fieldMax[0].style.display = "block";
                    }


                    slider.attr("value", this.numbers.fromNumber);

                } else if(settings.type == "double") {

                    _from = this.prettify(this.numbers.fromNumber) + settings.postfix;
                    _to = this.prettify(this.numbers.toNumber) + settings.postfix;
                    if(this.numbers.fromNumber != this.numbers.toNumber) {
                        _single = this.prettify(this.numbers.fromNumber) + " — " + this.prettify(this.numbers.toNumber) + settings.postfix;
                    } else {
                        _single = this.prettify(this.numbers.fromNumber) + settings.postfix;
                    }
                    this.fieldFrom.html(_from);
                    this.fieldTo.html(_to);
                    this.fieldSingle.html(_single);

                    _fromW = this.fieldFrom.outerWidth();
                    _fromX = this.numbers.fromX - (_fromW / 2) + _slW;
                    if(_fromX < 0) _fromX = 0;
                    if(_fromX > this.normalWidth - _fromW) _fromX = this.normalWidth - _fromW;
                    this.fieldFrom[0].style.left = _fromX + "px";

                    _toW = this.fieldTo.outerWidth();
                    _toX = this.numbers.toX - (_toW / 2) + _slW;
                    if(_toX < 0) _toX = 0;
                    if(_toX > this.normalWidth - _toW) _toX = this.normalWidth - _toW;
                    this.fieldTo[0].style.left = _toX + "px";

                    _singleW = this.fieldSingle.outerWidth();
                    _singleX = this.numbers.fromX + ((this.numbers.toX - this.numbers.fromX) / 2) - (_singleW / 2) + _slW;
                    if(_singleX < 0) _singleX = 0;
                    if(_singleX > this.normalWidth - _singleW) _singleX = this.normalWidth - _singleW;
                    this.fieldSingle[0].style.left = _singleX + "px";

                    if(_fromX + _fromW < _toX) {
                        this.fieldSingle[0].style.display = "none";
                        this.fieldFrom[0].style.display = "block";
                        this.fieldTo[0].style.display = "block";
                    } else {
                        this.fieldSingle[0].style.display = "block";
                        this.fieldFrom[0].style.display = "none";
                        this.fieldTo[0].style.display = "none";
                    }

                    if(_singleX < this.fieldMinWidth || _fromX < this.fieldMinWidth) {
                        this.fieldMin[0].style.display = "none";
                    } else {
                        this.fieldMin[0].style.display = "block";
                    }

                    if(_singleX + _singleW > this.normalWidth - this.fieldMaxWidth || _toX + _toW > this.normalWidth - this.fieldMaxWidth) {
                        this.fieldMax[0].style.display = "none";
                    } else {
                        this.fieldMax[0].style.display = "block";
                    }

                    slider.attr("value", this.numbers.fromNumber + ";" + this.numbers.toNumber);

                }

                // trigger callback function
                if(typeof settings.onChange == "function") {
                    settings.onChange.call(this, this.numbers);
                }
            },
            setDiapazon: function(){
                var _w = this.fromSlider.width(),
                    _x = parseInt(this.fromSlider[0].style.left) || this.fromSlider.position().left,
                    _width = parseInt(this.toSlider[0].style.left) || this.toSlider.position().left,
                    x = _x + (_w / 2),
                    w = _width - _x;
                this.diapazon[0].style.left = x + "px";
                this.diapazon[0].style.width = w + "px";
            },
            prettify: function(num){
                var n = num.toString();
                return n.replace(/(\d{1,3}(?=(?:\d\d\d)+(?!\d)))/,"$1 ");
            }
        };

        func.init();

        var oldie = function(){
            var n = navigator.userAgent,
                r = /msie\s\d+/i,
                v;
            if(n.search(r) > 0){
                v = r.exec(n).toString();
                v = v.split(" ")[1];
                if(v < 9) {
                    oldie = true;
                    return true;
                } else {
                    oldie = false;
                    return false;
                }
            } else {
                oldie = false;
                return false;
            }
        }
    };
})(jQuery);
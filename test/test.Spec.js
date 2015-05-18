describe('Given the Ion RangeSlider', function () {


    it('should render a rangeSlider', function () {
        jQuery('body').append('<div id="range_01"></div>');
        $("#range_01").ionRangeSlider();
        expect($('.js-irs-0').length).to.equal(1);

    });

});
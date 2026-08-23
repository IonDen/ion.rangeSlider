# Manual IE8 checklist

Run after any change to DOM structure, events, CSS or the UMD wrapper, in an IE8 VM (IE11 in IE8 document mode is a weaker proxy). Start `node test/browser/server.mjs` and open `http://<host>:4173/test/fixtures/slider.html?jquery=vendor/jquery-1.8.3.js` (the fixture itself is written for IE8). Add `&min=1` to check the minified files too.

- [ ] Page loads without a script error dialog (one here means ES5+ syntax slipped into the source or the minified file).
- [ ] `<html>` has class `lt-ie9`; the slider renders with the flat skin.
- [ ] Drag the handle: value updates; no text selection happens while dragging.
- [ ] Click on the line: the handle jumps.
- [ ] Keyboard: tab to the line, arrows move the handle.
- [ ] `&config={"type":"double","min":0,"max":100,"from":20,"to":40}`: both handles drag; the input reads `20;40`-style values.
- [ ] `&config={"disable":true}`: the mask is visible (opacity fallback) and blocks clicks.
- [ ] `&config={"grid":true}`: grid ticks and labels render.
- [ ] With F12 tools closed there is no "console is undefined" dialog.

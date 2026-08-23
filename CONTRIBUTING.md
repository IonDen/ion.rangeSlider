# Contributing to Ion.RangeSlider project

### Code style

1. Project is using 4 space indentation
2. Function and method names should be written in camelCase
3. Variables name should be written in lower_case
4. New methods should have JSDoc descriptions
5. `js/ion.rangeSlider.js` must stay ECMAScript 3 so IE8 can parse it: no trailing commas in object or array literals, no ES5+ syntax, no ES5 built-ins (`forEach`, `Object.keys`, `trim`…) without the polyfills already in the file, and guard `console`. The build rejects ES5+ syntax, object-literal trailing commas, and ES3 reserved words used as identifiers, object keys or after a dot; array trailing commas and ES5 built-ins are not caught automatically, so watch for them in review.

### Guide for Pull Requests with bug fixes

1. Only 1 bugfix per Pull Request
2. Should have bug description
3. Should have bug screenshots (if possible)
4. Should have working demo. Use JSFIDDLE: https://jsfiddle.net/IonDen/b79q0vnm/

### Guide for Pull Requests with new features

1. Only 1 feature per Pull Request
2. Should have statement, why feature is important and should be included into plugin
3. Should have feature description
4. Should have feature screenshots (if possible)
5. Should have working demo. Use JSFIDDLE: https://jsfiddle.net/IonDen/b79q0vnm/

### Guide for Pull Requests with grammar fixes

1. Just create a pull request :)

### Where the work is tracked

Open issues and PRs that fit the 2.x line are on the project board: https://github.com/users/IonDen/projects/1. Issues stay open until the fix is in a tagged release. Usage questions belong in Discussions → Q&A.

### Building and testing

Node 22 or newer is needed to build and test (consumers need nothing: `js/` and `css/` are committed). `npm install`, then `npm run build` regenerates the three built files (`css/ion.rangeSlider.css` and the two minified files) from `less/` and `js/ion.rangeSlider.js`; `npm test` runs the unit tests. A pull request that touches `js/` or `less/` must include the rebuilt files (CI checks that the committed files match). Resolve conflicts in the minified files by rebuilding, never by hand.

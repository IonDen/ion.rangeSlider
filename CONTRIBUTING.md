# Contributing to Ion.RangeSlider

### Code style

1. The project uses 4-space indentation
2. Function and method names are written in camelCase
3. Variable names are written in lower_case
4. New methods need JSDoc descriptions
5. `js/ion.rangeSlider.js` must stay ECMAScript 3 so IE8 can parse it: no trailing commas in object or array literals, no ES5+ syntax, no ES5 built-ins (`forEach`, `Object.keys`, `trim`…) without the polyfills already in the file, and guard `console`. The build rejects ES5+ syntax, object-literal trailing commas, and ES3 reserved words used as identifiers, object keys or after a dot; array trailing commas and ES5 built-ins are not caught automatically, so watch for them in review.

### Guide for Pull Requests with bug fixes

1. Only one bug fix per Pull Request
2. Should have a bug description
3. Should have bug screenshots (if possible)
4. Should have a working demo. Use JSFiddle: https://jsfiddle.net/IonDen/b79q0vnm/

### Guide for Pull Requests with new features

1. Only one feature per Pull Request
2. Should have a statement on why the feature is important and why it belongs in the plugin
3. Should have a feature description
4. Should have feature screenshots (if possible)
5. Should have a working demo. Use JSFiddle: https://jsfiddle.net/IonDen/b79q0vnm/

### Guide for Pull Requests with grammar fixes

1. Just create a pull request :)

### Where the work is tracked

Open issues and PRs that fit the 2.x line are on the project board: https://github.com/users/IonDen/projects/1. Issues stay open until the fix is in a tagged release. Usage questions belong in Discussions → Q&A.

### Building and testing

Node 22 or newer is needed to build and test. Consumers need nothing: `js/` and `css/` are committed.

- `npm ci` installs the toolchain.
- `npm run build` regenerates the three built files (`css/ion.rangeSlider.css`, `css/ion.rangeSlider.min.css` and `js/ion.rangeSlider.min.js`) from `less/` and `js/ion.rangeSlider.js`.
- `npm test` runs the build checks, the vendored jQuery guard and the unit tests; `npm run test:browser` runs the browser suite. Run `npm run build` first so the browser suite exercises your source rather than master's last build, and leave the result out of your commit.
- A pull request must not include rebuilt files. CI builds from source before running the tests and rejects a hand-edited or half-rebuilt built file.
- Master's built files are refreshed automatically after every merge that touches the plugin source, the LESS sources or the build script, and the release procedure regenerates them too. The version and build-date banner inside them stays on the last tagged release until the next one.

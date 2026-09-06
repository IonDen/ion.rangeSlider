# Vendored jQuery files

These four versions are vendored here because the npm `jquery` package only ships a browser-ready `dist/jquery.js` from 1.11.0 (and 2.1.x) onward; earlier npm releases are a Node/CommonJS wrapper with no usable browser build. `vendor.json` records the source URL and SHA-256 for each file, checked by `npm run test:vendor`.

These four files, together with the jQuery versions pinned as npm aliases in `package.json`'s devDependencies (`jquery-1.11.3` through `jquery-4.0.0`), are deliberate test fixtures for the browser compatibility matrix, not runtime dependencies: `package.json`'s `files` list keeps `test/` out of the tarball and devDependencies never reach consumers, so nothing here is ever published. When Dependabot flags a known vulnerability in one of the aliased versions, the alert is dismissed with the reason "Vulnerable code is not actually used" rather than bumped, because bumping any of them would defeat the point of testing against that exact version.

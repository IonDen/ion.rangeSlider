# Vendored jQuery files

These four versions are vendored here because the npm `jquery` package only ships a browser-ready `dist/jquery.js` from 1.11.0 (and 2.1.x) onward; earlier npm releases are a Node/CommonJS wrapper with no usable browser build. `vendor.json` records the source URL and SHA-256 for each file, checked by `npm run test:vendor`.

These four files, together with the jQuery versions pinned as npm aliases in `package.json`'s devDependencies (`jquery-1.11.3` through `jquery-4.0.0`), are deliberate test fixtures for the browser compatibility matrix, not runtime dependencies: the package has no dependencies, so none of them are ever published. When Dependabot flags a known vulnerability in one of the aliased versions, the alert is dismissed as "vulnerable code not used" rather than bumped, because bumping any of them would defeat the point of testing against that exact version.

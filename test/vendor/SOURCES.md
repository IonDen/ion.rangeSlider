# Vendored jQuery files

These four versions are vendored here because the npm `jquery` package only ships a browser-ready `dist/jquery.js` from 1.11.0 (and 2.1.x) onward; earlier npm releases are a Node/CommonJS wrapper with no usable browser build. `vendor.json` records the source URL and SHA-256 for each file, checked by `npm run test:vendor`.

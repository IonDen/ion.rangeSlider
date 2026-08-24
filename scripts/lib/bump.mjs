const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const two = (n) => String(n).padStart(2, '0');
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function bumpVersion(version, kind) {
  const [major, minor, patch] = version.split('.').map(Number);
  if (kind === 'patch') return `${major}.${minor}.${patch + 1}`;
  if (kind === 'minor') return `${major}.${minor + 1}.0`;
  throw new Error(`only patch or minor: this line stays 2.x (got "${kind}")`);
}

export function formatDate(d) {
  return `${d.getUTCFullYear()}-${two(d.getUTCMonth() + 1)}-${two(d.getUTCDate())} ${two(d.getUTCHours())}:${two(d.getUTCMinutes())}:${two(d.getUTCSeconds())}`;
}

export function historyEntry(version, d) {
  return `### Version ${version}. ${MONTHS[d.getUTCMonth()]} ${two(d.getUTCDate())}, ${d.getUTCFullYear()}\n* Issues: #TODO\n\n`;
}

/** Replace exactly `count` matches of `re` in `text`, or throw naming the site. */
function must(text, re, replacement, site, count = 1) {
  // String.match on a non-global regex reports at most 1 regardless of how many times the
  // pattern occurs, so count with a forced-global copy while replacing with the original
  // (a non-global re replaces only the first hit, which the count above guarantees is the only one).
  const countRe = new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g');
  const n = (text.match(countRe) || []).length;
  if (n !== count) throw new Error(`${site} not found (expected ${count} match, got ${n})`);
  return text.replace(re, replacement);
}

/** Pure: takes { path: content } and returns the rewritten contents; throws if any site is missing. */
export function rewriteFiles({ files, from, to, build, buildDate, entry }) {
  const f = esc(from);
  const out = { ...files };
  let t = out['package.json'];
  t = must(t, /"version": "[^"]+"/, `"version": "${to}"`, 'package.json: version');
  t = must(t, /"build": \d+/, `"build": ${build}`, 'package.json: config.build');
  t = must(t, /"buildDate": "[^"]+"/, `"buildDate": "${buildDate}"`, 'package.json: config.buildDate');
  out['package.json'] = t;
  out['bower.json'] = must(out['bower.json'], /"version": "[^"]+"/, `"version": "${to}"`, 'bower.json: version');
  t = out['js/ion.rangeSlider.js'];
  t = must(t, /^\/\/ version [^\n]+$/m, `// version ${to} Build: ${build}`, 'js/ion.rangeSlider.js: header');
  t = must(t, /^\/\/ © Denis Ineshin, \d{4}$/m, `// © Denis Ineshin, ${buildDate.slice(0, 4)}`, 'js/ion.rangeSlider.js: copyright line');
  t = must(t, /this\.VERSION = "[^"]+";/, `this.VERSION = "${to}";`, 'js/ion.rangeSlider.js: this.VERSION');
  out['js/ion.rangeSlider.js'] = t;
  t = out['readme.md'];
  t = must(t, new RegExp(`^\\* Version: ${f}$`, 'm'), `* Version: ${to}`, 'readme.md: "Version:" line');
  t = must(t, new RegExp(`archive/${f}\\.zip`), `archive/${to}.zip`, 'readme.md: ZIP link');
  t = must(t, new RegExp(`ion-rangeslider/${f}/`, 'g'), `ion-rangeslider/${to}/`, 'readme.md: cdnjs URLs', 2);
  out['readme.md'] = t;
  out['history.md'] = must(out['history.md'], /^# Update History\n\n/m, `# Update History\n\n${entry}`, 'history.md: heading');
  const changed = Object.keys(out).filter((p) => out[p] !== files[p]);
  return { files: out, changed };
}

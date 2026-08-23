import less from 'less';
import CleanCSS from 'clean-css';

/**
 * Compiles LESS to plain CSS and to minified CSS, in IE8+ compatibility mode.
 * clean-css's default (IE10+) compatibility strips `filter`/`-ms-filter`
 * declarations as dead weight, but `.lt-ie9 .irs-disable-mask` relies on
 * `filter:alpha(opacity=0)` for IE8/9, which this project still supports.
 * Throws on any less or clean-css error or warning; no option here is meant
 * to silence one.
 */
export async function compileCss(lessSrc, filename) {
  const rendered = await less.render(lessSrc, { filename: filename });
  const css = rendered.css;

  const out = new CleanCSS({ level: 1, compatibility: 'ie8' }).minify(css);
  const problems = (out.errors || []).concat(out.warnings || []);
  if (problems.length) throw new Error(problems.join('\n'));

  return { css: css, min: out.styles };
}

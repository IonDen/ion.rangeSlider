/** Banner strings for the shipped files, stamped only from package.json. */
export function banners(pkg) {
  const version = pkg.version;
  const build = pkg.config.build;
  const date = pkg.config.buildDate;
  const year = date.slice(0, 4);
  const owner = `© Denis Ineshin, 2010 - ${year}, IonDen.com`;
  return {
    sourceHeader: `// version ${version} Build: ${build}`,
    sourceCopyright: `// © Denis Ineshin, ${year}`,
    js: `// Ion.RangeSlider, ${version}, ${owner}, Build date: ${date}`,
    css: `/**\nIon.RangeSlider, ${version}\n${owner}\nBuild date: ${date}\n*/\n`,
    cssMin: `/*!Ion.RangeSlider, ${version}, ${owner}, Build date: ${date}*/`,
  };
}

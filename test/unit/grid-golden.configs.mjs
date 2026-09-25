// Grids that are truthful today (#906 rule 1) and must stay byte-identical, small ticks included, through all
// three pull requests. Never edit an entry; append only.
export const GOLDEN_CONFIGS = [
  { name: '0..100 default', options: { min: 0, max: 100, grid: true } },
  { name: '0..100 gn 3', options: { min: 0, max: 100, grid: true, grid_num: 3 } },
  { name: '0..100 gn 10', options: { min: 0, max: 100, grid: true, grid_num: 10 } },
  { name: '0..100 gn 40', options: { min: 0, max: 100, grid: true, grid_num: 40 } },
  { name: '0..100 gn 50', options: { min: 0, max: 100, grid: true, grid_num: 50 } },
  { name: '0..24 gn 3', options: { min: 0, max: 24, grid: true, grid_num: 3 } },
  { name: '-39.9..111 step 0.1 gn 4 (#760)', options: { min: -39.9, max: 111, step: 0.1, grid: true } },
  { name: '-39.9..111 step 1 gn 4', options: { min: -39.9, max: 111, step: 1, grid: true } },
  { name: '0..100 step 7 grid_snap (short capped last unit)', options: { min: 0, max: 100, step: 7, grid: true, grid_snap: true } },
  { name: '0..100 step 10 grid_snap', options: { min: 0, max: 100, step: 10, grid: true, grid_snap: true } },
  { name: '0..99 grid_snap', options: { min: 0, max: 99, grid: true, grid_snap: true } },
  { name: 'values x5', options: { values: ['a', 'b', 'c', 'd', 'e'], grid: true } },
  { name: 'values x12', options: { values: ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'], grid: true } },
  { name: 'values x60', options: { values: Array.from({ length: 60 }, (_, i) => String(1970 + i)), grid: true } },
  { name: '1000..1000000 step 1000 gn 3', options: { min: 1000, max: 1000000, step: 1000, grid: true, grid_num: 3 } },
  { name: '0..100 step 5 gn 4', options: { min: 0, max: 100, step: 5, grid: true } },
  { name: '0..1000 step 25 gn 4', options: { min: 0, max: 1000, step: 25, grid: true } },
  { name: '0..10000000 step 1 gn 4 (large S)', options: { min: 0, max: 10000000, step: 1, grid: true } },
  { name: 'double 0..100 gn 5', options: { type: 'double', min: 0, max: 100, from: 20, to: 80, grid: true, grid_num: 5 } },
  { name: 'prettify_grid markup', options: { min: 0, max: 100, grid: true, prettify_grid: (n) => '<b>' + n + '</b>' } }
];

// Every .irs-grid-pol (big and small) and .irs-grid-text in document order: class, inline left, and the
// label's innerHTML (textContent could not tell a prettify_grid's <b>0</b> from 0; for a plain label the two
// are equal).
export function gridSnapshot(slider) {
  const out = [];
  slider.$cache.grid.find('.irs-grid-pol, .irs-grid-text').each(function () {
    out.push({ cls: this.className, left: this.style.left, html: this.innerHTML });
  });
  return out;
}

import { Fragment, useMemo } from 'react';
import { useCoverSheet, type CoverSheet } from '../../session/decoy';

/** An ordinary budget table, shown instead of the chat when the screen is covered or the window is not in front. */
const ROWS: [string, string, string, string][] = [
  ['Office supplies', '12', 'Paper, toner, folders', '184.50'],
  ['Software licences', '4', 'Annual renewal', '1,240.00'],
  ['Travel', '3', 'Client visits, October', '865.30'],
  ['Catering', '2', 'Team meetings', '212.75'],
  ['Equipment', '1', 'Monitor stand, cables', '96.20'],
  ['Training', '6', 'Online courses', '540.00'],
  ['Maintenance', '2', 'Printer service', '150.00'],
  ['Subscriptions', '5', 'Research and tools', '329.90'],
  ['Courier', '9', 'Documents, samples', '118.40'],
  ['Telephone', '3', 'Monthly plans', '167.00'],
  ['Utilities', '1', 'Shared office share', '402.85'],
  ['Printing', '7', 'Reports, handouts', '73.60'],
  ['Insurance', '1', 'Quarterly premium', '615.00'],
  ['Miscellaneous', '8', 'Small purchases', '88.15'],
];
const EXTRA = ['E', 'F', 'G', 'H', 'I', 'J'];

export const DECOY_TOTAL_ROW = ROWS.length + 2;
export const DECOY_FORMULA = `=SUM(D2:D${ROWS.length + 1})`;

function letters(i: number): string {
  let n = i + 1;
  let out = '';
  while (n > 0) {
    const r = (n - 1) % 26;
    out = String.fromCharCode(65 + r) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out;
}

/** The imported worksheet: the picture on top of a grid with the real column widths and row heights. */
function CoverGrid({ c }: { c: CoverSheet }) {
  const extraCols = 12;
  const extraRows = 60;
  const colW = useMemo(() => [...c.cols, ...Array.from({ length: extraCols }, () => c.defCol)], [c]);
  const rowH = useMemo(() => [...c.rows, ...Array.from({ length: extraRows }, () => c.defRow)], [c]);
  const template = `46px ${colW.map((w) => `${w}px`).join(' ')}`;
  const total = colW.reduce((a, b) => a + b, 0) + 46;
  return (
    <div className="dz" style={{ zoom: c.zoom / 100, width: total }}>
      <div className="dz-row dz-cols" style={{ gridTemplateColumns: template }}>
        <div className="dz-rn corner" />
        {colW.map((w, i) => <div className="dz-colh" key={i}>{w > 0 ? letters(i) : ''}</div>)}
      </div>
      {rowH.map((h, r) => (
        <div className="dz-row" key={r} style={{ gridTemplateColumns: template, height: h }}>
          <div className="dz-rn">{h > 0 ? r + 1 : ''}</div>
          {colW.map((_, i) => <div className="dz-c" key={i} />)}
        </div>
      ))}
      <img className="dz-img" alt="" draggable={false} src={`data:image/png;base64,${c.image}`} style={{ width: c.imgW, height: c.imgH }} />
    </div>
  );
}

export function DecoyGrid() {
  const cover = useCoverSheet();
  if (cover) return <CoverGrid c={cover} />;
  return (
    <>
      <div className="sg-row sg-cols">
        <div className="sg-rn corner" />
        {['A', 'B', 'C', 'D', ...EXTRA].map((l) => <div className="sg-colh" key={l}>{l}</div>)}
      </div>
      <div className="sg-row sg-head">
        <div className="sg-rn">1</div>
        <div className="sg-c a">Item</div><div className="sg-c b">Qty</div><div className="sg-c c">Description</div><div className="sg-c d">Amount</div>
        {EXTRA.map((x) => <div className="sg-c x" key={x} />)}
      </div>
      {ROWS.map((r, i) => (
        <div className="sg-row" key={i}>
          <div className="sg-rn">{i + 2}</div>
          <div className="sg-c a">{r[0]}</div>
          <div className="sg-c b num">{r[1]}</div>
          <div className="sg-c c">{r[2]}</div>
          <div className="sg-c d num">{r[3]}</div>
          {EXTRA.map((x) => <div className="sg-c x" key={x} />)}
        </div>
      ))}
      <div className="sg-row sg-total">
        <div className="sg-rn">{DECOY_TOTAL_ROW}</div>
        <div className="sg-c a">Total</div><div className="sg-c b" /><div className="sg-c c" />
        <div className="sg-c d num">5,043.65</div>
        {EXTRA.map((x) => <div className="sg-c x" key={x} />)}
      </div>
      {Array.from({ length: 50 }, (_, k) => (
        <Fragment key={k}>
          <div className="sg-row" aria-hidden="true">
            <div className="sg-rn">{DECOY_TOTAL_ROW + 1 + k}</div>
            <div className="sg-c a" /><div className="sg-c b" /><div className="sg-c c" /><div className="sg-c d" />
            {EXTRA.map((x) => <div className="sg-c x" key={x} />)}
          </div>
        </Fragment>
      ))}
    </>
  );
}

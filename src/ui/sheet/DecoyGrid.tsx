import { Fragment } from 'react';

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

export function DecoyGrid() {
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

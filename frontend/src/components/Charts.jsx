import './Charts.css';

/**
 * Small, dependency-free charts drawn with SVG and CSS.
 * No chart library is needed, so the app stays light on cheap phones.
 */

const SERIES_CLASS = ['c1', 'c2', 'c3', 'c4'];
const compact = (n) => {
  const v = Math.abs(n);
  if (v >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (v >= 1000) return `${Math.round(n / 1000)}k`;
  return String(Math.round(n));
};

/** Grouped vertical bars. data: [{ label, a, b }]  series: [{ key, label }] */
export function BarChart({ data, series, height = 190, format = compact }) {
  const W = 640;
  const H = height;
  const pad = { l: 40, r: 8, t: 10, b: 24 };
  const max = Math.max(1, ...data.flatMap((d) => series.map((s) => Number(d[s.key] || 0))));
  const innerW = W - pad.l - pad.r;
  const innerH = H - pad.t - pad.b;
  const groupW = innerW / Math.max(1, data.length);
  const barW = Math.max(3, Math.min(22, (groupW - 6) / series.length));
  const y = (v) => pad.t + innerH - (v / max) * innerH;

  return (
    <figure className="chart">
      <svg viewBox={`0 0 ${W} ${H}`} className="chart__svg" role="img"
        aria-label={series.map((s) => s.label).join(', ')}>
        {[0, 0.5, 1].map((f) => (
          <g key={f}>
            <line x1={pad.l} x2={W - pad.r} y1={y(max * f)} y2={y(max * f)} className="chart__grid" />
            <text x={pad.l - 6} y={y(max * f) + 4} textAnchor="end" className="chart__tick">{format(max * f)}</text>
          </g>
        ))}
        {data.map((d, i) => {
          const gx = pad.l + i * groupW + (groupW - barW * series.length) / 2;
          return (
            <g key={d.label + i}>
              {series.map((s, j) => {
                const v = Number(d[s.key] || 0);
                return (
                  <rect key={s.key} x={gx + j * barW} y={y(v)} width={barW - 1}
                    height={Math.max(0, pad.t + innerH - y(v))}
                    className={`chart__bar chart__bar--${SERIES_CLASS[j]}`} rx="2">
                    <title>{`${d.label} · ${s.label}: ${Number(v).toLocaleString('en-US')}`}</title>
                  </rect>
                );
              })}
              <text x={pad.l + i * groupW + groupW / 2} y={H - 6} textAnchor="middle" className="chart__tick">{d.label}</text>
            </g>
          );
        })}
      </svg>
      {series.length > 1 && (
        <figcaption className="chart__legend">
          {series.map((s, j) => (
            <span key={s.key} className="chart__key">
              <i className={`chart__dot chart__bar--${SERIES_CLASS[j]}`} />{s.label}
            </span>
          ))}
        </figcaption>
      )}
    </figure>
  );
}

/** A single line. data: [{ label, value }] */
export function LineChart({ data, height = 150, format = compact, suffix = '' }) {
  const W = 640;
  const H = height;
  const pad = { l: 40, r: 12, t: 12, b: 24 };
  const max = Math.max(1, ...data.map((d) => d.value || 0));
  const innerW = W - pad.l - pad.r;
  const innerH = H - pad.t - pad.b;
  const x = (i) => pad.l + (data.length < 2 ? innerW / 2 : (i / (data.length - 1)) * innerW);
  const y = (v) => pad.t + innerH - ((v || 0) / max) * innerH;
  const pts = data.map((d, i) => `${x(i)},${y(d.value)}`).join(' ');

  return (
    <figure className="chart">
      <svg viewBox={`0 0 ${W} ${H}`} className="chart__svg" role="img" aria-label="trend">
        {[0, 0.5, 1].map((f) => (
          <g key={f}>
            <line x1={pad.l} x2={W - pad.r} y1={y(max * f)} y2={y(max * f)} className="chart__grid" />
            <text x={pad.l - 6} y={y(max * f) + 4} textAnchor="end" className="chart__tick">{format(max * f)}{suffix}</text>
          </g>
        ))}
        <polyline points={pts} className="chart__line" />
        {data.map((d, i) => (
          <g key={d.label + i}>
            <circle cx={x(i)} cy={y(d.value)} r="3.5" className="chart__point"><title>{`${d.label}: ${d.value}${suffix}`}</title></circle>
            {(data.length <= 8 || i % 2 === 0) && (
              <text x={x(i)} y={H - 6} textAnchor="middle" className="chart__tick">{d.label}</text>
            )}
          </g>
        ))}
      </svg>
    </figure>
  );
}

/** Horizontal bars with a label and a value. items: [{ label, value, text, tone }] */
export function HBars({ items, max }) {
  const top = max || Math.max(1, ...items.map((i) => i.value || 0));
  return (
    <ul className="hbars">
      {items.map((it) => (
        <li key={it.label} className="hbars__row">
          <span className="hbars__label">{it.label}</span>
          <span className="hbars__track" aria-hidden="true">
            <span className={`hbars__fill hbars__fill--${it.tone || 'leaf'}`}
              style={{ width: `${Math.min(100, Math.max(2, ((it.value || 0) / top) * 100))}%` }} />
          </span>
          <span className="hbars__value money">{it.text ?? it.value}</span>
        </li>
      ))}
    </ul>
  );
}

/** A percentage ring. */
export function Ring({ value, label, tone = 'leaf', invert = false }) {
  const v = Math.max(0, Math.min(100, Number(value) || 0));
  const bad = invert ? v > 25 : v < 50;
  const color = tone === 'auto' ? (bad ? 'flame' : 'leaf') : tone;
  const R = 15.9155;
  return (
    <div className="ring">
      <svg viewBox="0 0 36 36" className="ring__svg" role="img" aria-label={`${label}: ${v}%`}>
        <circle cx="18" cy="18" r={R} className="ring__track" />
        <circle cx="18" cy="18" r={R} className={`ring__fill ring__fill--${color}`}
          strokeDasharray={`${v} ${100 - v}`} strokeDashoffset="25" />
        <text x="18" y="20.5" textAnchor="middle" className="ring__num">{v}%</text>
      </svg>
      <span className="ring__label">{label}</span>
    </div>
  );
}

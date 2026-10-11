import { useId } from 'react';
import './Charts.css';

/**
 * Small, dependency-free charts drawn with SVG and CSS.
 * No chart library is needed, so the app stays light on cheap phones.
 */

const SERIES_CLASS = ['c1', 'c2', 'c3', 'c4'];

// Line/area colours, matching the theme tokens used everywhere else.
const TONE_COLOR = {
  leaf: 'var(--leaf)', maize: 'var(--maize)', sky: 'var(--sky)',
  flame: 'var(--flame)', purple: '#8E6BC9', teal: '#2C9AA0',
};
const toneColor = (tone) => TONE_COLOR[tone] || TONE_COLOR.leaf;

/**
 * A very smooth curve through every point (Catmull-Rom → cubic Bézier).
 * The control points are clamped to the plot area, so a line that falls to
 * zero eases in flat instead of dipping below the axis (and the shaded area
 * stays honest).
 */
function smoothPath(xs, ys, minY, maxY) {
  const n = xs.length;
  if (n === 0) return '';
  if (n === 1) return `M ${xs[0]},${ys[0]}`;

  const clamp = (v) => Math.max(minY, Math.min(maxY, v));
  let d = `M ${xs[0]},${ys[0]}`;
  for (let i = 0; i < n - 1; i += 1) {
    const x0 = xs[i - 1] ?? xs[i], y0 = ys[i - 1] ?? ys[i];
    const x1 = xs[i], y1 = ys[i];
    const x2 = xs[i + 1], y2 = ys[i + 1];
    const x3 = xs[i + 2] ?? x2, y3 = ys[i + 2] ?? y2;
    const c1x = x1 + (x2 - x0) / 6;
    const c1y = clamp(y1 + (y2 - y0) / 6);
    const c2x = x2 - (x3 - x1) / 6;
    const c2y = clamp(y2 - (y3 - y1) / 6);
    d += ` C ${c1x.toFixed(2)} ${c1y.toFixed(2)}, ${c2x.toFixed(2)} ${c2y.toFixed(2)}, ${x2.toFixed(2)} ${y2.toFixed(2)}`;
  }
  return d;
}

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

/** A single smooth line with a soft shaded area beneath it.
 *  data: [{ label, value }]  tone: a theme colour name. */
export function LineChart({ data, tone = 'leaf', height = 150, format = compact, suffix = '' }) {
  const uid = useId().replace(/[:]/g, '');
  const W = 640;
  const H = height;
  const pad = { l: 40, r: 12, t: 12, b: 24 };
  const max = Math.max(1, ...data.map((d) => d.value || 0));
  const innerW = W - pad.l - pad.r;
  const innerH = H - pad.t - pad.b;
  const x = (i) => pad.l + (data.length < 2 ? innerW / 2 : (i / (data.length - 1)) * innerW);
  const y = (v) => pad.t + innerH - ((v || 0) / max) * innerH;
  const xs = data.map((_, i) => x(i));
  const ys = data.map((d) => y(d.value));
  const baseline = y(0);
  const path = smoothPath(xs, ys, pad.t, baseline);

  return (
    <figure className="chart">
      <svg viewBox={`0 0 ${W} ${H}`} className="chart__svg" role="img" aria-label="trend">
        <defs>
          <linearGradient id={`${uid}-g`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" style={{ stopColor: toneColor(tone), stopOpacity: 0.32 }} />
            <stop offset="55%" style={{ stopColor: toneColor(tone), stopOpacity: 0.1 }} />
            <stop offset="100%" style={{ stopColor: toneColor(tone), stopOpacity: 0 }} />
          </linearGradient>
        </defs>

        {[0, 0.5, 1].map((f) => (
          <g key={f}>
            <line x1={pad.l} x2={W - pad.r} y1={y(max * f)} y2={y(max * f)} className="chart__grid" />
            <text x={pad.l - 6} y={y(max * f) + 4} textAnchor="end" className="chart__tick">{format(max * f)}{suffix}</text>
          </g>
        ))}

        {xs.length > 1 && (
          <path className="chart__area" fill={`url(#${uid}-g)`}
            d={`${path} L ${xs[xs.length - 1]},${baseline} L ${xs[0]},${baseline} Z`} />
        )}
        <path d={path} fill="none" className={`chart__line chart__line--${tone}`} />

        {data.map((d, i) => (
          <g key={d.label + i}>
            <circle cx={x(i)} cy={y(d.value)} r="3.4" className={`chart__halo chart__halo--${tone}`} />
            <circle cx={x(i)} cy={y(d.value)} r="1.8" className={`chart__point chart__point--${tone}`}>
              <title>{`${d.label}: ${d.value}${suffix}`}</title>
            </circle>
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

/** A pie chart: a filled circle cut into coloured slices. items: [{ label, value, text }] */
export function Pie({ items, format = compact, showValues = true }) {
  const slices = items.filter((i) => (Number(i.value) || 0) > 0);
  const total = slices.reduce((s, i) => s + (Number(i.value) || 0), 0);
  const R = 16.5;

  // Rich version of each theme colour, from light to deep, so the slices
  // shine the way the green and gold in the flag do.
  const GRADS = [
    ['#2E9B6C', '#1F6B4D'], // leaf  (savings)
    ['#F5CD63', '#DEA821'], // maize (welfare)
    ['#E26A4E', '#B23A2E'], // flame (fines)
    ['#4C8FC9', '#2A5D8F'], // sky   (interest)
  ];

  const at = (deg) => {
    const a = ((deg - 90) * Math.PI) / 180;
    return [18 + R * Math.cos(a), 18 + R * Math.sin(a)];
  };
  let angle = 0;

  return (
    <figure className="pie">
      {total > 0 ? (
        <>
          <svg viewBox="0 0 36 36" className="pie__svg" role="img" aria-label="contribution overview">
            <defs>
              {GRADS.map(([from, to], i) => (
                <linearGradient key={`pie-g${i + 1}`} id={`pie-g${i + 1}`}
                  gradientUnits="userSpaceOnUse" x1="2" y1="2" x2="34" y2="34">
                  <stop offset="0%" stopColor={from} />
                  <stop offset="100%" stopColor={to} />
                </linearGradient>
              ))}
            </defs>
            {slices.map((it) => {
              const frac = (Number(it.value) || 0) / total;
              const start = angle;
              const end = angle + frac * 360;
              angle = end;
              const fill = `url(#pie-g${(items.indexOf(it) % GRADS.length) + 1})`;

              if (frac >= 0.9999) {
                return <circle key={it.label} cx="18" cy="18" r={R} fill={fill} />;
              }
              const [x1, y1] = at(start);
              const [x2, y2] = at(end);
              const large = end - start > 180 ? 1 : 0;
              const d = `M 18 18 L ${x1.toFixed(3)} ${y1.toFixed(3)} `
                + `A ${R} ${R} 0 ${large} 1 ${x2.toFixed(3)} ${y2.toFixed(3)} Z`;
              return (
                <path key={it.label} d={d} fill={fill} className="pie__slice">
                  <title>{`${it.label}: ${format(it.value)}`}</title>
                </path>
              );
            })}
          </svg>
          <figcaption className="pie__legend">
            {items.map((it, i) => (
              <span key={it.label} className={`pie__key pie__key--c${(i % GRADS.length) + 1}`}>
                <i className="pie__dot" />
                <span className="pie__keyLabel">{it.label}</span>
                {showValues && <strong className="pie__keyValue money">{it.text ?? format(it.value)}</strong>}
              </span>
            ))}
          </figcaption>
        </>
      ) : (
        <p className="muted">—</p>
      )}
    </figure>
  );
}

/** Several lines on one axis.
 *  data: [{ label, ...keys }]  series: [{ key, label, tone }]
 *  Smooth curves with a soft gradient shading beneath each one. */
export function MultiLineChart({ data, series, height = 230, format = compact, suffix = '' }) {
  const uid = useId().replace(/[:]/g, '');
  const W = 640;
  const H = height;
  const pad = { l: 44, r: 14, t: 12, b: 26 };
  const max = Math.max(1, ...data.flatMap((d) => series.map((s) => Number(d[s.key] || 0))));
  const innerW = W - pad.l - pad.r;
  const innerH = H - pad.t - pad.b;
  const x = (i) => pad.l + (data.length < 2 ? innerW / 2 : (i / (data.length - 1)) * innerW);
  const y = (v) => pad.t + innerH - ((v || 0) / max) * innerH;
  const xs = data.map((_, i) => x(i));
  const baseline = y(0);
  const ysFor = (s) => data.map((d) => y(Number(d[s.key] || 0)));

  return (
    <figure className="chart">
      <svg viewBox={`0 0 ${W} ${H}`} className="chart__svg" role="img"
        aria-label={series.map((s) => s.label).join(', ')}>
        <defs>
          {series.map((s, j) => (
            <linearGradient key={s.key} id={`${uid}-g${j}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" style={{ stopColor: toneColor(s.tone), stopOpacity: 0.32 }} />
              <stop offset="55%" style={{ stopColor: toneColor(s.tone), stopOpacity: 0.1 }} />
              <stop offset="100%" style={{ stopColor: toneColor(s.tone), stopOpacity: 0 }} />
            </linearGradient>
          ))}
        </defs>

        {[0, 0.5, 1].map((f) => (
          <g key={f}>
            <line x1={pad.l} x2={W - pad.r} y1={y(max * f)} y2={y(max * f)} className="chart__grid" />
            <text x={pad.l - 6} y={y(max * f) + 4} textAnchor="end" className="chart__tick">{format(max * f)}</text>
          </g>
        ))}
        {data.map((d, i) => (
          (data.length <= 14 || i % Math.ceil(data.length / 12) === 0) && (
            <text key={d.label + i} x={x(i)} y={H - 8} textAnchor="middle" className="chart__tick">{d.label}</text>
          )
        ))}

        {series.map((s, j) => {
          const path = smoothPath(xs, ysFor(s), pad.t, baseline);
          return <path key={`a-${s.key}`} className="chart__area" fill={`url(#${uid}-g${j})`}
            d={`${path} L ${xs[xs.length - 1]},${baseline} L ${xs[0]},${baseline} Z`} />;
        })}
        {series.map((s) => (
          <path key={s.key} d={smoothPath(xs, ysFor(s), pad.t, baseline)} fill="none"
            className={`chart__line chart__line--${s.tone || 'leaf'}`} />
        ))}

        {series.map((s) => data.map((d, i) => (
          <g key={`${s.key}-${i}`}>
            <circle cx={x(i)} cy={y(Number(d[s.key] || 0))} r="3.4"
              className={`chart__halo chart__halo--${s.tone || 'leaf'}`} />
            <circle cx={x(i)} cy={y(Number(d[s.key] || 0))} r="1.5"
              className={`chart__point chart__point--${s.tone || 'leaf'}`}>
              <title>{`${d.label} · ${s.label}: ${Number(d[s.key] || 0).toLocaleString('en-US')}${suffix}`}</title>
            </circle>
          </g>
        )))}
      </svg>
      <figcaption className="chart__legend">
        {series.map((s) => (
          <span key={s.key} className="chart__key">
            <i className={`chart__dot chart__dot--${s.tone || 'leaf'}`} />{s.label}
          </span>
        ))}
      </figcaption>
    </figure>
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

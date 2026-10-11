import { monthLong, shortDate } from '../utils/format.js';
import './GroupedList.css';

/**
 * Turn a flat list of dated rows into Month -> Date -> rows, with the names
 * inside each date in alphabetical order. Latest month and day come first.
 */
export function groupByMonthDate(items, dateKey = 'date', nameKey = 'full_name') {
  const months = new Map();
  for (const it of items) {
    const raw = String(it[dateKey] ?? '');
    const mKey = raw.slice(0, 7);
    if (!months.has(mKey)) months.set(mKey, { key: mKey, label: monthLong(mKey), dates: new Map() });
    const m = months.get(mKey);
    const dKey = raw.slice(0, 10);
    if (!m.dates.has(dKey)) m.dates.set(dKey, { key: dKey, label: shortDate(dKey), items: [] });
    m.dates.get(dKey).items.push(it);
  }
  return [...months.values()]
    .sort((a, b) => b.key.localeCompare(a.key))
    .map((m) => ({
      key: m.key,
      label: m.label,
      dates: [...m.dates.values()]
        .sort((a, b) => b.key.localeCompare(a.key))
        .map((d) => ({
          key: d.key,
          label: d.label,
          items: nameKey
            ? [...d.items].sort((x, y) => String(x[nameKey] || '').localeCompare(String(y[nameKey] || '')))
            : d.items,
        })),
    }));
}

export default function GroupedList({
  items, dateKey = 'date', nameKey = 'full_name', listClass = 'dash__list', renderItem,
}) {
  const groups = groupByMonthDate(items, dateKey, nameKey);
  return (
    <>
      {groups.map((g) => (
        <div key={g.key} className="glist__month">
          <h3 className="glist__monthTitle">{g.label}</h3>
          {g.dates.map((d) => (
            <div key={d.key} className="glist__day">
              <h4 className="glist__dayTitle">{d.label}</h4>
              <ul className={listClass}>
                {d.items.map((it, i) => <li key={it.id ?? i}>{renderItem(it)}</li>)}
              </ul>
            </div>
          ))}
        </div>
      ))}
    </>
  );
}

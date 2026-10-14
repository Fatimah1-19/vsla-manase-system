import { useLang } from '../context/LangContext.jsx';
import EmptyState from './EmptyState.jsx';
import '../styles.css';

/**
 * The ruled table the whole app reads from.
 *
 * columns: [{ key, label, align, render, money, hideOnPhone }]
 * On a narrow screen each row folds into its own block with the column
 * label beside each value, because a 7-column table is unusable on a phone.
 */
export default function Ledger({ columns, rows, keyField = 'id', empty, onRowClick, caption, groupBy }) {
  const { t } = useLang();

  if (!rows || rows.length === 0) {
    return empty || <EmptyState title={t('common.none')} />;
  }

  // When groupBy is given, header rows are inserted whenever a group changes.
  // It returns a list like [{ key, label }] — index 0 is the top level.
  const bodyRows = [];
  const lastKeys = [];
  rows.forEach((row, i) => {
    const groups = groupBy ? groupBy(row, i) : null;
    if (groups) {
      groups.forEach((g, level) => {
        if (!g || lastKeys[level] === g.key) return;
        lastKeys.length = level + 1;
        lastKeys[level] = g.key;
        bodyRows.push(
          <tr key={`g-${level}-${g.key}`} className={`ledger__group ledger__group--${level + 1}`}>
            <td colSpan={columns.length}>{g.label}</td>
          </tr>
        );
      });
    }
    bodyRows.push(
      <tr
        key={row[keyField] ?? i}
        className={onRowClick ? 'is-clickable' : undefined}
        onClick={onRowClick ? () => onRowClick(row) : undefined}
      >
        {columns.map((c) => (
          <td
            key={c.key}
            data-label={c.label}
            className={[
              c.align === 'right' ? 'is-right' : '',
              c.money ? 'money' : '',
              c.hideOnPhone ? 'is-wide-only' : '',
            ].join(' ').trim()}
          >
            {c.render ? c.render(row) : row[c.key]}
          </td>
        ))}
      </tr>
    );
  });

  return (
    <div className="ledger-wrap">
      <table className="ledger">
        {caption && <caption className="ledger__caption">{caption}</caption>}
        <thead>
          <tr>
            {columns.map((c) => (
              <th
                key={c.key}
                scope="col"
                className={[
                  c.align === 'right' ? 'is-right' : '',
                  c.hideOnPhone ? 'is-wide-only' : '',
                ].join(' ').trim()}
              >
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{bodyRows}</tbody>
      </table>
    </div>
  );
}

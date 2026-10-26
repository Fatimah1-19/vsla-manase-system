import { useLang } from '../context/LangContext.jsx';
import { shortDate } from '../utils/format.js';
import '../styles.css';

/**
 * The letterhead shown at the top of every report and report PDF: the group's
 * logo and name on the left, the report title and period on the right.
 */
export default function ReportHeader({ title, subtitle, meta = [], className = '' }) {
  const { t } = useLang();
  const classes = ['report-head', className].filter(Boolean).join(' ');

  return (
    <header className={classes}>
      <div className="report-head__brand">
        <img className="report-head__logo" src="/images/favicon.png" alt="" />
        <div>
          <span className="report-head__name">{t('app.name')}</span>
          <span className="report-head__tagline">{t('app.tagline')}</span>
        </div>
      </div>

      <div className="report-head__titleBlock">
        <p className="report-head__eyebrow">{t('reports.title')}</p>
        <h2 className="report-head__title">{title}</h2>
        {subtitle && <p className="report-head__subtitle">{subtitle}</p>}
        {meta.length > 0 && (
          <dl className="report-head__meta">
            {meta.map((item) => (
              <div key={item.label}>
                <dt>{item.label}</dt>
                <dd>{item.value}</dd>
              </div>
            ))}
          </dl>
        )}
        <p className="report-head__date">{t('reports.reportGenerated', shortDate(new Date()))}</p>
      </div>
    </header>
  );
}

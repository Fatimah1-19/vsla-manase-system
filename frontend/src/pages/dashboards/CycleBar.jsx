import { Link } from 'react-router-dom';
import { useLang } from '../../context/LangContext.jsx';
import { money, shortDate } from '../../utils/format.js';
import './CycleBar.css';

/** How far through the year the group is, and when the box gets opened. */
export default function CycleBar({ cycle }) {
  const { t } = useLang();

  if (!cycle) {
    return <p className="notice notice--warn">{t('dashboard.noCycle')}</p>;
  }

  const done = cycle.progress >= 100;

  return (
    <section className="cyclebar">
      <div className="cyclebar__top">
        <div>
          <p className="cyclebar__label">{t('dashboard.cycleProgress')}</p>
          <p className="cyclebar__name">{cycle.cycle_name}</p>
        </div>
        <div className="cyclebar__pctwrap">
          <span className="cyclebar__pct">{cycle.progress}%</span>
          {done
            ? <span className="cyclebar__done">{t('dashboard.cycleEnded')}</span>
            : <span className="cyclebar__remaining">{t('dashboard.weeksLeft', cycle.days_remaining)}</span>}
        </div>
      </div>

      <div
        className="cyclebar__track"
        role="progressbar"
        aria-valuenow={cycle.progress}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={t('dashboard.cycleProgress')}
      >
        <div className="cyclebar__fill" style={{ width: `${cycle.progress}%` }} />
      </div>

      <div className="cyclebar__foot">
        <div className="cyclebar__dates">
          <span>{shortDate(cycle.start_date)}</span>
          <span>{shortDate(cycle.end_date)}</span>
        </div>
        <p className="cyclebar__share">{t('dashboard.shareValueLine', money(cycle.share_value))}</p>
      </div>

      {done && (
        <div className="cyclebar__ended">
          <p>{t('dashboard.timeToShareOut')}</p>
          <Link to="/app/shareout" className="btn btn--gold btn--small">{t('shareout.title')}</Link>
        </div>
      )}
    </section>
  );
}
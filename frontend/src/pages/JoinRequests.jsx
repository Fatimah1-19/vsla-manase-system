import { useCallback, useEffect, useState } from 'react';
import { api } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useLang } from '../context/LangContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { useConfirm } from '../context/ConfirmContext.jsx';
import PageHeader from '../components/PageHeader.jsx';
import Modal from '../components/Modal.jsx';
import Spinner from '../components/Spinner.jsx';
import EmptyState from '../components/EmptyState.jsx';
import { shortDate } from '../utils/format.js';
import '../styles.css';

/** Every member votes; a committee member records what the group decided. */
export default function JoinRequests() {
  const { t } = useLang();
  const { isCommittee, isSystemAdmin } = useAuth();
  const toast = useToast();
  const confirm = useConfirm();

  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(false);
  const [credentials, setCredentials] = useState(null);

  const load = useCallback(async () => { setData(await api.get('/join-requests')); }, []);
  useEffect(() => { load().catch((e) => toast.error(e.message)); }, [load, toast]);

  const questions = data?.screening_questions?.length
    ? data.screening_questions
    : (Array.isArray(t('requests.screening')) ? t('requests.screening') : []);
  const topics = t('requests.topics') || {};

  async function vote(id, choice) {
    setBusy(true);
    try {
      await api.post(`/join-requests/${id}/vote`, { vote: choice });
      await load();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function decide(request, status) {
    if (!(await confirm({ message: t('requests.confirmDecide') }))) return;
    setBusy(true);
    try {
      const res = await api.patch(`/join-requests/${request.id}`, { status });
      if (status === 'approved') {
        setCredentials({ name: request.full_name, username: res.username, smsSent: res.sms_sent });
      } else {
        toast.success(res.message);
      }
      await load();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (!data) return <Spinner />;

  const { requests, eligible_voters: voters } = data;
  const pending = requests.filter((r) => r.status === 'pending');
  const decided = requests.filter((r) => r.status !== 'pending');

  return (
    <div className="joinreq">
      <PageHeader title={t('requests.title')} subtitle={t('requests.groupDecides')} />

      {pending.length === 0 ? (
        <EmptyState title={t('requests.empty')} />
      ) : (
        <ul className="joinreq__list">
          {pending.map((r) => {
            const total = r.yes_votes + r.no_votes;
            const yesPct = total ? Math.round((r.yes_votes / total) * 100) : 0;
            return (
              <li key={r.id} className="joinreq__card">
                <header className="joinreq__head">
                  <div>
                    <h2 className="joinreq__name">{r.full_name}</h2>
                    <p className="joinreq__meta">
                      {r.phone}{r.village ? ` · ${r.village}` : ''} · {shortDate(r.created_at)}
                    </p>
                  </div>
                </header>

                {r.reason && (
                  <p className="joinreq__reason">
                    <span className="joinreq__reasonLabel">{t('requests.whyJoin')}</span>
                    {r.reason}
                  </p>
                )}

                <section className="joinreq__bg">
                  <h3 className="joinreq__bgTitle">{t('requests.background')}</h3>
                  <p className="joinreq__bgHint">{t('requests.backgroundHint')}</p>
                  <ul className="joinreq__bgList">
                    {questions.map((qq) => {
                      const answer = (r.screening || {})[qq.key];
                      const favourable = answer && qq.good && answer === qq.good;
                      return (
                        <li key={qq.key} className="joinreq__bgItem">
                          <span className="joinreq__bgQ">{topics[qq.key] || qq.q}</span>
                          <span
                            className={
                              answer
                                ? (favourable ? 'joinreq__answer is-good' : 'joinreq__answer is-bad')
                                : 'joinreq__answer'
                            }
                          >
                            {answer ? (answer === 'yes' ? t('common.yes') : t('common.no')) : '—'}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                </section>

                <div className="joinreq__tally">
                  <div className="joinreq__bar">
                    <div className="joinreq__barYes" style={{ width: `${yesPct}%` }} />
                  </div>
                  <p className="joinreq__tallyText">
                    {t('requests.tally')}: <strong>{r.yes_votes}</strong> {t('common.yes').toLowerCase()} ·{' '}
                    <strong>{r.no_votes}</strong> {t('common.no').toLowerCase()}
                    <span className="muted"> ({total} of {voters})</span>
                  </p>
                </div>

                {!isSystemAdmin && (
                <div className="joinreq__vote">
                  <span className="joinreq__voteLabel">{t('requests.vote')}</span>
                  <div className="joinreq__voteBtns">
                    <button
                      type="button"
                      className={r.my_vote === 'yes' ? 'joinreq__voteBtn is-yes' : 'joinreq__voteBtn'}
                      onClick={() => vote(r.id, 'yes')}
                      disabled={busy}
                      aria-pressed={r.my_vote === 'yes'}
                    >
                      {t('requests.voteYes')}
                    </button>
                    <button
                      type="button"
                      className={r.my_vote === 'no' ? 'joinreq__voteBtn is-no' : 'joinreq__voteBtn'}
                      onClick={() => vote(r.id, 'no')}
                      disabled={busy}
                      aria-pressed={r.my_vote === 'no'}
                    >
                      {t('requests.voteNo')}
                    </button>
                  </div>
                </div>
                )}

                {isCommittee && (
                  <div className="joinreq__decide">
                    <button type="button" className="btn" disabled={busy} onClick={() => decide(r, 'approved')}>
                      {t('requests.accept')}
                    </button>
                    <button type="button" className="btn btn--danger" disabled={busy} onClick={() => decide(r, 'rejected')}>
                      {t('requests.decline')}
                    </button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {decided.length > 0 && (
        <section className="joinreq__decided">
          <h2 className="joinreq__h2">{t('requests.decided')}</h2>
          <ul className="joinreq__decidedList">
            {decided.map((r) => (
              <li key={r.id}>
                <span>{r.full_name}</span>
                <span className={r.status === 'approved' ? 'tag tag--green' : 'tag tag--grey'}>
                  {r.status === 'approved' ? t('common.yes') : t('common.no')}
                </span>
                <span className="muted">{shortDate(r.decided_at)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <Modal
        open={!!credentials}
        title={t('admin.accountOpened')}
        onClose={() => setCredentials(null)}
        footer={<button type="button" className="btn" onClick={() => setCredentials(null)}>{t('common.close')}</button>}
      >
        {credentials && (
          <>
            <dl className="joinreq__creds">
              <div><dt>{t('common.name')}</dt><dd>{credentials.name}</dd></div>
              <div><dt>{t('login.username')}</dt><dd><code>{credentials.username}</code></dd></div>
            </dl>
            <p className={credentials.smsSent ? 'notice notice--good' : 'notice notice--danger'}>
              {credentials.smsSent ? t('admin.passwordTexted') : t('admin.passwordNotTexted')}
            </p>
          </>
        )}
      </Modal>
    </div>
  );
}

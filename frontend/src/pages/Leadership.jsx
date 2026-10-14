import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useLang } from '../context/LangContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { useConfirm } from '../context/ConfirmContext.jsx';
import PageHeader from '../components/PageHeader.jsx';
import Modal from '../components/Modal.jsx';
import Spinner from '../components/Spinner.jsx';
import EmptyState from '../components/EmptyState.jsx';
import MemberAvatar from '../components/MemberAvatar.jsx';
import Icon from '../components/Icon.jsx';
import { shortDate } from '../utils/format.js';
import '../styles.css';

const STATUS_TAG = { open: 'tag--green', passed: 'tag--gold', lapsed: 'tag--grey', tie: 'tag--red', withdrawn: 'tag--grey' };
const daysTo = (date) => Math.ceil((new Date(date) - Date.now()) / 86400000);

/**
 * Filling an empty office (chairperson, treasurer, secretary) by a vote of all
 * the members. The chairperson opens and carries out the election; if the
 * chairperson's seat is the one that is empty, the treasurer or secretary acts.
 */
export default function Leadership() {
  const { t } = useLang();
  const { user } = useAuth();
  const toast = useToast();
  const confirm = useConfirm();
  const [params, setParams] = useSearchParams();

  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(false);
  const [showOpen, setShowOpen] = useState(false);
  const [form, setForm] = useState({ office: '', reason: '', candidates: [], notify: true });
  const [tiePick, setTiePick] = useState(null);
  const [chosen, setChosen] = useState('');

  const load = useCallback(async () => { setData(await api.get('/office-votes')); }, []);
  useEffect(() => { load().catch((e) => toast.error(e.message)); }, [load, toast]);

  // A "fill this office" link from the Members page arrives as ?office=secretary.
  useEffect(() => {
    const preset = params.get('office');
    if (!preset || !data || !data.can_open || !data.vacant_offices.includes(preset)) return;
    setForm({ office: preset, reason: '', candidates: [], notify: true });
    setShowOpen(true);
    params.delete('office');
    setParams(params, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  const startElection = (office = '') => {
    setForm({ office, reason: '', candidates: [], notify: true });
    setShowOpen(true);
  };

  const toggleCandidate = (userId) => setForm((f) => ({
    ...f,
    candidates: f.candidates.includes(userId)
      ? f.candidates.filter((id) => id !== userId)
      : [...f.candidates, userId],
  }));

  async function submitOpen(e) {
    e.preventDefault();
    if (form.candidates.length < 2) { toast.error(t('leaders.needTwo')); return; }
    setBusy(true);
    try {
      const res = await api.post('/office-votes', {
        office: form.office,
        reason: form.reason,
        candidate_user_ids: form.candidates,
        notify_members: form.notify,
      });
      toast.success(res.message);
      setShowOpen(false);
      await load();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function cast(voteId, candidateUserId) {
    setBusy(true);
    try {
      await api.post(`/office-votes/${voteId}/ballot`, { candidate_user_id: candidateUserId });
      await load();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function withdraw(item) {
    if (!(await confirm({ message: t('leaders.confirmWithdraw'), danger: true }))) return;
    setBusy(true);
    try {
      const res = await api.patch(`/office-votes/${item.id}/withdraw`);
      toast.success(res.message);
      await load();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function carryOut(item, chosenUserId) {
    const name = item.status === 'tie'
      ? (item.candidates.find((c) => c.candidate_user_id === Number(chosenUserId))?.full_name || '')
      : item.winner_name;
    const ok = await confirm({
      message: t('leaders.confirmCarry', name, t(`leaders.offices.${item.office}`)),
      danger: true,
    });
    if (!ok) return;
    setBusy(true);
    try {
      const body = item.status === 'tie' ? { chosen_user_id: Number(chosenUserId) } : {};
      const res = await api.post(`/office-votes/${item.id}/execute`, body);
      toast.success(res.message);
      setTiePick(null);
      await load();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  }

  const openVotes = useMemo(() => (data ? data.votes.filter((v) => v.status === 'open') : []), [data]);
  const pastVotes = useMemo(() => (data ? data.votes.filter((v) => v.status !== 'open') : []), [data]);

  if (!data) return <Spinner />;

  const mayRunOffice = (office) => user?.role === 'admin'
    || (office === 'admin' && data.vacant_offices.includes('admin') && ['treasurer', 'secretary'].includes(user?.role));

  return (
    <div className="leaders">
      <PageHeader
        title={t('leaders.title')}
        subtitle={user?.role === 'admin' ? t('leaders.chairSubtitle') : t('leaders.subtitle')}
      />

      {user?.role !== 'admin' && data.can_open && (
        <p className="notice notice--warn">{t('leaders.actingNote')}</p>
      )}

      {data.can_open && (
        <section className="leaders__vacant">
          <h2 className="leaders__h2">{t('leaders.vacantTitle')}</h2>
          {data.vacant_offices.length === 0 ? (
            <p className="muted">{t('leaders.vacantNone')}</p>
          ) : (
            <ul className="leaders__vacantList">
              {data.vacant_offices.map((o) => (
                <li key={o}>
                  <span className="leaders__vacantName">
                    <Icon name="members" size={18} />
                    {t('leaders.vacant', t(`leaders.offices.${o}`))}
                  </span>
                  <button type="button" className="btn btn--small btn--gold" onClick={() => startElection(o)}>
                    {t('leaders.startElection')}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      <section>
        <h2 className="leaders__h2">{t('leaders.openTitle')}</h2>
        {openVotes.length === 0 ? (
          <EmptyState title={t(data.votes.length === 0 ? 'leaders.none' : 'leaders.noneOpen')} />
        ) : (
          <ul className="leaders__list">
            {openVotes.map((v) => {
              const pct = v.eligible_voters ? Math.round((v.votes_cast / v.eligible_voters) * 100) : 0;
              const quorumMet = v.votes_cast >= v.quorum_needed;
              return (
                <li key={v.id} className={`leaders__card leaders__card--${v.office}`}>
                  <header className="leaders__head">
                    <div>
                      <h3 className="leaders__office">{t(`leaders.offices.${v.office}`)}</h3>
                      <p className="leaders__meta">
                        {v.round > 1 && <span className="tag tag--grey">{t('leaders.roundTwo')}</span>}{' '}
                        {t('leaders.openedBy', v.opened_by_name, shortDate(v.opened_at))}
                      </p>
                    </div>
                    <span className={`tag ${STATUS_TAG[v.status]}`}>{t(`leaders.status.${v.status}`)}</span>
                  </header>

                  <p className="leaders__reason">
                    <span className="leaders__label">{t('leaders.reason')}</span>
                    {v.reason}
                  </p>

                  <div className="leaders__tally">
                    <div className="leaders__bar">
                      <div className="leaders__barFill" style={{ width: `${pct}%` }} />
                    </div>
                    <p className="leaders__turnout">{t('leaders.turnout', v.votes_cast, v.eligible_voters)}</p>
                    <p className={quorumMet ? 'leaders__quorum is-met' : 'leaders__quorum'}>
                      {t('leaders.quorumNote', v.quorum_needed)}
                    </p>
                    <p className="leaders__hidden">{t('leaders.hiddenNote')}</p>
                  </div>

                  <p className="leaders__deadline">{t('leaders.closesIn', daysTo(v.closes_at))}</p>

                  <ul className="leaders__cands">
                    {v.candidates.map((c) => {
                      const mine = v.my_ballot === c.candidate_user_id;
                      return (
                        <li key={c.candidate_user_id} className={mine ? 'leaders__cand is-mine' : 'leaders__cand'}>
                          <MemberAvatar memberId={c.member_id} hasAvatar={c.has_avatar} name={c.full_name} size={36} />
                          <span className="leaders__candName">
                            {c.full_name}
                            <span className="muted"> · {c.membership_number}</span>
                          </span>
                          {v.can_vote && (
                            <button type="button" className="btn btn--small" disabled={busy}
                              onClick={() => cast(v.id, c.candidate_user_id)}>
                              {t('leaders.vote')}
                            </button>
                          )}
                          {mine && <span className="tag tag--green">{t('leaders.voted')}</span>}
                        </li>
                      );
                    })}
                  </ul>

                  {v.my_ballot
                    ? <p className="leaders__note">{t('leaders.once')}</p>
                    : (!v.can_vote && <p className="leaders__cannot">{t('leaders.cannotVote')}</p>)}

                  {mayRunOffice(v.office) && (
                    <button type="button" className="btn btn--ghost btn--small" disabled={busy}
                      onClick={() => withdraw(v)}>
                      {t('leaders.withdraw')}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {pastVotes.length > 0 && (
        <section className="leaders__past">
          <h2 className="leaders__h2">{t('leaders.historyTitle')}</h2>
          <ul className="leaders__list">
            {pastVotes.map((v) => (
              <li key={v.id} className={`leaders__card leaders__card--${v.office} leaders__card--done`}>
                <header className="leaders__head">
                  <div>
                    <h3 className="leaders__office">{t(`leaders.offices.${v.office}`)}</h3>
                    <p className="leaders__meta">
                      {v.round > 1 && <span className="tag tag--grey">{t('leaders.roundTwo')}</span>}{' '}
                      {t('leaders.openedBy', v.opened_by_name, shortDate(v.opened_at))}
                    </p>
                  </div>
                  <span className={`tag ${STATUS_TAG[v.status]}`}>{t(`leaders.status.${v.status}`)}</span>
                </header>

                <p className="leaders__reason">
                  <span className="leaders__label">{t('leaders.reason')}</span>
                  {v.reason}
                </p>

                {v.status === 'passed' && (
                  <p className="leaders__winner">
                    <Icon name="rules" size={18} /> {t('leaders.winner', v.winner_name)}
                  </p>
                )}
                {v.status === 'tie' && (
                  <p className="leaders__tie">{v.round < 2 ? t('leaders.runOff') : t('leaders.tiePick')}</p>
                )}

                <ul className="leaders__cands">
                  {v.candidates.map((c) => (
                    <li key={c.candidate_user_id} className="leaders__cand">
                      <MemberAvatar memberId={c.member_id} hasAvatar={c.has_avatar} name={c.full_name} size={32} />
                      <span className="leaders__candName">{c.full_name}</span>
                      <span className="leaders__count">{v.counts?.[c.candidate_user_id] || 0}</span>
                    </li>
                  ))}
                </ul>

                {v.executed_at ? (
                  <p className="leaders__done">
                    <Icon name="rules" size={16} /> {t('leaders.inOfficeSince')} {shortDate(v.executed_at)}
                  </p>
                ) : v.can_execute && (
                  v.status === 'tie' ? (
                    <button type="button" className="btn btn--gold" disabled={busy}
                      onClick={() => { setTiePick(v); setChosen(''); }}>
                      {t('leaders.chooseWinner')}
                    </button>
                  ) : (
                    <button type="button" className="btn btn--gold" disabled={busy} onClick={() => carryOut(v)}>
                      {t('leaders.carryOut')}
                    </button>
                  )
                )}

                {!v.executed_at && v.status === 'passed' && !v.can_execute && (
                  <p className="leaders__note">
                    {mayRunOffice(v.office) ? t('leaders.awaitingYou') : t('leaders.awaitingCarry')}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* ---- start an election ---- */}
      <Modal
        open={showOpen}
        title={t('leaders.startElection')}
        onClose={() => setShowOpen(false)}
        footer={
          <>
            <button type="button" className="btn btn--ghost" onClick={() => setShowOpen(false)}>{t('common.cancel')}</button>
            <button type="submit" form="election-form" className="btn btn--sky"
              disabled={busy || !form.office || form.reason.trim().length < 10 || form.candidates.length < 2}>
              {busy ? t('common.saving') : t('leaders.openVote')}
            </button>
          </>
        }
      >
        <form id="election-form" onSubmit={submitOpen} noValidate>
          <div className="form-row">
            <div>
              <label className="field-label" htmlFor="elec-office">{t('leaders.office')}</label>
              <select id="elec-office" value={form.office} onChange={(e) => setForm((f) => ({ ...f, office: e.target.value }))} required>
                <option value="">—</option>
                {data.vacant_offices.map((o) => (
                  <option key={o} value={o}>{t(`leaders.offices.${o}`)}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="form-row">
            <div>
              <label className="field-label" htmlFor="elec-reason">{t('leaders.reason')}</label>
              <textarea id="elec-reason" rows="3" placeholder={t('leaders.reasonPlaceholder')}
                value={form.reason} onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))} />
            </div>
          </div>

          <div className="form-row">
            <div>
              <span className="field-label">{t('leaders.candidates')}</span>
              <span className="field-hint">{t('leaders.candidatePool')} — {t('leaders.needTwo')}</span>
              <ul className="leaders__pool">
                {data.candidate_pool.map((c) => {
                  const on = form.candidates.includes(c.user_id);
                  return (
                    <li key={c.user_id}>
                      <label className={on ? 'leaders__pick is-on' : 'leaders__pick'}>
                        <input type="checkbox" checked={on} onChange={() => toggleCandidate(c.user_id)} />
                        <MemberAvatar memberId={c.member_id} hasAvatar={c.has_avatar} name={c.full_name} size={32} />
                        <span className="leaders__candName">
                          {c.full_name}
                          <span className="muted"> · {c.membership_number}</span>
                        </span>
                      </label>
                    </li>
                  );
                })}
                {data.candidate_pool.length === 0 && <li className="muted">{t('leaders.candidatePool')}</li>}
              </ul>
            </div>
          </div>

          <label className="settings__switch">
            <input type="checkbox" checked={form.notify} onChange={(e) => setForm((f) => ({ ...f, notify: e.target.checked }))} />
            <span>{t('leaders.notify')}</span>
          </label>

          <p className="notice notice--warn">{t('leaders.openNote', data.rules.voting_days)}</p>
        </form>
      </Modal>

      {/* ---- the chairperson settles a tie ---- */}
      <Modal
        open={!!tiePick}
        title={t('leaders.chooseWinner')}
        onClose={() => setTiePick(null)}
        footer={
          <>
            <button type="button" className="btn btn--ghost" onClick={() => setTiePick(null)}>{t('common.cancel')}</button>
            <button type="button" className="btn btn--gold" disabled={busy || !chosen}
              onClick={() => carryOut(tiePick, chosen)}>
              {t('leaders.carryOut')}
            </button>
          </>
        }
      >
        <ul className="leaders__pool">
          {tiePick?.candidates.map((c) => {
            const on = Number(chosen) === c.candidate_user_id;
            return (
              <li key={c.candidate_user_id}>
                <label className={on ? 'leaders__pick is-on' : 'leaders__pick'}>
                  <input type="radio" name="tie" checked={on} onChange={() => setChosen(String(c.candidate_user_id))} />
                  <MemberAvatar memberId={c.member_id} hasAvatar={c.has_avatar} name={c.full_name} size={32} />
                  <span className="leaders__candName">{c.full_name}</span>
                  <span className="leaders__count">{tiePick.counts?.[c.candidate_user_id] || 0}</span>
                </label>
              </li>
            );
          })}
        </ul>
      </Modal>
    </div>
  );
}

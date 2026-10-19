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
import { money, shortDate } from '../utils/format.js';
import '../styles.css';

const OUTCOME_TAG = { passed: 'tag--green', rejected: 'tag--red', lapsed: 'tag--gold' };

export default function Cases() {
  const { t } = useLang();
  const { isAdmin, canRecordMoney, user } = useAuth();
  const toast = useToast();
  const confirm = useConfirm();
  const [params, setParams] = useSearchParams();

  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(false);

  const [members, setMembers] = useState([]);
  const [openForm, setOpenForm] = useState(false);
  const [form, setForm] = useState({ member_id: '', action: 'suspend', reason: '', member_response: '' });

  const [answerFor, setAnswerFor] = useState(null);
  const [answer, setAnswer] = useState('');

  const load = useCallback(async () => { setData(await api.get('/cases')); }, []);
  useEffect(() => { load().catch((e) => toast.error(e.message)); }, [load, toast]);

  // The chairperson can jump straight here from a member's card.
  useEffect(() => {
    const preset = params.get('member');
    if (!preset || !isAdmin) return;
    const presetAction = ['suspend', 'dismiss', 'reinstate'].includes(params.get('action')) ? params.get('action') : 'suspend';
    setForm((f) => ({ ...f, member_id: preset, action: presetAction }));
    setOpenForm(true);
    loadMembers();
    params.delete('member');
    params.delete('action');
    setParams(params, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin]);

  const loadMembers = useCallback(async () => {
    try {
      const list = await api.get('/members?all=true');
      setMembers(list);
    } catch (err) {
      toast.error(err.message);
    }
  }, [toast]);

  function startOpen() {
    setOpenForm(true);
    if (!members.length) loadMembers();
  }

  async function submitOpen(e) {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await api.post('/cases', {
        member_id: Number(form.member_id),
        action: form.action,
        reason: form.reason,
        member_response: form.member_response || undefined,
      });
      toast.success(res.message);
      setOpenForm(false);
      setForm({ member_id: '', action: 'suspend', reason: '', member_response: '' });
      await load();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function vote(id, choice) {
    setBusy(true);
    try {
      await api.post(`/cases/${id}/vote`, { vote: choice });
      await load();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function carryOut(item) {
    if (!(await confirm({ message: t('cases.confirmCarry'), danger: true }))) return;
    setBusy(true);
    try {
      const res = await api.post(`/cases/${item.id}/execute`);
      toast.success(res.message);
      await load();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function recordSettled(item) {
    if (!(await confirm({ message: t('cases.confirmSettled') }))) return;
    setBusy(true);
    try {
      const res = await api.post(`/cases/${item.id}/settlement-paid`);
      toast.success(res.message);
      await load();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function submitAnswer(e) {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await api.patch(`/cases/${answerFor.id}/response`, { text: answer });
      toast.success(res.message);
      setAnswerFor(null);
      setAnswer('');
      await load();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  }

  const open = useMemo(() => (data ? data.cases.filter((c) => c.status === 'open') : []), [data]);
  const decided = useMemo(() => (data ? data.cases.filter((c) => c.status !== 'open') : []), [data]);

  if (!data) return <Spinner />;

  return (
    <div className="cases">
      <PageHeader
        title={t('cases.title')}
        subtitle={t('cases.subtitle')}
        action={isAdmin && (
          <button type="button" className="btn btn--sky" onClick={startOpen}>{t('cases.open')}</button>
        )}
      />

      {open.length === 0 ? (
        <EmptyState title={t('cases.empty')} />
      ) : (
        <ul className="cases__list">
          {open.map((c) => {
            const turnoutPct = c.eligible_voters ? Math.round((c.votes_cast / c.eligible_voters) * 100) : 0;
            const quorumMet = c.votes_cast >= c.quorum_needed;
            const isMine = user?.member_id && user.member_id === c.member_id;
            return (
              <li key={c.id} className={`cases__card cases__card--${c.action}`}>
                <header className="cases__head">
                  <div>
                    <h2 className="cases__name">{c.subject_name}</h2>
                    <p className="cases__meta">
                      <span className="tag tag--grey">{c.membership_number}</span>{' '}
                      {shortDate(c.opened_at)}
                    </p>
                  </div>
                  <span className={`cases__action cases__action--${c.action}`}>{t(`cases.${c.action}`)}</span>
                </header>

                <p className="cases__reason">
                  <span className="cases__label">{t('cases.reason')}</span>
                  {c.reason}
                </p>

                {c.member_response && (
                  <p className="cases__answerBox">
                    <span className="cases__label">{t('cases.answered')}</span>
                    {c.member_response}
                  </p>
                )}

                <div className="cases__tally">
                  <div className="cases__bar">
                    <div className="cases__barYes" style={{ width: `${turnoutPct}%` }} />
                  </div>
                  <p className="cases__tallyText">
                    <span className="muted">{t('cases.turnout', c.votes_cast, c.eligible_voters)}</span>
                  </p>
                  <p className={quorumMet ? 'cases__quorum is-met' : 'cases__quorum'}>
                    {t('cases.needQuorum', c.quorum_needed)}
                  </p>
                </div>

                <p className="cases__deadline">{t('cases.votingUntil')}: <strong>{shortDate(c.closes_at)}</strong></p>

                {isMine ? (
                  <div className="cases__vote">
                    <span className="cases__label">{t('cases.answered')}</span>
                    {c.member_response ? (
                      <p className="cases__mine">{c.member_response}</p>
                    ) : (
                      <button type="button" className="btn btn--ghost" disabled={busy}
                        onClick={() => { setAnswerFor(c); setAnswer(''); }}>
                        {t('cases.writeReply')}
                      </button>
                    )}
                  </div>
                ) : c.can_vote ? (
                  <div className="cases__vote">
                    <span className="cases__label">{t('cases.yourVote')}</span>
                    <div className="cases__voteBtns">
                      <button type="button" disabled={busy} className="cases__voteBtn"
                        onClick={() => vote(c.id, 'yes')}>{t('cases.voteYes')}</button>
                      <button type="button" disabled={busy} className="cases__voteBtn"
                        onClick={() => vote(c.id, 'no')}>{t('cases.voteNo')}</button>
                    </div>
                  </div>
                ) : c.voted ? (
                  <p className="cases__cannot">{t('cases.youVoted')}</p>
                ) : (
                  <p className="cases__cannot">{t('cases.cannotVote')}</p>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {decided.length > 0 && (
        <section className="cases__decided">
          <h2 className="cases__h2">{t('cases.decidedTitle')}</h2>
          <ul className="cases__decidedList">
            {decided.map((c) => (
              <li key={c.id}>
                <span className="cases__decidedName">
                  {c.subject_name}
                  <span className="muted"> · {t(`cases.${c.action}`)}</span>
                </span>
                <span className={`tag ${OUTCOME_TAG[c.status] || 'tag--grey'}`}>{t(`cases.${c.status}`)}</span>
                <span className="muted">{shortDate(c.decided_at)}</span>
                {c.yes_votes != null && (
                  <span className="cases__tallyVotes">{t('cases.voteTally', c.yes_votes, c.no_votes)}</span>
                )}
                {c.settlement_amount != null && Number(c.settlement_amount) > 0 && (
                  <span className="cases__settle">{t('cases.settlement')}: {money(c.settlement_amount)}</span>
                )}
                {Number(c.settlement_unrecovered) > 0 && (
                  <span className="cases__settle cases__settle--owe">{t('cases.unrecovered')}: {money(c.settlement_unrecovered)}</span>
                )}
                {c.status === 'passed' && !c.executed_at && isAdmin && (
                  <button type="button" className="btn btn--gold btn--small" disabled={busy}
                    onClick={() => carryOut(c)}>{t('cases.carryOut')}</button>
                )}
                {c.action === 'dismiss' && c.status === 'passed' && c.executed_at && !c.settlement_paid_on
                  && c.settlement_amount != null && Number(c.settlement_amount) > 0 && canRecordMoney && (
                  <button type="button" className="btn btn--small" disabled={busy}
                    onClick={() => recordSettled(c)}>{t('cases.recordSettled')}</button>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* ---- open a case ---- */}
      <Modal
        open={openForm}
        title={t('cases.open')}
        onClose={() => setOpenForm(false)}
        footer={
          <>
            <button type="button" className="btn btn--ghost" onClick={() => setOpenForm(false)}>{t('common.cancel')}</button>
            <button type="submit" form="case-form" className="btn btn--sky" disabled={busy || !form.member_id || !form.reason.trim()}>
              {busy ? t('common.saving') : t('cases.open')}
            </button>
          </>
        }
      >
        <form id="case-form" onSubmit={submitOpen} noValidate>
          <div className="form-row">
            <div>
              <label className="field-label" htmlFor="case-member">{t('cases.member')}</label>
              <select id="case-member" value={form.member_id} onChange={(e) => setForm((f) => ({ ...f, member_id: e.target.value }))} required>
                <option value="">—</option>
                {members.map((m) => {
                  const isSelf = user?.member_id === m.id;
                  return (
                    <option key={m.id} value={m.id} disabled={isSelf}>
                      {m.full_name}{isSelf ? ` (${t('cases.self')})` : ''} — {t(`roles.${m.role}`)} · {t(`cases.status.${m.status}`)}
                    </option>
                  );
                })}
              </select>
              <span className="field-hint">{t('cases.officeHolder')}</span>
            </div>
          </div>

          <div className="form-row">
            <div>
              <label className="field-label" htmlFor="case-action">{t('cases.action')}</label>
              <select id="case-action" value={form.action} onChange={(e) => setForm((f) => ({ ...f, action: e.target.value }))}>
                <option value="suspend">{t('cases.suspend')}</option>
                <option value="dismiss">{t('cases.dismiss')}</option>
                <option value="reinstate">{t('cases.reinstate')}</option>
              </select>
            </div>
          </div>

          <div className="form-row">
            <div>
              <label className="field-label" htmlFor="case-reason">{t('cases.reason')}</label>
              <textarea id="case-reason" rows="3" placeholder={t('cases.reasonPlaceholder')}
                value={form.reason} onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))} />
            </div>
          </div>

          <p className="notice notice--warn">{t('cases.finishHint')}</p>
        </form>
      </Modal>

      {/* ---- the member gives her side ---- */}
      <Modal
        open={!!answerFor}
        title={t('cases.answered')}
        onClose={() => setAnswerFor(null)}
        footer={
          <>
            <button type="button" className="btn btn--ghost" onClick={() => setAnswerFor(null)}>{t('common.cancel')}</button>
            <button type="submit" form="case-answer" className="btn" disabled={busy || !answer.trim()}>
              {busy ? t('common.saving') : t('common.save')}
            </button>
          </>
        }
      >
        <form id="case-answer" onSubmit={submitAnswer} noValidate>
          <div className="form-row">
            <div>
              <label className="field-label" htmlFor="case-response">{t('cases.answered')}</label>
              <textarea id="case-response" rows="4" placeholder={t('cases.responsePlaceholder')}
                value={answer} onChange={(e) => setAnswer(e.target.value)} />
            </div>
          </div>
        </form>
      </Modal>
    </div>
  );
}

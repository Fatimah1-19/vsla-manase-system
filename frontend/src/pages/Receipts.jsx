import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useLang } from '../context/LangContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import PageHeader from '../components/PageHeader.jsx';
import ReportHeader from '../components/ReportHeader.jsx';
import Spinner from '../components/Spinner.jsx';
import EmptyState from '../components/EmptyState.jsx';
import Icon from '../components/Icon.jsx';
import { money, shortDate } from '../utils/format.js';
import { exportReportAsPdf } from '../utils/reportPdf.js';
import '../styles.css';

export default function Receipts() {
  const { t } = useLang();
  const { user } = useAuth();
  const toast = useToast();
  const [fees, setFees] = useState(null);
  const [busy, setBusy] = useState(false);
  const receiptRef = useRef(null);

  const load = useCallback(async () => {
    try {
      const res = await api.get('/registration-fees');
      setFees(res);
    } catch (err) {
      toast.error(err.message);
    }
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  const myFee = fees?.members?.find((m) => {
    if (!user) return false;
    if (m.user_id && user.id && m.user_id === user.id) return true;
    if (m.phone && user.phone && m.phone === user.phone) return true;
    if (m.membership_number && user.membership_number && m.membership_number === user.membership_number) return true;
    if (m.full_name && user.full_name && m.full_name === user.full_name) return true;
    return false;
  });

  function printReceipt() {
    if (!receiptRef.current || !myFee?.paid) return;
    setBusy(true);
    const ok = exportReportAsPdf(receiptRef.current, {
      title: `${t('members.feeReceipt')} - ${myFee.full_name}`,
    });
    setBusy(false);
    if (!ok) toast.error(t('reports.reportExportBlocked'));
    else toast.info(t('reports.reportPdfHint'));
  }

  if (!fees) return <Spinner />;

  return (
    <div className="receipts">
      <PageHeader
        title={t('nav.receipts')}
        subtitle={t('members.feeReceipt')}
        action={myFee?.paid ? (
          <button type="button" className="btn btn--gold" onClick={printReceipt} disabled={busy}>
            <Icon name="reports" size={18} />
            {t('members.feeReceiptPrint')}
          </button>
        ) : null}
      />

      {!myFee ? (
        <EmptyState title={t('common.noData')} />
      ) : !myFee.paid ? (
        <section className="card">
          <header className="card__header">
            <div>
              <h2 className="card__title">{t('members.regFee')}</h2>
              <p className="card__sub">{t('members.regFeeDue', money(fees.fee ?? myFee.amount ?? 0))}</p>
            </div>
          </header>
          <div className="card__body">
            <p className="muted">{t('members.regFeeDueTag')}</p>
          </div>
        </section>
      ) : (
        <section className="card">
          <header className="card__header">
            <div>
              <h2 className="card__title">{t('members.feeReceipt')}</h2>
              <p className="card__sub">{t('members.feeReceiptOfficial')}</p>
            </div>
            <span className="tag tag--green">{t('members.regFeePaidTag')}</span>
          </header>
          <div className="card__body">
            <div className="receipt print-area" ref={receiptRef}>
              <div className="print-only">
                <ReportHeader title={t('members.feeReceipt')} subtitle={myFee.full_name} />
              </div>
              <div className="receipt__card">
                <div className="receipt__head">
                  <div>
                    <p className="receipt__eyebrow">{t('members.feeReceiptOfficial')}</p>
                    <p className="receipt__no">
                      {t('members.feeReceiptNumber')} RF-{String(myFee.payment_id).padStart(5, '0')}
                    </p>
                  </div>
                  <div className="receipt__amount">
                    <span>{t('common.amount')}</span>
                    <strong className="money">{money(myFee.amount)}</strong>
                  </div>
                </div>

                <dl className="receipt__rows">
                  <div><dt>{t('common.name')}</dt><dd>{myFee.full_name}</dd></div>
                  {myFee.membership_number && (
                    <div><dt>{t('members.number')}</dt><dd>{myFee.membership_number}</dd></div>
                  )}
                  <div><dt>{t('members.regFee')}</dt><dd>{t('members.regFeePaidTag')}</dd></div>
                  <div><dt>{t('common.date')}</dt><dd>{shortDate(myFee.paid_on)}</dd></div>
                  {myFee.recorded_by_name && (
                    <div><dt>{t('savings.recordedBy')}</dt><dd>{myFee.recorded_by_name}</dd></div>
                  )}
                  {myFee.note && <div><dt>{t('savings.note')}</dt><dd>{myFee.note}</dd></div>}
                </dl>

                <p className="receipt__thanks">{t('members.feeReceiptThanks')}</p>
                <div className="receipt__sign">
                  <span>{t('members.feeReceiptSignature')}</span>
                  <strong>{myFee.recorded_by_name || t('members.feeReceiptCommittee')}</strong>
                </div>
              </div>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}

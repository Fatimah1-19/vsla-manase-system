import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import Modal from '../components/Modal.jsx';
import { useLang } from './LangContext.jsx';
import './Confirm.css';

const ConfirmContext = createContext(null);

/**
 * A promise-based replacement for window.confirm, styled like the rest of the
 * app instead of the browser's "localhost says" box.
 *
 * confirm({ title, message, confirmLabel, danger }) -> Promise<boolean>
 */
export function ConfirmProvider({ children }) {
  const { t } = useLang();
  const [dialog, setDialog] = useState(null);

  const confirm = useCallback((options = {}) => new Promise((resolve) => {
    setDialog({
      title: options.title || t('common.confirm'),
      message: options.message,
      confirmLabel: options.confirmLabel || t('common.yes'),
      danger: options.danger,
      resolve,
    });
  }), [t]);

  const decide = useCallback((value) => {
    setDialog((current) => {
      if (current) current.resolve(value);
      return null;
    });
  }, []);

  const value = useMemo(() => ({ confirm }), [confirm]);

  return (
    <ConfirmContext.Provider value={value}>
      {children}
      <Modal open={!!dialog} title={dialog?.title} onClose={() => decide(false)}>
        {dialog && (
          <div className="confirm">
            <span className={`confirm__icon${dialog.danger ? ' confirm__icon--danger' : ''}`} aria-hidden="true">!</span>
            <p className="confirm__msg">{dialog.message}</p>
            <div className="confirm__btns">
              <button type="button" className="btn btn--ghost" onClick={() => decide(false)}>
                {t('common.cancel')}
              </button>
              <button
                type="button"
                className={dialog.danger ? 'btn btn--danger' : 'btn'}
                onClick={() => decide(true)}
              >
                {dialog.confirmLabel}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </ConfirmContext.Provider>
  );
}

export const useConfirm = () => {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error('useConfirm must be used inside ConfirmProvider');
  return ctx.confirm;
};
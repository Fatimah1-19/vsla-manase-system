import { useEffect, useRef } from 'react';
import { useLang } from '../context/LangContext.jsx';
import '../styles.css';

/** A sheet that slides up from the bottom on a phone, centres on a laptop. */
export default function Modal({ open, title, onClose, children, footer, wide = false }) {
  const { t } = useLang();
  const panelRef = useRef(null);

  // Pages hand us a brand-new onClose function on every render. If the effect
  // below listed it as a dependency it would run again after EVERY keystroke and
  // pull the cursor out of the box being typed in. So we keep the newest one in
  // a ref instead, and the effect only runs when the sheet opens or closes.
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') closeRef.current(); };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';

    // When the sheet opens, put the cursor in its first text box (just once).
    const firstField = panelRef.current?.querySelector(
      'input:not([type="hidden"]):not([disabled]), textarea:not([disabled])'
    );
    (firstField || panelRef.current)?.focus();

    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open]);

  if (!open) return null;

  return (
    <div className="modal" role="dialog" aria-modal="true" aria-label={title}>
      <button type="button" className="modal__scrim" onClick={onClose} aria-label={t('common.close')} />
      <div className={wide ? 'modal__panel modal__panel--wide' : 'modal__panel'} ref={panelRef} tabIndex={-1}>
        <header className="modal__head">
          <h2 className="modal__title">{title}</h2>
          <button type="button" className="modal__x" onClick={onClose} aria-label={t('common.close')}>&times;</button>
        </header>
        <div className="modal__body">{children}</div>
        {footer && <footer className="modal__foot">{footer}</footer>}
      </div>
    </div>
  );
}
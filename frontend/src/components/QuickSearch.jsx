import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { useLang } from '../context/LangContext.jsx';
import { navFor } from './navItems.js';
import Icon from './Icon.jsx';
import Modal from './Modal.jsx';
import './QuickSearch.css';

/**
 * A quick-find button. It lists the pages this person is allowed to open, lets
 * them type to narrow it down, and jumps straight there. Built from the same
 * nav list as the side menu, so it never shows a page they cannot reach.
 */
export default function QuickSearch() {
  const { user } = useAuth();
  const { t } = useLang();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  const items = useMemo(() => navFor(user.role), [user.role]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items
      .map((i) => ({ ...i, label: t(i.key) }))
      .filter((i) => !q || i.label.toLowerCase().includes(q));
  }, [items, query, t]);

  function close() {
    setOpen(false);
    setQuery('');
  }

  function go(to) {
    close();
    navigate(to);
  }

  return (
    <>
      <button type="button" className="btn btn--ghost btn--small dashsearch__btn" onClick={() => setOpen(true)}>
        <Icon name="search" size={18} />
        {t('common.search')}
      </button>

      <Modal open={open} title={t('common.search')} onClose={close}>
        <input
          type="search"
          className="dashsearch__input"
          placeholder={t('common.search')}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label={t('common.search')}
        />
        <ul className="dashsearch__list">
          {results.length === 0 && <li className="dashsearch__none">{t('common.noResults')}</li>}
          {results.map((r) => (
            <li key={r.to}>
              <button type="button" className="dashsearch__item" onClick={() => go(r.to)}>
                <Icon name={r.icon} size={20} />
                <span>{r.label}</span>
              </button>
            </li>
          ))}
        </ul>
      </Modal>
    </>
  );
}

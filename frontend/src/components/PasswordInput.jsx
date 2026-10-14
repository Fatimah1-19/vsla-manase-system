import { useState } from 'react';
import Icon from './Icon.jsx';
import { useLang } from '../context/LangContext.jsx';
import '../styles.css';

/**
 * A password box with an eye button, so anyone can check what they typed
 * before saving. Takes the same props as a normal <input>.
 */
export default function PasswordInput({ className = '', ...props }) {
  const { t } = useLang();
  const [shown, setShown] = useState(false);

  return (
    <span className={`pw ${className}`}>
      <input {...props} type={shown ? 'text' : 'password'} />
      <button
        type="button"
        className="pw__eye"
        onClick={() => setShown((s) => !s)}
        aria-label={t(shown ? 'common.hidePassword' : 'common.showPassword')}
        title={t(shown ? 'common.hidePassword' : 'common.showPassword')}
        tabIndex={-1}
      >
        <Icon name={shown ? 'eyeOff' : 'eye'} size={20} />
      </button>
    </span>
  );
}

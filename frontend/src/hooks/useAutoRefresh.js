import { useEffect, useRef } from 'react';

const DEFAULT_INTERVAL = 30000;

export function useAutoRefresh(refresh, { interval = DEFAULT_INTERVAL } = {}) {
  const latest = useRef(refresh);
  latest.current = refresh;

  useEffect(() => {
    let busy = false;

    const run = () => {
      if (busy || document.visibilityState !== 'visible') return;
      busy = true;
      Promise.resolve()
        .then(() => latest.current())
        .catch(() => {})
        .finally(() => { busy = false; });
    };

    const onVisibility = () => {
      if (document.visibilityState === 'visible') run();
    };

    window.addEventListener('focus', run);
    document.addEventListener('visibilitychange', onVisibility);
    const timer = window.setInterval(onVisibility, interval);

    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', run);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [interval]);
}

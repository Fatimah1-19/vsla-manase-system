import { useEffect, useState } from 'react';
import '../styles.css';

const pad = (n) => String(n).padStart(2, '0');

/**
 * A small clock that ticks once a second. It reads the device's own time, so
 * it is right wherever the group happens to be sitting.
 */
export default function LiveClock() {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const label = now.toLocaleTimeString(undefined, { hour12: false });

  return (
    <span className="clock" title={label} aria-label={label}>
      <span className="clock__dot" aria-hidden="true" />
      <span className="clock__time" aria-hidden="true">
        <span className="clock__part">{pad(now.getHours())}</span>
        <span className="clock__sep">:</span>
        <span className="clock__part">{pad(now.getMinutes())}</span>
        <span className="clock__sep">:</span>
        <span className="clock__part clock__part--sec">{pad(now.getSeconds())}</span>
      </span>
    </span>
  );
}

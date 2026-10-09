import { useEffect, useState } from 'react';
import { fetchFile } from '../api/client.js';
import Avatar from './Avatar.jsx';

// Photos are shared across every list, so each member's picture is fetched
// once for the whole app and remembered here as a temporary link.
const photos = new Map(); // memberId -> { url } | { promise }
const LIMIT = 150;

function photoFor(memberId) {
  let entry = photos.get(memberId);
  if (entry) return entry.url !== undefined ? Promise.resolve(entry.url) : entry.promise;
  const promise = fetchFile(`/members/${memberId}/avatar`)
    .then((url) => { photos.set(memberId, { url }); return url; })
    .catch(() => { photos.set(memberId, { url: null }); return null; });
  photos.set(memberId, { promise });
  if (photos.size > LIMIT) {
    const oldest = photos.keys().next().value;
    const evicted = photos.get(oldest);
    if (evicted && evicted.url) URL.revokeObjectURL(evicted.url);
    photos.delete(oldest);
  }
  return promise;
}

/** A round photo badge for a member in a list. Shows initials until the photo loads or if none exists. */
export default function MemberAvatar({ memberId, hasAvatar, name, size = 32, className = '' }) {
  const [src, setSrc] = useState(null);

  useEffect(() => {
    if (!memberId || !hasAvatar) { setSrc(null); return undefined; }
    let cancelled = false;
    photoFor(memberId).then((url) => { if (!cancelled) setSrc(url); });
    return () => { cancelled = true; };
  }, [memberId, hasAvatar]);

  return <Avatar name={name} size={size} className={className} src={src} />;
}
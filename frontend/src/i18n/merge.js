/** Deep-merge `extra` into `base`; values in `extra` win. Used to layer new text over the originals. */
export function deepMerge(base, extra) {
  const out = { ...base };
  for (const [k, v] of Object.entries(extra)) {
    const isObj = (x) => x && typeof x === 'object' && !Array.isArray(x);
    out[k] = isObj(v) && isObj(base[k]) ? deepMerge(base[k], v) : v;
  }
  return out;
}

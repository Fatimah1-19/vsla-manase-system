const { getSetting } = require('./helpers');

/**
 * The background questions the group answers about a person asking to join.
 * The chairperson can change them on the Settings page; these are the defaults
 * used until she saves her own list. Each question has a stable `id` (so votes
 * already cast keep pointing at the right question), text in both languages,
 * and `good`: the answer that counts in favour of the applicant.
 */
const DEFAULT_QUESTIONS = [
  { id: 'resident', good: 'yes', en: 'Is the applicant a resident of this area?', ny: "Kodi wopempha ndi wokhala m'derali?" },
  { id: 'goodCharacter', good: 'yes', en: 'Does the applicant have good character?', ny: 'Kodi wopempha ali ndi makhalidwe abwino?' },
  { id: 'trustworthy', good: 'yes', en: 'Is the applicant trustworthy?', ny: 'Kodi wopempha ndi wodalirika?' },
  { id: 'honest', good: 'yes', en: 'Is the applicant honest in their dealings?', ny: 'Kodi wopempha ndi woona mtima pa zochita zake?' },
  { id: 'repaysLoans', good: 'yes', en: 'Does the applicant repay loans on time without trouble?', ny: 'Kodi wopempha amabweza ngongole pa nthawi popanda mavuto?' },
  { id: 'formerMember', good: 'yes', en: 'If the applicant belonged to another group, were they a good member there?', ny: 'Ngati wopempha anali mu gulu lina, kodi anali membala wabwino kumeneko?' },
  { id: 'followsRules', good: 'yes', en: "Is the applicant willing to follow the group's rules?", ny: 'Kodi wopempha akufuna kutsatira malamulo a gulu?' },
  { id: 'reliableIncome', good: 'yes', en: 'Does the applicant have a reliable source of income for regular savings?', ny: 'Kodi wopempha ali ndi ndalama zodalirika zosungira nthawi zonse?' },
  { id: 'noDebt', good: 'no', en: 'Does the applicant have any unpaid loan or debt elsewhere?', ny: 'Kodi wopempha ali ndi ngongole ina iliyonse yosabwezedwa?' },
  { id: 'notExpelled', good: 'no', en: 'Has the applicant ever been expelled for dishonesty or default?', ny: 'Kodi wopempha anachotsedwapo chifukwa cha chinyengo kapena kulephera kubweza ngongole?' },
];

const SETTING_KEY = 'join_screening_questions';

/** Make a safe, unique id out of whatever was given. */
function makeId(raw, taken) {
  let id = String(raw || '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  if (!id) id = 'q';
  let candidate = id;
  let n = 2;
  while (taken.has(candidate)) candidate = `${id}${n++}`;
  taken.add(candidate);
  return candidate;
}

/**
 * Keep only well-formed questions. Returns an array (possibly empty) when given
 * an array, or null when given anything else, so callers can tell "clear" from "invalid".
 */
function sanitise(list) {
  if (!Array.isArray(list)) return null;
  const taken = new Set();
  const clean = [];
  for (const item of list) {
    if (!item || typeof item !== 'object') continue;
    const en = String(item.en || '').trim();
    const ny = String(item.ny || '').trim();
    if (!en && !ny) continue;
    clean.push({
      id: makeId(item.id, taken),
      good: item.good === 'no' ? 'no' : 'yes',
      en: en || ny,
      ny: ny || en,
    });
  }
  return clean;
}

/** The questions in force right now: the saved list, or the defaults. */
async function getScreeningQuestions() {
  const raw = await getSetting(SETTING_KEY);
  if (!raw) return DEFAULT_QUESTIONS;
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return DEFAULT_QUESTIONS;
  }
  if (!Array.isArray(parsed)) return DEFAULT_QUESTIONS;
  return sanitise(parsed);
}

/** The saved list as a JSON string, ready for the settings table. */
function serialise(list) {
  return JSON.stringify(sanitise(list) || []);
}

module.exports = { DEFAULT_QUESTIONS, SETTING_KEY, getScreeningQuestions, sanitise, serialise };

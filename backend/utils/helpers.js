const crypto = require('crypto');
const { query, one } = require('../config/db');

/**
 * The active cycle and the settings are asked for on almost every page, and they
 * change only a few times a year. With the database far away every question costs
 * about a third of a second, so we remember the answers for a few seconds.
 * Anything that changes them calls clearCache() so the change shows at once.
 */
const CACHE_MS = 15 * 1000;
let cyclePromise = null;
let cycleAt = 0;
let settingsPromise = null;
let settingsAt = 0;

function clearCache() {
  cyclePromise = null;
  settingsPromise = null;
}

/** The cycle everything is recorded against right now. */
function getActiveCycle() {
  const now = Date.now();
  if (!cyclePromise || now - cycleAt > CACHE_MS) {
    cycleAt = now;
    cyclePromise = Promise.resolve(one(`SELECT * FROM cycles WHERE status = 'active' ORDER BY start_date DESC LIMIT 1`))
      .catch((err) => { cyclePromise = null; throw err; });
  }
  // Hand out a copy, so no caller can change what the next one receives.
  return cyclePromise.then((cycle) => (cycle ? { ...cycle } : cycle));
}

/** Every setting in one question (the table is tiny), remembered for a few seconds. */
function loadSettings() {
  const now = Date.now();
  if (!settingsPromise || now - settingsAt > CACHE_MS) {
    settingsAt = now;
    settingsPromise = Promise.resolve(query(`SELECT setting_key, setting_value FROM settings`))
      .then((rows) => new Map(rows.map((r) => [r.setting_key, r.setting_value])))
      .catch((err) => { settingsPromise = null; throw err; });
  }
  return settingsPromise;
}

async function getSetting(key, fallback = null) {
  const settings = await loadSettings();
  return settings.has(key) ? settings.get(key) : fallback;
}

async function setSetting(key, value, group = 'group') {
  await query(
    `INSERT INTO settings (setting_key, setting_value, setting_group, updated_at)
     VALUES ($1,$2,$3,NOW())
     ON CONFLICT (setting_key) DO UPDATE SET setting_value = $2, updated_at = NOW()`,
    [key, String(value), group]
  );
  clearCache();
}

const isYes = (v) => String(v).trim().toLowerCase() === 'yes';

/**
 * Only a verified saving is real money. A saving the treasurer has written but
 * the secretary has not yet checked (pending_verification) or has refused
 * (rejected) is kept on the record but must never be added up: it does not
 * count toward a member's total, her borrowing limit, the cash in the box or
 * the share-out. Every money question that sums savings carries this filter.
 */
const VERIFIED_SAVING = `status = 'verified'`;

/** The same rule, said with a table alias, for queries that join savings. */
function verifiedSaving(alias = '') {
  const col = alias ? `${alias}.status` : 'status';
  return `${col} = 'verified'`;
}

/** Total owed on a loan: principal, plus interest only if she opted in. */
function loanTotals(loan) {
  const principal = Number(loan.amount);
  const rate = loan.with_interest ? Number(loan.interest_rate) : 0;
  const interest = +((principal * rate) / 100).toFixed(2);
  return { principal, rate, interest, totalDue: +(principal + interest).toFixed(2) };
}

/** Members with a usable phone number, for group texts. */
async function activeMembersWithPhone() {
  return query(
    `SELECT m.id AS member_id, u.id AS user_id, u.full_name, u.phone, u.language
       FROM members m
       JOIN users u ON u.id = m.user_id
      WHERE m.status = 'active' AND u.is_active = TRUE
        AND u.phone IS NOT NULL AND u.phone <> ''
      ORDER BY u.full_name`
  );
}

/** Turn "Agnes Banda" into a free, unique username like agnesb or agnesb2. */
async function generateUsername(fullName) {
  const parts = String(fullName).toLowerCase().replace(/[^a-z\s]/g, '').trim().split(/\s+/);
  let base = (parts[0] || 'member') + (parts[1] ? parts[1][0] : '');
  base = base.slice(0, 14) || 'member';
  let candidate = base;
  let n = 1;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const taken = await one(`SELECT id FROM users WHERE username = $1`, [candidate]);
    if (!taken) return candidate;
    n += 1;
    candidate = `${base}${n}`;
  }
}

/** Next membership number, e.g. VB-0007. */
async function nextMembershipNumber() {
  const row = await one(`SELECT COUNT(*)::int AS c FROM members`);
  return `VB-${String((row?.c || 0) + 1).padStart(4, '0')}`;
}

/** Readable temporary password — no look-alike characters. */
function tempPassword() {
  const alphabet = 'abcdefghjkmnpqrstuvwxyz23456789';
  let out = '';
  for (let i = 0; i < 8; i++) out += alphabet[crypto.randomInt(alphabet.length)];
  return out;
}

/**
 * Cash physically in the group's box for a cycle.
 * Savings + repayments + paid fines, minus loans handed out.
 * The welfare fund and the monthly wrappers money are kept in their own
 * pots and are not counted here, so they can never be lent out by mistake.
 * `run` lets a caller pass a transaction client's query function.
 */
async function cashInBox(cycleId, run) {
  if (!cycleId) return 0;
  const exec = run || query;
  const rows = await exec(
     `SELECT
       COALESCE((SELECT SUM(amount) FROM savings WHERE cycle_id = $1 AND status = 'verified'),0)
     + COALESCE((SELECT SUM(r.amount) FROM loan_repayments r JOIN loans l ON l.id = r.loan_id WHERE l.cycle_id = $1 AND r.status = 'verified'),0)
     + COALESCE((SELECT SUM(amount) FROM fines WHERE paid = TRUE AND cycle_id = $1),0)
     - COALESCE((SELECT SUM(amount) FROM loans WHERE cycle_id = $1 AND status IN ('verified','repaid','defaulted')),0)
       AS cash`,
    [cycleId]
  );
  return +Number(rows[0]?.cash || 0).toFixed(2);
}

/**
 * An official identification document, kept inside the database. This is the
 * one place the ID-file rules live: which kinds of file are allowed, how big
 * they may be, and that the first bytes really match the type claimed. It is
 * shared by the loan application and anywhere else an ID is filed.
 *
 * Returns { ok, error } on a bad file, or { ok, document } with the row freshly
 * written to member_documents. `run` lets a caller pass a transaction client.
 */
const ID_DOC_MIME = ['application/pdf', 'image/jpeg', 'image/png'];
const ID_DOC_MAX_BYTES = 2 * 1024 * 1024;

async function storeIdDocument({ memberId, file_name, mime_type, data, uploadedBy }, run) {
  const exec = run || query;
  if (!ID_DOC_MIME.includes(mime_type)) {
    return { ok: false, error: 'Only PDF, JPG or PNG files are accepted.' };
  }
  if (!data || typeof data !== 'string') {
    return { ok: false, error: 'Choose a file to upload.' };
  }

  const buffer = Buffer.from(data, 'base64');
  if (!buffer.length) return { ok: false, error: 'That file is empty.' };
  if (buffer.length > ID_DOC_MAX_BYTES) {
    return { ok: false, error: 'The file is too big. The limit is 2 MB.' };
  }

  const head = buffer.subarray(0, 4).toString('hex');
  const ok = (mime_type === 'application/pdf' && head === '25504446')
          || (mime_type === 'image/png' && head === '89504e47')
          || (mime_type === 'image/jpeg' && head.startsWith('ffd8'));
  if (!ok) return { ok: false, error: 'That file does not look like the type you chose.' };

  const rows = await exec(
    `INSERT INTO member_documents (member_id, document_type, original_name, mime_type, size_bytes, data, uploaded_by)
     VALUES ($1,'national_id',$2,$3,$4,$5,$6)
     RETURNING id, document_type, original_name, mime_type, size_bytes, uploaded_at`,
    [memberId, String(file_name || 'id-document').slice(0, 200), mime_type, buffer.length, buffer, uploadedBy]
  );
  return { ok: true, document: rows[0] };
}

module.exports = {
  clearCache, cashInBox, getActiveCycle, getSetting, setSetting, isYes, loanTotals,
  activeMembersWithPhone, generateUsername, nextMembershipNumber, tempPassword,
  VERIFIED_SAVING, verifiedSaving,
  ID_DOC_MIME, ID_DOC_MAX_BYTES, storeIdDocument,
};
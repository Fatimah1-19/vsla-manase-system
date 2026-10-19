const { query, one } = require('../config/db');
const { wrap } = require('../middleware/errorHandler');
const { audit } = require('../utils/audit');
const { loanTotals, getSetting, getActiveCycle } = require('../utils/helpers');

const GENDERS = ['female', 'male'];
const MARITAL = ['single', 'married', 'divorced', 'widowed'];
const DOC_TYPES = ['national_id', 'membership_form', 'passport_photo', 'proof_of_address', 'other'];
const ALLOWED_MIME = ['application/pdf', 'image/jpeg', 'image/png'];
const ALLOWED_AVATAR_MIME = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_DOC_BYTES = 2 * 1024 * 1024;
const MAX_AVATAR_BYTES = 2 * 1024 * 1024;

// GET /api/profile/me — everything a member wants to see about herself in one place
const getMyProfile = wrap(async (req, res) => {
  const memberId = req.user.member_id;
  if (!memberId) return res.json({ member: null });

  const member = await one(
    `SELECT m.id, m.membership_number, m.date_joined, m.status, m.village, m.address,
            m.next_of_kin, m.next_of_kin_phone, m.gender, m.marital_status, m.date_of_birth, m.occupation,
            (m.avatar IS NOT NULL) AS has_avatar,
            u.full_name, u.username, u.phone, u.email, u.role, u.language,
            CASE WHEN NOT u.is_active THEN 'suspended'
                 WHEN u.locked_until IS NOT NULL AND u.locked_until > NOW() THEN 'locked'
                 ELSE 'active' END AS account_status
       FROM members m JOIN users u ON u.id = m.user_id WHERE m.id = $1`, [memberId]
  );

  const [savings, loanRows, fines, documents, share, welfare, months, shareouts, cycle] = await Promise.all([
    query(`SELECT id, amount::float, shares, date, note FROM savings WHERE member_id = $1
            ORDER BY date DESC, id DESC LIMIT 60`, [memberId]),
    query(`SELECT l.id, l.amount::float, l.with_interest, l.interest_rate::float, l.status, l.due_date, l.purpose,
                  COALESCE((SELECT SUM(r.amount) FROM loan_repayments r WHERE r.loan_id = l.id),0)::float AS total_repaid
             FROM loans l WHERE l.member_id = $1 ORDER BY l.id DESC`, [memberId]),
    query(
      `SELECT f.id, f.amount::float, f.reason, f.paid, f.date, f.meeting_id,
              to_char(f.date,'YYYY-MM') AS month, c.cycle_name, mt.meeting_date
         FROM fines f
         LEFT JOIN cycles c ON c.id = f.cycle_id
         LEFT JOIN meetings mt ON mt.id = f.meeting_id
        WHERE f.member_id = $1 ORDER BY f.date DESC, f.id DESC`, [memberId]),
    query(`SELECT id, document_type, original_name, mime_type, size_bytes, uploaded_at
             FROM member_documents WHERE member_id = $1 ORDER BY id DESC`, [memberId]),
    one(`SELECT COALESCE(SUM(amount),0)::float AS total, COALESCE(SUM(shares),0)::int AS shares
           FROM savings WHERE member_id = $1`, [memberId]),
    query(`SELECT id, amount::float, type, category, date, notes FROM welfare_fund
            WHERE member_id = $1 ORDER BY date DESC, id DESC`, [memberId]),
    query(`SELECT id, TO_CHAR(period, 'YYYY-MM') AS period, amount::float AS amount, paid_on
             FROM monthly_contributions WHERE member_id = $1 ORDER BY period DESC, id DESC`, [memberId]),
    query(`SELECT d.share_out_id, so.status, so.date_distributed, c.cycle_name,
                  d.member_savings::float AS member_savings, d.profit_share::float AS profit_share,
                  d.deductions::float AS deductions, d.unrecovered::float AS unrecovered,
                  d.share_amount::float AS share_amount
             FROM share_out_details d
             JOIN share_out so ON so.id = d.share_out_id
             LEFT JOIN cycles c ON c.id = so.cycle_id
            WHERE d.member_id = $1 ORDER BY so.id DESC`, [memberId]),
    getActiveCycle(),
  ]);

  const loans = loanRows.map((l) => {
    const { interest, totalDue } = loanTotals(l);
    return { ...l, interest_amount: interest, total_due: totalDue,
             outstanding: Math.max(0, +(totalDue - l.total_repaid).toFixed(2)) };
  });

  const multiplier = Number(await getSetting('loan_multiplier', '2'));
  const outstanding = +loans.filter((l) => l.status === 'approved').reduce((a, l) => a + l.outstanding, 0).toFixed(2);
  const unpaidFines = +fines.filter((f) => !f.paid).reduce((a, f) => a + f.amount, 0).toFixed(2);
  res.json({
    member, savings, loans, fines, documents, welfare, months, shareouts,
    cycle: cycle ? { id: cycle.id, cycle_name: cycle.cycle_name, share_value: Number(cycle.share_value) } : null,
    totals: {
      savings: share.total,
      shares: share.shares,
      active_loans: loans.filter((l) => l.status === 'approved').length,
      outstanding,
      unpaid_fines: unpaidFines,
      // What is really still hers in the box right now: her savings less what she owes.
      net: +(share.total - outstanding - unpaidFines).toFixed(2),
      documents: documents.length,
    },
    loan_limit: { multiplier, max_loan: +(share.total * multiplier).toFixed(2) },
  });
});

// PUT /api/profile/me — she keeps her own details up to date
const updateMyProfile = wrap(async (req, res) => {
  const memberId = req.user.member_id;
  if (!memberId) return res.status(404).json({ message: 'You do not have a member record yet.' });

  const { phone, email, gender, marital_status, date_of_birth, village, address,
          next_of_kin, next_of_kin_phone, occupation } = req.body;

  if (gender && !GENDERS.includes(gender)) return res.status(400).json({ message: 'Choose female or male.' });
  if (marital_status && !MARITAL.includes(marital_status)) {
    return res.status(400).json({ message: 'Choose single, married, divorced or widowed.' });
  }
  if (date_of_birth && (Number.isNaN(Date.parse(date_of_birth)) || new Date(date_of_birth) > new Date())) {
    return res.status(400).json({ message: 'Enter a real date of birth.' });
  }
  if (phone && !/^[0-9+\s-]{7,20}$/.test(phone)) {
    return res.status(400).json({ message: 'Enter a phone number with digits only.' });
  }
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email))) {
    return res.status(400).json({ message: 'Enter a valid email address.' });
  }

  const clean = (v) => (v === undefined ? null : (String(v).trim() || null));

  await query(`UPDATE users SET phone = COALESCE($2, phone), email = COALESCE($3, email) WHERE id = $1`,
    [req.user.id, clean(phone), clean(email)]);
  await query(
    `UPDATE members SET
       gender = COALESCE($2, gender), marital_status = COALESCE($3, marital_status),
       date_of_birth = COALESCE($4, date_of_birth), village = COALESCE($5, village),
       address = COALESCE($6, address), next_of_kin = COALESCE($7, next_of_kin),
       next_of_kin_phone = COALESCE($8, next_of_kin_phone), occupation = COALESCE($9, occupation)
     WHERE id = $1`,
    [memberId, clean(gender), clean(marital_status), clean(date_of_birth), clean(village),
     clean(address), clean(next_of_kin), clean(next_of_kin_phone), clean(occupation)]
  );

  await audit(req.user.id, 'UPDATE_OWN_PROFILE', 'members', memberId, null);
  res.json({ message: 'Your details have been saved.' });
});

// PUT /api/profile/avatar  { mime_type, data }  — her own picture. data = base64.
// Send data empty (or omit it) to remove the picture and go back to initials.
const setAvatar = wrap(async (req, res) => {
  const memberId = req.user.member_id;
  if (!memberId) return res.status(404).json({ message: 'You do not have a member record yet.' });

  const { mime_type, data } = req.body;
  if (data === undefined || data === null || data === '') {
    await query(`UPDATE members SET avatar = NULL, avatar_mime = NULL WHERE id = $1`, [memberId]);
    await audit(req.user.id, 'UPDATE_OWN_PROFILE', 'members', memberId, 'Removed profile picture');
    return res.json({ message: 'Profile picture removed.', has_avatar: false });
  }

  if (!ALLOWED_AVATAR_MIME.includes(mime_type)) {
    return res.status(400).json({ message: 'Only JPG, PNG or WEBP pictures are accepted.' });
  }
  const buffer = Buffer.from(String(data), 'base64');
  if (!buffer.length) return res.status(400).json({ message: 'That file is empty.' });
  if (buffer.length > MAX_AVATAR_BYTES) return res.status(400).json({ message: 'The picture is too big. The limit is 2 MB.' });

  const head = buffer.subarray(0, 4);
  const ok = (mime_type === 'image/png' && head.toString('hex') === '89504e47')
          || (mime_type === 'image/jpeg' && head.toString('hex').startsWith('ffd8'))
          || (mime_type === 'image/webp' && head.toString('ascii') === 'RIFF');
  if (!ok) return res.status(400).json({ message: 'That does not look like the picture type you chose.' });

  await query(`UPDATE members SET avatar = $2, avatar_mime = $3 WHERE id = $1`, [memberId, buffer, mime_type]);
  await audit(req.user.id, 'UPDATE_OWN_PROFILE', 'members', memberId, 'Changed profile picture');
  res.json({ message: 'Profile picture saved.', has_avatar: true });
});

// GET /api/profile/avatar — the member's own picture, as it stands in the database
const getAvatar = wrap(async (req, res) => {
  const memberId = req.user.member_id;
  if (!memberId) return res.status(404).json({ message: 'You do not have a member record yet.' });
  const row = await one(`SELECT avatar, avatar_mime FROM members WHERE id = $1`, [memberId]);
  if (!row || !row.avatar) return res.status(404).json({ message: 'No profile picture yet.' });

  res.setHeader('Content-Type', row.avatar_mime || 'image/jpeg');
  res.setHeader('Cache-Control', 'private, max-age=300');
  res.send(row.avatar);
});

// POST /api/profile/documents  { document_type, file_name, mime_type, data }  (data = base64)
const uploadDocument = wrap(async (req, res) => {
  const memberId = req.user.member_id;
  if (!memberId) return res.status(404).json({ message: 'You do not have a member record yet.' });

  const { document_type, file_name, mime_type, data } = req.body;
  if (!DOC_TYPES.includes(document_type)) return res.status(400).json({ message: 'Choose what kind of document this is.' });
  if (!ALLOWED_MIME.includes(mime_type)) return res.status(400).json({ message: 'Only PDF, JPG or PNG files are accepted.' });
  if (!data || typeof data !== 'string') return res.status(400).json({ message: 'Choose a file to upload.' });

  const buffer = Buffer.from(data, 'base64');
  if (!buffer.length) return res.status(400).json({ message: 'That file is empty.' });
  if (buffer.length > MAX_DOC_BYTES) return res.status(400).json({ message: 'The file is too big. The limit is 2 MB.' });

  // Check the first bytes really match the type she claims.
  const head = buffer.subarray(0, 4).toString('hex');
  const ok = (mime_type === 'application/pdf' && head === '25504446')
          || (mime_type === 'image/png' && head === '89504e47')
          || (mime_type === 'image/jpeg' && head.startsWith('ffd8'));
  if (!ok) return res.status(400).json({ message: 'That file does not look like the type you chose.' });

  const count = await one(`SELECT COUNT(*)::int AS c FROM member_documents WHERE member_id = $1`, [memberId]);
  if (count.c >= 12) return res.status(400).json({ message: 'You can keep up to 12 documents. Remove one first.' });

  const row = await one(
    `INSERT INTO member_documents (member_id, document_type, original_name, mime_type, size_bytes, data, uploaded_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id, document_type, original_name, mime_type, size_bytes, uploaded_at`,
    [memberId, document_type, String(file_name || 'document').slice(0, 200), mime_type, buffer.length, buffer, req.user.id]
  );
  await audit(req.user.id, 'UPLOAD_DOCUMENT', 'member_documents', row.id, document_type);
  res.status(201).json({ message: 'Document saved.', document: row });
});

// GET /api/profile/documents/:id — the owner or the committee may open it
const downloadDocument = wrap(async (req, res) => {
  const id = Number(req.params.id);
  const doc = await one(`SELECT * FROM member_documents WHERE id = $1`, [id]);
  if (!doc) return res.status(404).json({ message: 'That document does not exist.' });

  const isOwner = doc.member_id === req.user.member_id;
  const isCommittee = ['admin', 'treasurer', 'secretary'].includes(req.user.role);
  if (!isOwner && !isCommittee) return res.status(403).json({ message: 'You cannot open that document.' });

  res.setHeader('Content-Type', doc.mime_type);
  res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(doc.original_name)}"`);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.send(doc.data);
});

// DELETE /api/profile/documents/:id
const deleteDocument = wrap(async (req, res) => {
  const id = Number(req.params.id);
  const doc = await one(`SELECT id, member_id FROM member_documents WHERE id = $1`, [id]);
  if (!doc) return res.status(404).json({ message: 'That document does not exist.' });
  if (doc.member_id !== req.user.member_id && req.user.role !== 'admin') {
    return res.status(403).json({ message: 'You cannot remove that document.' });
  }
  await query(`DELETE FROM member_documents WHERE id = $1`, [id]);
  await audit(req.user.id, 'DELETE_DOCUMENT', 'member_documents', id, null);
  res.json({ message: 'Document removed.' });
});

// POST /api/members/:id/documents — the chairperson and the secretary keep the
// membership papers (a form, a copy of the record) with the register.
const uploadMemberDocument = wrap(async (req, res) => {
  const memberId = Number(req.params.id);
  const member = await one(`SELECT id FROM members WHERE id = $1`, [memberId]);
  if (!member) return res.status(404).json({ message: 'That member is not on the list.' });

  const { document_type, file_name, mime_type, data } = req.body;
  if (!DOC_TYPES.includes(document_type)) return res.status(400).json({ message: 'Choose what kind of document this is.' });
  if (!ALLOWED_MIME.includes(mime_type)) return res.status(400).json({ message: 'Only PDF, JPG or PNG files are accepted.' });
  if (!data || typeof data !== 'string') return res.status(400).json({ message: 'Choose a file to upload.' });

  const buffer = Buffer.from(data, 'base64');
  if (!buffer.length) return res.status(400).json({ message: 'That file is empty.' });
  if (buffer.length > MAX_DOC_BYTES) return res.status(400).json({ message: 'The file is too big. The limit is 2 MB.' });

  const head = buffer.subarray(0, 4).toString('hex');
  const ok = (mime_type === 'application/pdf' && head === '25504446')
          || (mime_type === 'image/png' && head === '89504e47')
          || (mime_type === 'image/jpeg' && head.startsWith('ffd8'));
  if (!ok) return res.status(400).json({ message: 'That file does not look like the type you chose.' });

  const count = await one(`SELECT COUNT(*)::int AS c FROM member_documents WHERE member_id = $1`, [memberId]);
  if (count.c >= 12) return res.status(400).json({ message: 'This record already keeps 12 documents. Remove one first.' });

  const row = await one(
    `INSERT INTO member_documents (member_id, document_type, original_name, mime_type, size_bytes, data, uploaded_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id, document_type, original_name, mime_type, size_bytes, uploaded_at`,
    [memberId, document_type, String(file_name || 'document').slice(0, 200), mime_type, buffer.length, buffer, req.user.id]
  );
  await audit(req.user.id, 'UPLOAD_DOCUMENT', 'member_documents', row.id, `${document_type} for member ${memberId}`);
  res.status(201).json({ message: 'Document saved.', document: row });
});

// DELETE /api/members/:id/documents/:docId — a membership paper is filed away.
const deleteMemberDocument = wrap(async (req, res) => {
  const memberId = Number(req.params.id);
  const docId = Number(req.params.docId);
  const doc = await one(`SELECT id FROM member_documents WHERE id = $1 AND member_id = $2`, [docId, memberId]);
  if (!doc) return res.status(404).json({ message: 'That document is not on this member record.' });
  await query(`DELETE FROM member_documents WHERE id = $1`, [docId]);
  await audit(req.user.id, 'DELETE_DOCUMENT', 'member_documents', docId, `member ${memberId}`);
  res.json({ message: 'Document removed.' });
});

module.exports = { getMyProfile, updateMyProfile, setAvatar, getAvatar, uploadDocument, downloadDocument, deleteDocument,
  uploadMemberDocument, deleteMemberDocument };

const router = require('express').Router();
const c = require('../controllers/auditController');
const { protect, requirePermission } = require('../middleware/auth');

// A sanitised group timeline: meetings, cycles and share-out notices only.
// It contains no account, session or personal records.
router.get('/group', protect, c.groupActivity);

// Security: the system administrator alone may read the full history. Nobody
// can change it: the database refuses edits to audit_logs.
router.use(protect, requirePermission('audit.view'));
router.get('/', c.listAudit);
router.get('/export', c.exportAudit);
router.get('/sessions', c.listSessions);

module.exports = router;

const router = require('express').Router();
const c = require('../controllers/auditController');
const { protect, requirePermission } = require('../middleware/auth');

// The book-keeping offices and the administrator may read the history. Nobody
// can change it: the database refuses edits to audit_logs.
router.use(protect, requirePermission('audit.view'));
router.get('/', c.listAudit);
router.get('/export', c.exportAudit);
router.get('/sessions', c.listSessions);

module.exports = router;

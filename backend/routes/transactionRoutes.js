const router = require('express').Router();
const c = require('../controllers/transactionController');
const { protect, requirePermission, blockSystemAdmin } = require('../middleware/auth');

// The money feed and its corrections. The system administrator is kept out.
router.use(protect, blockSystemAdmin);

router.get('/', requirePermission('transactions.view'), c.listTransactions);
router.get('/corrections', requirePermission('transactions.view'), c.listCorrections);
// A correction is a new record; nothing in the books is edited or removed.
router.post('/corrections', requirePermission('transactions.correct'), c.recordCorrection);

module.exports = router;

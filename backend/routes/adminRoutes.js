const router = require('express').Router();
const c = require('../controllers/adminController');
const { protect, requirePermission } = require('../middleware/auth');

// The system administrator looks after accounts. She never touches money and
// never holds an office, so this is the only door she opens.
router.use(protect);

router.get('/members', requirePermission('accounts.view'), c.listMembers);
router.post('/accounts', requirePermission('accounts.manage'), c.createAccount);

router.get('/change-requests', requirePermission('accounts.view'), c.listMyChangeRequests);
router.post('/change-requests', requirePermission('accounts.manage'), c.proposeChange);
router.post('/change-requests/:id/withdraw', requirePermission('accounts.manage'), c.withdrawChangeRequest);

module.exports = router;

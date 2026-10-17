const router = require('express').Router();
const c = require('../controllers/adminController');
const { protect, requirePermission } = require('../middleware/auth');

// The system administrator looks after accounts. She never touches money and
// never holds an office, so this is the only door she opens.
router.use(protect);

router.get('/members', requirePermission('accounts.view'), c.listMembers);
router.post('/accounts', requirePermission('accounts.manage'), c.createAccount);
router.patch('/accounts/:id/role', requirePermission('accounts.manage'), c.setSystemRole);

router.get('/change-requests', requirePermission('accounts.view'), c.listMyChangeRequests);
router.post('/change-requests', requirePermission('accounts.manage'), c.proposeChange);
router.post('/change-requests/:id/withdraw', requirePermission('accounts.manage'), c.withdrawChangeRequest);

// The VSLA settings she has put to the chairperson, and the rule book itself.
router.get('/config-changes', requirePermission('accounts.view'), c.listConfigChanges);
router.get('/permissions', requirePermission('accounts.view'), c.listPermissions);

module.exports = router;

const router = require('express').Router();
const c = require('../controllers/adminController');
const { protect, requirePermission } = require('../middleware/auth');

// The system administrator looks after accounts. She never touches money and
// never holds an office, so this is the only door she opens.
router.use(protect);

router.get('/members', requirePermission('accounts.view'), c.listMembers);
router.get('/accounts/:id', requirePermission('accounts.view'), c.getAccount);
router.post('/accounts', requirePermission('accounts.manage'), c.createAccount);
router.patch('/accounts/:id', requirePermission('accounts.manage'), c.updateAccount);
router.patch('/accounts/:id/role', requirePermission('accounts.manage'), c.setSystemRole);
router.post('/accounts/:id/reset-password', requirePermission('accounts.manage'), c.resetAccountPassword);
router.post('/accounts/:id/deactivate', requirePermission('accounts.manage'), c.deactivateAccount);
router.post('/accounts/:id/reactivate', requirePermission('accounts.manage'), c.reactivateAccount);

router.get('/change-requests', requirePermission('accounts.view'), c.listMyChangeRequests);
router.post('/change-requests', requirePermission('accounts.manage'), c.proposeChange);
router.post('/change-requests/:id/withdraw', requirePermission('accounts.manage'), c.withdrawChangeRequest);

// The rule book the settings tabs show, and the permissions in force.
router.get('/permissions', requirePermission('accounts.view'), c.listPermissions);

// The technical picture of text messaging — service status, types, templates
// and the delivery log. No money, no message bodies.
router.get('/sms', requirePermission('system.settings'), c.smsInfo);

module.exports = router;

const router = require('express').Router();
const c = require('../controllers/userController');
const { protect, requirePermission } = require('../middleware/auth');

router.use(protect);
router.get('/', requirePermission('users.view'), c.listUsers);
// The membership history is a reading of the register and the audit trail. It is
// never written to from the group floor.
router.get('/history', requirePermission('users.view'), c.membershipHistory);
router.post('/', requirePermission('members.create'), c.createUser);
router.patch('/:id', requirePermission('members.edit'), c.updateUser);
router.post('/:id/reset-password', requirePermission('users.manage'), c.adminResetPassword);
router.post('/:id/unlock', requirePermission('users.manage'), c.unlockUser);
router.delete('/:id', requirePermission('users.manage'), c.deactivateUser);
router.post('/:id/reactivate', requirePermission('users.manage'), c.reactivateUser);

module.exports = router;

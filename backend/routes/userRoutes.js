const router = require('express').Router();
const c = require('../controllers/userController');
const { protect, requirePermission } = require('../middleware/auth');

router.use(protect);
router.get('/', requirePermission('users.view'), c.listUsers);
router.post('/', requirePermission('members.create'), c.createUser);
router.patch('/:id', requirePermission('members.edit'), c.updateUser);
router.post('/:id/reset-password', requirePermission('users.manage'), c.adminResetPassword);
router.post('/:id/unlock', requirePermission('users.manage'), c.unlockUser);
router.delete('/:id', requirePermission('users.manage'), c.deactivateUser);
router.post('/:id/reactivate', requirePermission('users.manage'), c.reactivateUser);

module.exports = router;

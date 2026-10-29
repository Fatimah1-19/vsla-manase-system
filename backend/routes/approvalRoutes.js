const router = require('express').Router();
const c = require('../controllers/adminController');
const { protect, requirePermission } = require('../middleware/auth');

// What is waiting to be confirmed: account changes the system administrator
// asked the chairperson or treasurer to confirm. VSLA settings no longer use
// this queue; the chairperson sends them through /settings-requests instead.
router.use(protect);
router.get('/', requirePermission('approvals.view'), c.listPending);
router.post('/:id/decide', requirePermission('approvals.decide'), c.decideChangeRequest);

module.exports = router;

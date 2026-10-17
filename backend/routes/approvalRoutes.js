const router = require('express').Router();
const c = require('../controllers/adminController');
const { protect, requirePermission } = require('../middleware/auth');

// What is waiting to be confirmed: the chairperson confirms account changes the
// administrator asked for; the treasurer confirms group-rule changes the
// chairperson asked for.
router.use(protect);
router.get('/', requirePermission('approvals.view'), c.listPending);
router.post('/:id/decide', requirePermission('approvals.decide'), c.decideChangeRequest);

module.exports = router;

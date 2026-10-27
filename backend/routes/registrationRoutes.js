const router = require('express').Router();
const c = require('../controllers/registrationController');
const { protect, requirePermission, blockSystemAdmin } = require('../middleware/auth');

router.use(protect, blockSystemAdmin);
router.get('/', c.listFees);
router.post('/', requirePermission('registration.record'), c.recordFee);
router.delete('/:id', requirePermission('registration.delete'), c.remove);

module.exports = router;

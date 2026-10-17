const router = require('express').Router();
const c = require('../controllers/contributionController');
const { protect, requirePermission, blockSystemAdmin } = require('../middleware/auth');

router.use(protect, blockSystemAdmin);
router.get('/mine', c.mine);
router.get('/', requirePermission('contributions.view'), c.listMonth);
router.get('/payments', requirePermission('contributions.view'), c.listPayments);
router.get('/arrears', requirePermission('contributions.view'), c.behind);
router.post('/', requirePermission('contributions.record'), c.record);
router.delete('/:id', requirePermission('contributions.delete'), c.remove);

module.exports = router;

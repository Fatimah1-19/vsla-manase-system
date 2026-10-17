const router = require('express').Router();
const c = require('../controllers/fineController');
const { protect, requirePermission, blockSystemAdmin } = require('../middleware/auth');

router.use(protect, blockSystemAdmin);
router.get('/', c.listFines);
router.get('/summary', requirePermission('fines.viewAll'), c.finesSummary);
router.post('/', requirePermission('fines.record'), c.recordFine);
router.patch('/:id/pay', requirePermission('fines.record'), c.markPaid);
router.delete('/:id', requirePermission('fines.delete'), c.deleteFine);

module.exports = router;

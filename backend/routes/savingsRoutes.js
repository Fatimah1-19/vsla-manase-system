const router = require('express').Router();
const c = require('../controllers/savingsController');
const { protect, requirePermission, blockSystemAdmin } = require('../middleware/auth');

router.use(protect, blockSystemAdmin);
router.get('/', requirePermission('savings.view'), c.listSavings);
router.get('/summary', requirePermission('savings.view'), c.savingsSummary);
router.post('/', requirePermission('savings.record'), c.recordSaving);
// The secretary checks the treasurer's entry before it becomes money.
router.patch('/:id/verify', requirePermission('savings.verify'), c.verifySaving);
router.patch('/:id/reject', requirePermission('savings.verify'), c.rejectSaving);
router.patch('/:id', requirePermission('savings.record'), c.updateSaving);
router.delete('/:id', requirePermission('savings.delete'), c.deleteSaving);

module.exports = router;

const router = require('express').Router();
const c = require('../controllers/savingsController');
const { protect, requirePermission, blockSystemAdmin } = require('../middleware/auth');

router.use(protect, blockSystemAdmin);
router.get('/', requirePermission('savings.view'), c.listSavings);
router.get('/summary', requirePermission('savings.view'), c.savingsSummary);
router.post('/', requirePermission('savings.record'), c.recordSaving);
router.patch('/:id', requirePermission('savings.record'), c.updateSaving);
router.delete('/:id', requirePermission('savings.delete'), c.deleteSaving);

module.exports = router;

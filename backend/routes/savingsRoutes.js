const router = require('express').Router();
const c = require('../controllers/savingsController');
const { protect, authorize, committee, recorders, blockSystemAdmin } = require('../middleware/auth');

router.use(protect, blockSystemAdmin);
router.get('/', committee(), c.listSavings);
router.get('/summary', committee(), c.savingsSummary);
router.post('/', recorders(), c.recordSaving);
router.patch('/:id', recorders(), c.updateSaving);
router.delete('/:id', authorize('admin'), c.deleteSaving);

module.exports = router;

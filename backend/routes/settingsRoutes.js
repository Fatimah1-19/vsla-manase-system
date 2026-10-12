const router = require('express').Router();
const c = require('../controllers/settingsController');
const { protect, authorize } = require('../middleware/auth');

router.use(protect);
// System settings are the chairperson's alone: only they may read or change them.
router.get('/', authorize('admin'), c.listSettings);
router.put('/', authorize('admin'), c.updateSettings);

module.exports = router;

const router = require('express').Router();
const { analytics } = require('../controllers/analyticsController');
const { protect, requirePermission, blockSystemAdmin } = require('../middleware/auth');

router.get('/', protect, blockSystemAdmin, requirePermission('analytics.view'), analytics);

module.exports = router;

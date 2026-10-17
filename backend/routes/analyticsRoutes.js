const router = require('express').Router();
const { analytics } = require('../controllers/analyticsController');
const { protect, committee, blockSystemAdmin } = require('../middleware/auth');

router.get('/', protect, blockSystemAdmin, committee(), analytics);

module.exports = router;

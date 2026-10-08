const router = require('express').Router();
const { analytics } = require('../controllers/analyticsController');
const { protect, committee } = require('../middleware/auth');

router.get('/', protect, committee(), analytics);

module.exports = router;

const router = require('express').Router();
const c = require('../controllers/reportController');
const { protect, committee } = require('../middleware/auth');

router.use(protect);
router.get('/absentees', committee(), c.listAbsentees);
router.get('/absentee-register', committee(), c.listAbsenteeRegister);

module.exports = router;

const router = require('express').Router();
const c = require('../controllers/reportController');
const { protect, committee } = require('../middleware/auth');

router.use(protect);
router.get('/absentees', committee(), c.listAbsentees);
router.get('/absentee-register', committee(), c.listAbsenteeRegister);
router.get('/group', committee(), c.groupReport);
router.get('/member/:id', committee(), c.memberReport);

module.exports = router;

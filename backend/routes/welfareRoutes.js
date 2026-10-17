const router = require('express').Router();
const c = require('../controllers/welfareController');
const { protect, recorders, blockSystemAdmin } = require('../middleware/auth');

router.use(protect, blockSystemAdmin);
router.get('/', c.listWelfare);
router.get('/balance', c.getBalance);
router.post('/contribution', recorders(), c.recordContribution);
router.post('/payout', recorders(), c.recordPayout);

module.exports = router;

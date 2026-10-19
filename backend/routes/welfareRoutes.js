const router = require('express').Router();
const c = require('../controllers/welfareController');
const { protect, requirePermission, blockSystemAdmin } = require('../middleware/auth');

router.use(protect, blockSystemAdmin);
router.get('/', c.listWelfare);
router.get('/balance', c.getBalance);
router.get('/summary', c.welfareSummary);
router.post('/contribution', requirePermission('welfare.record'), c.recordContribution);
router.post('/payout', requirePermission('welfare.record'), c.recordPayout);

module.exports = router;

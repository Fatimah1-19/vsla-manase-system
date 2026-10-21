const router = require('express').Router();
const c = require('../controllers/welfareController');
const { protect, requirePermission, blockSystemAdmin } = require('../middleware/auth');

router.use(protect, blockSystemAdmin);
router.get('/', requirePermission('welfare.view'), c.listWelfare);
router.get('/balance', requirePermission('welfare.view'), c.getBalance);
router.get('/summary', requirePermission('welfare.view'), c.welfareSummary);
// A member reads her own welfare record. It is her own record, so it needs no
// office permission; the member comes from her token, never from the request.
router.get('/mine', c.myWelfare);
router.post('/contribution', requirePermission('welfare.record'), c.recordContribution);
router.post('/payout', requirePermission('welfare.record'), c.recordPayout);

module.exports = router;

const router = require('express').Router();
const c = require('../controllers/smsController');
const { protect, requirePermission } = require('../middleware/auth');

router.use(protect, requirePermission('messages.view'));
router.get('/', c.listMessages);
router.get('/stats', c.smsStats);
router.post('/send', requirePermission('messages.send'), c.sendMessage);

module.exports = router;

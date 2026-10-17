const router = require('express').Router();
const c = require('../controllers/memberController');
const { protect, blockSystemAdmin } = require('../middleware/auth');

router.use(protect, blockSystemAdmin);
router.get('/', c.listMembers);
router.get('/me', c.getMyRecord);
router.get('/:id/avatar', c.getMemberAvatar);
router.get('/:id', c.getMember);

module.exports = router;

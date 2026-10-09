const router = require('express').Router();
const c = require('../controllers/profileController');
const { protect } = require('../middleware/auth');

router.use(protect);
router.get('/me', c.getMyProfile);
router.put('/me', c.updateMyProfile);
router.get('/avatar', c.getAvatar);
router.put('/avatar', c.setAvatar);
router.post('/documents', c.uploadDocument);
router.get('/documents/:id', c.downloadDocument);
router.delete('/documents/:id', c.deleteDocument);

module.exports = router;

const router = require('express').Router();
const c = require('../controllers/memberController');
const d = require('../controllers/profileController');
const { protect, blockSystemAdmin, requirePermission } = require('../middleware/auth');

router.use(protect, blockSystemAdmin);
router.get('/', c.listMembers);
router.get('/me', c.getMyRecord);
// The whole shelf of membership papers. Declared before "/:id" so the word
// "documents" is never mistaken for a member number.
router.get('/documents', requirePermission('members.documents.view'), c.listAllDocuments);
router.get('/:id/avatar', c.getMemberAvatar);
router.get('/:id', c.getMember);
// The membership papers stay with the register: the chairperson and the
// secretary file them, the committee may open them.
router.post('/:id/documents', requirePermission('members.documents'), d.uploadMemberDocument);
router.delete('/:id/documents/:docId', requirePermission('members.documents'), d.deleteMemberDocument);

module.exports = router;

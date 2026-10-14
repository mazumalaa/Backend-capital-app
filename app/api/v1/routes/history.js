// IMPORTS...
const router = require('express').Router();
const { authMiddleware, roleMiddleware } = require('../../../middleware/auth');
const { historyOne, getDetail, histories, deleteHistoryController } = require('../controllers/history');

router.get('/histories', authMiddleware , roleMiddleware("admin")  , histories);
router.get('/history', authMiddleware , roleMiddleware("user" , "admin")  , historyOne);
router.get('/history/:_id' , authMiddleware , roleMiddleware("user" , "admin") , getDetail)
router.delete('/history/:_id' , authMiddleware , roleMiddleware("admin") , deleteHistoryController)

// EXPORTS...
module.exports = router;
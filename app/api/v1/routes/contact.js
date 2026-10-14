// routes/contact.js
const express = require('express');
const router = express.Router();
const { addContactController, getContactsController, deleteContactController, updateContactController } = require('../../v1/controllers/contact');
const { roleMiddleware , authMiddleware } = require('../../../middleware/auth');

router.get("/contact", authMiddleware, roleMiddleware("user" , "admin") , getContactsController);
router.post("/contact", authMiddleware, roleMiddleware("user" , "admin")  ,addContactController);
router.put("/contact/update/:id", authMiddleware, roleMiddleware("user" , "admin")  , updateContactController);
router.delete("/contact/:id", authMiddleware, roleMiddleware("user" , "admin"), deleteContactController);

module.exports = router;

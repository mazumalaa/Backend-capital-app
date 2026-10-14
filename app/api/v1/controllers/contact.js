// IMPORTS...
const { addContactService, getContactsService, deleteContactService, updateContactService } = require("../../../services/contact");

// ADD CONTACT
async function addContactController(req, res, next) {
  try {
    const contact = await addContactService(req);
    res.status(201).json({
      message: "Contact added successfully",
      data: contact
    });
  } catch (err) {
    next(err);
  }
}

// UPDATE CONTACT
async function updateContactController(req, res, next) {
  try {
    const contact = await updateContactService(req);
    res.status(201).json({
      message: "Contact updated successfully",
      data: contact
    });
  } catch (err) {
    next(err);
  }
}

// GET CONTACTS
async function getContactsController(req, res, next) {
  try {
    const contacts = await getContactsService(req);
    res.status(200).json({
      message: "Contacts retrieved successfully",
      data: contacts
    });
  } catch (err) {
    next(err);
  }
}

// DELETE CONTACT
async function deleteContactController(req, res, next) {
  try {
    await deleteContactService(req);
    res.status(200).json({
      message: "Contact deleted successfully"
    });
  } catch (err) {
    next(err);
  }
}

// EXPORTS...
module.exports = {
  addContactController,
  getContactsController,
  deleteContactController,
  updateContactController,
};

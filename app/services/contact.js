// IMPORTS...
const Contact = require("../api/v1/models/contact");
const User = require("../api/v1/models/users");
const { BadRequest } = require("../errors/badRequest");
const { NotFound } = require("../errors/notFound");

// CREATE CONTACT
async function addContactService(req) {
  const { phone, alias } = req.body;

  // Cek user yang akan ditambahkan
  const contactUser = await User.findOne({ phone });
  if (!contactUser) throw new NotFound("Contact user not found");

  // Tidak boleh simpan diri sendiri sebagai kontak
  if (contactUser._id.equals(req.user._id)) {
    throw new BadRequest("You cannot add yourself as a contact");
  }

  // Cek apakah kontak sudah pernah ditambahkan
  const exists = await Contact.findOne({
    user_id: req.user._id,
    contact_user_id: contactUser._id
  });

  if (exists) throw new BadRequest("Contact already exists");

  // Simpan kontak
  const contact = await Contact.create({
    user_id: req.user._id,
    contact_user_id: contactUser._id,
    alias: alias || contactUser.username
  });

  return contact;
}

// GET ALL CONTACTS
async function getContactsService(req) {
  const contacts = await Contact.find({ user_id: req.user._id }).populate("contact_user_id", "username phone");
  return contacts;
}

// UPDATE CONTACT
async function updateContactService(req) {
  const {id} = req.params;
  const { alias } = req.body;

  // Validasi input
  if (!id) throw new BadRequest("Contact ID is required");

  // Cari kontak milik user yang sedang login
  const contact = await Contact.findOne({
    _id: id,
    user_id: req.user._id
  });

  if (!contact) throw new NotFound("Contact not found");

  // Update alias jika diberikan
  if (alias) contact.alias = alias;

  await contact.save();

  return {
    message: "Contact updated successfully",
    contact
  };
}


// DELETE CONTACT
async function deleteContactService(req) {
  const { id } = req.params;
  const deleted = await Contact.findOneAndDelete({
    user_id: req.user._id,
    _id: id
  });

  if (!deleted) throw new NotFound("Contact not found or already deleted");

  return { message: "Contact deleted" };
}

// EXPORTS
module.exports = {
  addContactService,
  getContactsService,
  deleteContactService,
  updateContactService
};

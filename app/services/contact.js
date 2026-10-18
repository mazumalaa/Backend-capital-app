// IMPORTS...
const Contact = require("../api/v1/models/contact");
const User = require("../api/v1/models/users");
const { BadRequest } = require("../errors/badRequest");
const { NotFound } = require("../errors/notFound");

// CREATE CONTACT
async function addContactService(req) {
  const { phone, alias } = req.body;

  // Cek user yang akan ditambahkan
  const contactUser = await User.findOne({ phone, role: "user", is_verified: true });
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
  const query = req.query || {};
  const page = Math.max(1, Number.parseInt(query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, Number.parseInt(query.limit, 10) || 10));
  const filter = { user_id: req.user._id };
  const [total, contacts] = await Promise.all([
    Contact.countDocuments(filter),
    Contact.find(filter)
      .sort({ _id: 1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate({
        path: "contact_user_id",
        select: "username phone role",
        match: { role: "user" },
      }),
  ]);
  const visibleContacts = contacts.filter(contact => contact.contact_user_id);
  return {
    contacts: visibleContacts,
    page,
    limit,
    total,
  };
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

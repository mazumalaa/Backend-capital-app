const History = require("../api/v1/models/history");
const mongoose = require("mongoose");
const { BadRequest } = require("../errors/badRequest");
const { NotFound } = require("../errors/notFound");

async function getOneHistory(req) {
     const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
     const limit = Math.min(100, Math.max(1, Number.parseInt(req.query.limit, 10) || 5));
     const condition = {};
     if (req.query.type !== undefined && req.query.type !== "") {
          if (typeof req.query.type !== "string" || !["topup", "transfer"].includes(req.query.type.toLowerCase())) {
               throw new BadRequest("History type is invalid");
          }
          condition.type = req.query.type.toLowerCase();
     }
     const user_id = req.user._id;
     condition.user_id = user_id;
     const skip = (page - 1) * limit;
     const [total, history] = await Promise.all([
          History.countDocuments(condition),
          History.find(condition)
               .skip(skip)
               .limit(limit)
               .sort({ createdAt: -1, _id: -1 })
               .lean(),
     ]);
     return { history, total, limit, page, skip };
}

async function getAllHistory(req) {
     const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
     const limit = Math.min(100, Math.max(1, Number.parseInt(req.query.limit, 10) || 50));
     const type = req.query.type;
     const keyword = req.query.keyword;

     const condition = {};

     if (type !== undefined && type !== "") {
          if (typeof type !== "string" || !["topup", "transfer"].includes(type.toLowerCase())) {
               throw new BadRequest("History type is invalid");
          }
          condition.type = type.toLowerCase();
     }

     if (keyword !== undefined && keyword !== "") {
          if (typeof keyword !== "string") throw new BadRequest("History keyword is invalid");
          const normalizedKeyword = keyword.trim();
          const escapedKeyword = normalizedKeyword.slice(0, 100).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
          if (escapedKeyword) {
               condition.$or = [
                    { type: { $regex: escapedKeyword, $options: "i" } },
                    { description: { $regex: escapedKeyword, $options: "i" } },
                    { amount: Number.isNaN(Number(normalizedKeyword)) ? undefined : Number(normalizedKeyword) }
               ].filter(Boolean);
          }
     }

     const skip = (page - 1) * limit;
     const [total, history] = await Promise.all([
          History.countDocuments(condition),
          History.find(condition)
               .skip(skip)
               .limit(limit)
               .sort({ createdAt: -1, _id: -1 })
               .lean(),
     ]);

     return { history, total, limit, page, skip };
}


async function getDetailHistory(req) {
     const _id = req.params._id;
     if (!mongoose.Types.ObjectId.isValid(_id)) throw new NotFound("History not found");
     const filter = { _id };
     if (req.user.role !== "admin") filter.user_id = req.user._id;
     const history = await History.findOne(filter).lean();
     if(!history) throw new NotFound("History not found");
     return history;
}

async function deleteHistory(req) {
     const _id = req.params._id;
     if (!mongoose.Types.ObjectId.isValid(_id)) throw new NotFound("History not found");
     const result = await History.deleteOne({ _id });
     if (!result.deletedCount) throw new NotFound("History not found");

     return { message: "History successfully deleted." };
}

async function deleteHistories(req) {
     const values = req.body?.historyIds;
     if (!Array.isArray(values) || values.length === 0 || values.length > 100) {
          throw new BadRequest("Select between 1 and 100 history items to delete");
     }
     if (values.some(value => typeof value !== "string" || !mongoose.Types.ObjectId.isValid(value))) {
          throw new BadRequest("One or more history IDs are invalid");
     }
     const historyIds = [...new Set(values.map(value => new mongoose.Types.ObjectId(value)))];
     const result = await History.deleteMany({ _id: { $in: historyIds } });
     return { deleted: result.deletedCount };
}

module.exports = {getAllHistory, getOneHistory, getDetailHistory, deleteHistory, deleteHistories };

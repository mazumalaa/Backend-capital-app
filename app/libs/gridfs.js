const mongoose = require("mongoose");

const BUCKET_NAME = "profileImages";

function getBucket() {
     const database = mongoose.connection.db;
     if (!database) throw new Error("MongoDB connection is not available");
     return new mongoose.mongo.GridFSBucket(database, { bucketName: BUCKET_NAME });
}

function storeImage(file, userId) {
     const bucket = getBucket();
     return new Promise((resolve, reject) => {
          const uploadStream = bucket.openUploadStream(file.originalname, {
               contentType: file.mimetype,
               metadata: { user_id: userId },
          });
          uploadStream.once("error", reject);
          uploadStream.once("finish", () => resolve({ id: uploadStream.id }));
          uploadStream.end(file.buffer);
     });
}

async function deleteImage(fileId) {
     if (!fileId) return;
     await getBucket().delete(new mongoose.Types.ObjectId(fileId));
}

async function findImage(fileId) {
     const [file] = await getBucket()
          .find({ _id: new mongoose.Types.ObjectId(fileId) })
          .limit(1)
          .toArray();
     return file || null;
}

function openImageDownload(fileId) {
     return getBucket().openDownloadStream(new mongoose.Types.ObjectId(fileId));
}

module.exports = { storeImage, deleteImage, findImage, openImageDownload };

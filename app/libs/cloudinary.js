const cloudinary = require("cloudinary").v2;
const {
     CLOUDINARY_CLOUD_NAME,
     CLOUDINARY_API_KEY,
     CLOUDINARY_API_SECRET,
} = require("../config");

function getCloudinary() {
     if (!CLOUDINARY_CLOUD_NAME || !CLOUDINARY_API_KEY || !CLOUDINARY_API_SECRET) {
          throw new Error(
               "Cloudinary is not configured. Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET."
          );
     }

     cloudinary.config({
          cloud_name: CLOUDINARY_CLOUD_NAME,
          api_key: CLOUDINARY_API_KEY,
          api_secret: CLOUDINARY_API_SECRET,
          secure: true,
     });
     return cloudinary;
}

function uploadImage(file, userId) {
     const client = getCloudinary();
     return new Promise((resolve, reject) => {
          const uploadStream = client.uploader.upload_stream(
               {
                    folder: "capital/profile-images",
                    public_id: `${userId}-${Date.now()}`,
                    resource_type: "image",
               },
               (error, result) => {
                    if (error) {
                         reject(error);
                         return;
                    }
                    if (!result?.secure_url || !result.public_id) {
                         reject(new Error("Cloudinary did not return an uploaded image."));
                         return;
                    }
                    resolve({
                         publicId: result.public_id,
                         url: result.secure_url,
                    });
               }
          );
          uploadStream.end(file.buffer);
     });
}

async function deleteImage(publicId) {
     if (!publicId) return;
     const result = await getCloudinary().uploader.destroy(publicId, {
          resource_type: "image",
          invalidate: true,
     });
     if (result.result !== "ok" && result.result !== "not found") {
          throw new Error(`Cloudinary could not delete the image: ${result.result}`);
     }
}

module.exports = { uploadImage, deleteImage };

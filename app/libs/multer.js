// IMPORTS...
const multer = require("multer");
const { BadRequest } = require("../errors/badRequest");

const fileFilter = (req, file,  cb) => {
     const allowTypes = ["image/jpg" , "image/png" , "image/jpeg" , "image/webp"];
     if(!allowTypes.includes(file.mimetype)) {
          cb(new BadRequest("Only image files are allowed (jpg, png, webp)"), false);
          return;
     }
     cb(null , true);
}
const  upload = multer({
   storage: multer.memoryStorage(),
   fileFilter:fileFilter,
   limits:{fileSize: 2 * 1024 * 1024}
})

module.exports = upload;
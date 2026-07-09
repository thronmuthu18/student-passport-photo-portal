const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Ensure uploads directory exists
const uploadDir = path.join(__dirname, '../../uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Configure storage to use memory storage for GridFS uploads
const storage = multer.memoryStorage();

// File filter for JPG, JPEG, PNG
const fileFilter = (req, file, cb) => {
  const allowedMimeTypes = ['image/jpeg', 'image/jpg', 'image/png'];
  const allowedExtensions = ['.jpg', '.jpeg', '.png'];
  const fileExt = path.extname(file.originalname).toLowerCase();

  // 1. Verify extension
  if (!allowedExtensions.includes(fileExt)) {
    return cb(new Error('Only JPG, JPEG, and PNG images are allowed.'), false);
  }

  // 2. Reject double extensions
  const dotsCount = (file.originalname.match(/\./g) || []).length;
  if (dotsCount !== 1) {
    return cb(new Error('Invalid filename format (double extensions are forbidden).'), false);
  }

  // 3. Verify MIME type
  if (allowedMimeTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Only JPG, JPEG, and PNG images are allowed.'), false);
  }
};

// Multer upload instance
const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 40 * 1024 // 40 KB limit
  }
});

// Middleware wrapper to catch Multer errors and return clean JSON
const uploadSinglePhoto = (req, res, next) => {
  const uploadProcess = upload.single('photo');
  
  uploadProcess(req, res, (err) => {
    if (err) {
      if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return res.status(400).json({
            success: false,
            message: 'Maximum image size is 40 KB.'
          });
        }
        return res.status(400).json({
          success: false,
          message: `Upload error: ${err.message}`
        });
      }
      return res.status(400).json({
        success: false,
        message: err.message
      });
    }
    next();
  });
};

module.exports = {
  uploadSinglePhoto
};

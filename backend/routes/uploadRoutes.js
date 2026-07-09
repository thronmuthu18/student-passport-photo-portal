const express = require('express');
const router = express.Router();
const { uploadSinglePhoto } = require('../middleware/uploadMiddleware');
const { handleUpload } = require('../controllers/uploadController');
const { downloadAllPhotos } = require('../controllers/downloadController');

const { uploadLimiter } = require('../middleware/securityMiddleware');

// POST /upload
router.post('/upload', uploadLimiter, uploadSinglePhoto, handleUpload);

// GET /download-all
router.get('/download-all', downloadAllPhotos);

module.exports = router;

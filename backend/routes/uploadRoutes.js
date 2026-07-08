const express = require('express');
const router = express.Router();
const { uploadSinglePhoto } = require('../middleware/uploadMiddleware');
const { handleUpload } = require('../controllers/uploadController');

// POST /upload
router.post('/upload', uploadSinglePhoto, handleUpload);

module.exports = router;

const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const Student = require('../models/Student');

// Helper to escape HTML characters
const escapeHTML = (str) => {
  return str.replace(/[&<>"']/g, (match) => {
    const escapeMap = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#x27;'
    };
    return escapeMap[match];
  });
};

// Helper to sanitize student name
const sanitizeName = (name) => {
  return escapeHTML(name.trim())
    .replace(/[\r\n\t\0]/g, '') // Remove null and control chars
    .replace(/[\/\\]/g, '')     // Remove path separators
    .replace(/%/g, '')          // Remove percent signs
    .replace(/\.\./g, '')       // Remove dot-dot traversal
    .replace(/\s+/g, '-')       // Replace multiple spaces with a single hyphen
    .replace(/[^a-zA-Z0-9\-_&;#]/g, ''); // Keep only safe alphanumeric, hyphens, and escaped entities
};

// Helper to sanitize register number
const sanitizeRegisterNumber = (regNum) => {
  return regNum
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, ''); // Keep only alphanumeric
};

// Helper to check image magic bytes signature on memory buffer
const verifyImageSignature = (buffer) => {
  try {
    if (!buffer || buffer.length < 8) return null;
    const hex = buffer.slice(0, 8).toString('hex').toUpperCase();

    // PNG signature: 89504E470D0A1A0A
    if (hex.startsWith('89504E470D0A1A0A')) {
      return 'png';
    }
    // JPEG/JPG signature: starts with FFD8FF
    if (hex.startsWith('FFD8FF')) {
      return 'jpeg';
    }
    
    return null;
  } catch (err) {
    console.error(`[${new Date().toISOString()}] [ERROR] File signature check error:`, err.message);
    return null;
  }
};

const handleUpload = async (req, res) => {
  const memoryFile = req.file;

  try {
    const { studentName, registerNumber } = req.body;

    // 1. Check for missing fields
    if (!studentName || !registerNumber || !memoryFile) {
      console.warn(`[${new Date().toISOString()}] [WARN] Invalid Request: Missing fields. IP=${req.ip}`);
      return res.status(400).json({
        success: false,
        message: 'All fields are required.'
      });
    }

    // 2. Prevent Object / Prototype Pollution injection by forcing string checks
    if (typeof studentName !== 'string' || typeof registerNumber !== 'string') {
      console.warn(`[${new Date().toISOString()}] [WARN] Invalid Request: Fields are not strings. IP=${req.ip}`);
      return res.status(400).json({
        success: false,
        message: 'Invalid input format.'
      });
    }

    // 3. Name Validation (Length Check & Sanitization)
    const nameTrimmed = studentName.trim();
    if (nameTrimmed.length < 2 || nameTrimmed.length > 50) {
      console.warn(`[${new Date().toISOString()}] [WARN] Invalid Request: Name length out of bounds. IP=${req.ip}`);
      return res.status(400).json({
        success: false,
        message: 'Student Name must be between 2 and 50 characters.'
      });
    }

    // 4. Register Number Validation (Alphanumeric and length check)
    const regTrimmed = registerNumber.trim().toUpperCase();
    const regPattern = /^[A-Z0-9]{8,15}$/;
    if (!regPattern.test(regTrimmed)) {
      console.warn(`[${new Date().toISOString()}] [WARN] Invalid Request: Register number validation failure. Reg="${regTrimmed}", IP=${req.ip}`);
      return res.status(400).json({
        success: false,
        message: 'Register Number must be alphanumeric and between 8 and 15 characters.'
      });
    }

    const sanitizedRegNum = sanitizeRegisterNumber(regTrimmed);
    const sanitizedName = sanitizeName(nameTrimmed);

    if (!sanitizedRegNum || !sanitizedName) {
      console.warn(`[${new Date().toISOString()}] [WARN] Invalid Request: Sanitized values are empty. IP=${req.ip}`);
      return res.status(400).json({
        success: false,
        message: 'Student Name and Register Number contain invalid characters.'
      });
    }

    // 5. Image Binary Signature Check (Magic Bytes Verification on buffer)
    const signatureType = verifyImageSignature(memoryFile.buffer);
    if (!signatureType) {
      console.warn(`[${new Date().toISOString()}] [WARN] Invalid Request: Image binary signature check failed. File="${memoryFile.originalname}", IP=${req.ip}`);
      return res.status(400).json({
        success: false,
        message: 'Invalid image binary signature. Upload only valid PNG or JPG photos.'
      });
    }

    // 6. Check for duplicate Register Number in database
    const existingStudent = await Student.findOne({ registerNumber: sanitizedRegNum });
    if (existingStudent) {
      console.warn(`[${new Date().toISOString()}] [WARN] Duplicate Register Number Attempt: Reg="${sanitizedRegNum}", IP=${req.ip}`);
      return res.status(400).json({
        success: false,
        message: 'This Register Number has already uploaded a photo.'
      });
    }

    // 7. GridFS Bucket Setup
    const bucket = new mongoose.mongo.GridFSBucket(mongoose.connection.db, {
      bucketName: 'studentPhotos'
    });

    const fileExt = path.extname(memoryFile.originalname).toLowerCase();
    const finalFileName = `${sanitizedRegNum}-${sanitizedName}${fileExt}`;

    // 8. Stream the actual image bytes to MongoDB Atlas GridFS
    let fileId;
    try {
      fileId = await new Promise((resolve, reject) => {
        const uploadStream = bucket.openUploadStream(finalFileName, {
          contentType: memoryFile.mimetype,
          metadata: {
            studentName: sanitizedName,
            registerNumber: sanitizedRegNum,
            originalName: memoryFile.originalname,
            uploadedAt: new Date()
          }
        });

        uploadStream.on('error', (err) => {
          reject(err);
        });

        uploadStream.on('finish', () => {
          resolve(uploadStream.id);
        });

        uploadStream.write(memoryFile.buffer);
        uploadStream.end();
      });
    } catch (uploadError) {
      console.error(`[${new Date().toISOString()}] [ERROR] GridFS upload failed:`, uploadError.message);
      return res.status(500).json({
        success: false,
        message: 'Failed to upload photo to database.'
      });
    }

    // 9. Save Student metadata record referencing GridFS photoFileId
    try {
      const newStudent = new Student({
        studentName: sanitizedName,
        registerNumber: sanitizedRegNum,
        photoFileName: finalFileName,
        photoPath: `/uploads/${finalFileName}`, // Kept for backward compatibility
        photoFileId: fileId
      });

      await newStudent.save();

      console.log(`[${new Date().toISOString()}] [INFO] Upload Successful: Reg="${sanitizedRegNum}", Name="${sanitizedName}", FileId="${fileId}", IP=${req.ip}`);

      return res.status(200).json({
        success: true,
        message: 'Upload Successful',
        student: {
          studentName: newStudent.studentName,
          registerNumber: newStudent.registerNumber
        }
      });

    } catch (saveError) {
      console.error(`[${new Date().toISOString()}] [ERROR] MongoDB Student record save failed:`, saveError.message);

      // ATOMIC ROLLBACK: Delete orphaned GridFS binary file
      try {
        await bucket.delete(fileId);
        console.log(`[${new Date().toISOString()}] [INFO] Atomic Rollback: Cleaned up orphaned GridFS file ID: ${fileId}`);
      } catch (deleteError) {
        console.error(`[${new Date().toISOString()}] [ERROR] Atomic Rollback failed to delete file ${fileId}:`, deleteError.message);
      }

      return res.status(500).json({
        success: false,
        message: 'Failed to save student details. Photo upload rolled back.'
      });
    }

  } catch (error) {
    console.error(`[${new Date().toISOString()}] [ERROR] Upload failed internally:`, error.message);
    return res.status(500).json({
      success: false,
      message: 'An error occurred during upload. Please try again.'
    });
  }
};

module.exports = {
  handleUpload
};

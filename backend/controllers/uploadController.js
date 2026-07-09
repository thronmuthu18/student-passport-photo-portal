const fs = require('fs');
const path = require('path');
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

// Helper to check image magic bytes signature
const verifyImageSignature = (filePath) => {
  try {
    const buffer = Buffer.alloc(8);
    const fd = fs.openSync(filePath, 'r');
    fs.readSync(fd, buffer, 0, 8, 0);
    fs.closeSync(fd);
    
    const hex = buffer.toString('hex').toUpperCase();

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
  const tempFile = req.file;

  try {
    const { studentName, registerNumber } = req.body;

    // 1. Check for missing fields
    if (!studentName || !registerNumber || !tempFile) {
      if (tempFile && fs.existsSync(tempFile.path)) {
        fs.unlinkSync(tempFile.path);
      }
      console.warn(`[${new Date().toISOString()}] [WARN] Invalid Request: Missing fields. IP=${req.ip}`);
      return res.status(400).json({
        success: false,
        message: 'All fields are required.'
      });
    }

    // 2. Prevent Object / Prototype Pollution injection by forcing string checks
    if (typeof studentName !== 'string' || typeof registerNumber !== 'string') {
      if (fs.existsSync(tempFile.path)) {
        fs.unlinkSync(tempFile.path);
      }
      console.warn(`[${new Date().toISOString()}] [WARN] Invalid Request: Fields are not strings. IP=${req.ip}`);
      return res.status(400).json({
        success: false,
        message: 'Invalid input format.'
      });
    }

    // 3. Name Validation (Length Check & Sanitization)
    const nameTrimmed = studentName.trim();
    if (nameTrimmed.length < 2 || nameTrimmed.length > 50) {
      if (fs.existsSync(tempFile.path)) {
        fs.unlinkSync(tempFile.path);
      }
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
      if (fs.existsSync(tempFile.path)) {
        fs.unlinkSync(tempFile.path);
      }
      console.warn(`[${new Date().toISOString()}] [WARN] Invalid Request: Register number validation failure. Reg="${regTrimmed}", IP=${req.ip}`);
      return res.status(400).json({
        success: false,
        message: 'Register Number must be alphanumeric and between 8 and 15 characters.'
      });
    }

    const sanitizedRegNum = sanitizeRegisterNumber(regTrimmed);
    const sanitizedName = sanitizeName(nameTrimmed);

    if (!sanitizedRegNum || !sanitizedName) {
      if (fs.existsSync(tempFile.path)) {
        fs.unlinkSync(tempFile.path);
      }
      console.warn(`[${new Date().toISOString()}] [WARN] Invalid Request: Sanitized values are empty. IP=${req.ip}`);
      return res.status(400).json({
        success: false,
        message: 'Student Name and Register Number contain invalid characters.'
      });
    }

    // 5. Image Binary Signature Check (Magic Bytes Verification)
    const signatureType = verifyImageSignature(tempFile.path);
    if (!signatureType) {
      if (fs.existsSync(tempFile.path)) {
        fs.unlinkSync(tempFile.path);
      }
      console.warn(`[${new Date().toISOString()}] [WARN] Invalid Request: Image binary signature check failed. File="${tempFile.originalname}", IP=${req.ip}`);
      return res.status(400).json({
        success: false,
        message: 'Invalid image binary signature. Upload only valid PNG or JPG photos.'
      });
    }

    // 6. Check for duplicate Register Number in database (Query injection protected via strict schema cast)
    const existingStudent = await Student.findOne({ registerNumber: sanitizedRegNum });
    if (existingStudent) {
      if (fs.existsSync(tempFile.path)) {
        fs.unlinkSync(tempFile.path);
      }
      console.warn(`[${new Date().toISOString()}] [WARN] Duplicate Register Number Attempt: Reg="${sanitizedRegNum}", IP=${req.ip}`);
      return res.status(400).json({
        success: false,
        message: 'This Register Number has already uploaded a photo.'
      });
    }

    // 7. Safe Renaming and File Placement
    const fileExt = path.extname(tempFile.originalname).toLowerCase();
    const finalFileName = `${sanitizedRegNum}-${sanitizedName}${fileExt}`;
    const targetPath = path.join(__dirname, '../../uploads', finalFileName);

    // If final file already exists physically but not in DB, delete the existing file to avoid orphans
    if (fs.existsSync(targetPath)) {
      try {
        fs.unlinkSync(targetPath);
      } catch (err) {
        console.error(`[${new Date().toISOString()}] [ERROR] Failed to delete existing file:`, err.message);
      }
    }

    // Move/rename file
    fs.renameSync(tempFile.path, targetPath);

    // 8. Save metadata to MongoDB
    const relativePhotoPath = `/uploads/${finalFileName}`;
    const newStudent = new Student({
      studentName: sanitizedName,
      registerNumber: sanitizedRegNum,
      photoFileName: finalFileName,
      photoPath: relativePhotoPath
    });

    await newStudent.save();

    console.log(`[${new Date().toISOString()}] [INFO] Upload Successful: Reg="${sanitizedRegNum}", Name="${sanitizedName}", IP=${req.ip}`);

    return res.status(200).json({
      success: true,
      message: 'Upload Successful',
      student: {
        studentName: newStudent.studentName,
        registerNumber: newStudent.registerNumber
      }
    });

  } catch (error) {
    console.error(`[${new Date().toISOString()}] [ERROR] Upload failed internally:`, error.message);
    
    // Cleanup upload file on server error
    if (tempFile && fs.existsSync(tempFile.path)) {
      try {
        fs.unlinkSync(tempFile.path);
      } catch (err) {
        console.error(`[${new Date().toISOString()}] [ERROR] Cleanup failed:`, err.message);
      }
    }
    return res.status(500).json({
      success: false,
      message: 'An error occurred during upload. Please try again.'
    });
  }
};

module.exports = {
  handleUpload
};

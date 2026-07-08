const fs = require('fs');
const path = require('path');
const Student = require('../models/Student');

// Helper to sanitize student name
const sanitizeName = (name) => {
  return name
    .trim()
    .replace(/\s+/g, '-') // Replace multiple spaces with a single hyphen
    .replace(/[^a-zA-Z0-9\-_]/g, ''); // Remove special characters except hyphen and underscore
};

// Helper to sanitize register number
const sanitizeRegisterNumber = (regNum) => {
  return regNum
    .trim()
    .toUpperCase()
    .replace(/[^a-zA-Z0-9]/g, ''); // Allow only letters and numbers
};

const handleUpload = async (req, res) => {
  const tempFile = req.file;

  try {
    const { studentName, registerNumber } = req.body;

    // 1. Validate fields on backend
    if (!studentName || !registerNumber || !tempFile) {
      // If file was uploaded, clean it up
      if (tempFile) {
        fs.unlinkSync(tempFile.path);
      }
      return res.status(400).json({
        success: false,
        message: 'All fields are required.'
      });
    }

    const sanitizedRegNum = sanitizeRegisterNumber(registerNumber);
    const sanitizedName = sanitizeName(studentName);

    if (!sanitizedRegNum || !sanitizedName) {
      fs.unlinkSync(tempFile.path);
      return res.status(400).json({
        success: false,
        message: 'Student Name and Register Number contain invalid characters.'
      });
    }

    // 2. Check for duplicate Register Number in database
    const existingStudent = await Student.findOne({ registerNumber: sanitizedRegNum });
    if (existingStudent) {
      // Delete temp file
      fs.unlinkSync(tempFile.path);
      return res.status(400).json({
        success: false,
        message: 'This Register Number has already uploaded a photo.'
      });
    }

    // 3. Rename file
    const fileExt = path.extname(tempFile.originalname).toLowerCase();
    // Use format RegisterNumber-StudentName.ext
    const finalFileName = `${sanitizedRegNum}-${sanitizedName}${fileExt}`;
    const targetPath = path.join(__dirname, '../../uploads', finalFileName);

    // If final file already exists physically but not in DB (edge case), delete the existing one or overwrite
    if (fs.existsSync(targetPath)) {
      try {
        fs.unlinkSync(targetPath);
      } catch (err) {
        console.error('Failed to delete existing file on disk:', err);
      }
    }

    // Move/rename file
    fs.renameSync(tempFile.path, targetPath);

    // 4. Save metadata to MongoDB
    const relativePhotoPath = `/uploads/${finalFileName}`;
    const newStudent = new Student({
      studentName: sanitizedName,
      registerNumber: sanitizedRegNum,
      photoFileName: finalFileName,
      photoPath: relativePhotoPath
    });

    await newStudent.save();

    return res.status(200).json({
      success: true,
      message: 'Upload Successful',
      student: {
        studentName: newStudent.studentName,
        registerNumber: newStudent.registerNumber
      }
    });

  } catch (error) {
    console.error('Error during upload processing:', error);
    // Cleanup upload file on server error
    if (tempFile && fs.existsSync(tempFile.path)) {
      try {
        fs.unlinkSync(tempFile.path);
      } catch (err) {
        console.error('Failed to delete temp file on error:', err);
      }
    }
    return res.status(500).json({
      success: false,
      message: 'Server error occurred during upload. Please try again.'
    });
  }
};

module.exports = {
  handleUpload
};

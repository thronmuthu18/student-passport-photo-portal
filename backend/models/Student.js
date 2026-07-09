const mongoose = require('mongoose');

const studentSchema = new mongoose.Schema({
  studentName: {
    type: String,
    required: [true, 'Student Name is required'],
    trim: true
  },
  registerNumber: {
    type: String,
    required: [true, 'Register Number is required'],
    unique: true,
    trim: true,
    uppercase: true
  },
  photoFileName: {
    type: String,
    required: [true, 'Photo file name is required']
  },
  photoPath: {
    type: String,
    required: false
  },
  photoFileId: {
    type: mongoose.Schema.Types.ObjectId,
    required: false
  },
  uploadedAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('Student', studentSchema);

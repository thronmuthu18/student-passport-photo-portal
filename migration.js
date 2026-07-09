require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const Student = require('./backend/models/Student');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/student_passport_portal';
const uploadsDir = path.join(__dirname, 'uploads');

async function runMigration() {
  console.log(`[${new Date().toISOString()}] [INFO] Starting GridFS Migration Utility...`);

  // 1. Establish Database Connection
  try {
    await mongoose.connect(MONGODB_URI);
    console.log(`[${new Date().toISOString()}] [INFO] Successfully connected to MongoDB.`);
  } catch (dbErr) {
    console.error(`[${new Date().toISOString()}] [ERROR] Database connection failed:`, dbErr.message);
    process.exit(1);
  }

  try {
    // 2. Fetch all student records
    const students = await Student.find();
    if (students.length === 0) {
      console.log(`[${new Date().toISOString()}] [INFO] No student records found in the database. Nothing to migrate.`);
      await mongoose.connection.close();
      return;
    }

    console.log(`[${new Date().toISOString()}] [INFO] Found ${students.length} student records to check.`);

    // 3. Initialize GridFS Bucket
    const bucket = new mongoose.mongo.GridFSBucket(mongoose.connection.db, {
      bucketName: 'studentPhotos'
    });

    let migratedCount = 0;
    let skippedCount = 0;
    let failedCount = 0;

    // 4. Iterate over student records
    for (const student of students) {
      const regNum = student.registerNumber;
      const fileName = student.photoFileName;

      // Rule A: If already has GridFS reference, skip to avoid duplicates
      if (student.photoFileId) {
        console.log(`[SKIP] Student ${regNum} already has GridFS reference: ID=${student.photoFileId}`);
        skippedCount++;
        continue;
      }

      // Rule B: Look for physical file in the local uploads directory
      const localFilePath = path.join(uploadsDir, fileName);

      if (!fs.existsSync(localFilePath)) {
        console.warn(`[FAILED] Student ${regNum} photo file "${fileName}" is missing from local filesystem. Image cannot be reconstructed from metadata alone.`);
        failedCount++;
        continue;
      }

      // Rule C: Read local file and stream to GridFS
      try {
        const fileBuffer = fs.readFileSync(localFilePath);
        
        // Define file MIME type (basic guess from extension)
        const ext = path.extname(fileName).toLowerCase();
        let mimeType = 'image/jpeg';
        if (ext === '.png') {
          mimeType = 'image/png';
        }

        // Upload local file buffer to GridFS
        const fileId = await new Promise((resolve, reject) => {
          const uploadStream = bucket.openUploadStream(fileName, {
            contentType: mimeType,
            metadata: {
              studentName: student.studentName,
              registerNumber: regNum,
              originalName: fileName,
              uploadedAt: student.uploadedAt || new Date()
            }
          });

          uploadStream.on('error', (err) => {
            reject(err);
          });

          uploadStream.on('finish', () => {
            resolve(uploadStream.id);
          });

          uploadStream.write(fileBuffer);
          uploadStream.end();
        });

        // Update student document with photoFileId and save
        student.photoFileId = fileId;
        await student.save();

        console.log(`[MIGRATED] Student ${regNum} migrated to GridFS: FileID=${fileId}`);
        migratedCount++;

      } catch (migrateErr) {
        console.error(`[ERROR] Failed to migrate student ${regNum}:`, migrateErr.message);
        failedCount++;
      }
    }

    // 5. Final Report Summary
    console.log('\n======================================');
    console.log('       MIGRATION RUN REPORT           ');
    console.log('======================================');
    console.log(`Total Student Records Checked : ${students.length}`);
    console.log(`Successfully Migrated         : ${migratedCount}`);
    console.log(`Skipped (Already Migrated)    : ${skippedCount}`);
    console.log(`Failed (Missing Local Files)  : ${failedCount}`);
    console.log('======================================\n');

  } catch (err) {
    console.error(`[${new Date().toISOString()}] [ERROR] Migration crashed:`, err.message);
  } finally {
    // 6. Safely Close Connection
    await mongoose.connection.close();
    console.log(`[${new Date().toISOString()}] [INFO] Database connection closed.`);
  }
}

// Execute migration
runMigration();

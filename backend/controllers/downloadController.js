const mongoose = require('mongoose');
const archiver = require('archiver');
const Student = require('../models/Student');

const downloadAllPhotos = async (req, res) => {
  const providedKey = req.query.key;
  const secretKey = process.env.DOWNLOAD_SECRET;

  // 1. Verify if DOWNLOAD_SECRET is configured on the server
  if (!secretKey || secretKey.trim() === '') {
    console.error(`[${new Date().toISOString()}] [ERROR] DOWNLOAD_SECRET environment variable is not configured on Render!`);
    return res.status(500).set('Content-Type', 'text/plain').send('Server configuration error.');
  }

  // 2. Verify if key is missing
  if (!providedKey) {
    console.warn(`[${new Date().toISOString()}] [WARN] Unauthorized ZIP Download Attempt (Missing Key): IP=${req.ip}`);
    return res.status(401).set('Content-Type', 'text/plain').send('Unauthorized');
  }

  // 3. Verify if key is incorrect
  if (providedKey !== secretKey) {
    console.warn(`[${new Date().toISOString()}] [WARN] Forbidden ZIP Download Attempt (Incorrect Key): IP=${req.ip}`);
    return res.status(403).set('Content-Type', 'text/plain').send('Forbidden');
  }

  try {
    // 4. Fetch all student metadata records
    const students = await Student.find();
    if (students.length === 0) {
      return res.status(200).set('Content-Type', 'text/plain').send('No uploaded photos found.');
    }

    // Initialize GridFS bucket
    const bucket = new mongoose.mongo.GridFSBucket(mongoose.connection.db, {
      bucketName: 'studentPhotos'
    });

    // 5. Check if there are any documents with valid file references in GridFS
    const filesCollection = mongoose.connection.db.collection('studentPhotos.files');
    const dbFilesCount = await filesCollection.countDocuments();
    
    if (dbFilesCount === 0) {
      return res.status(200).set('Content-Type', 'text/plain').send('No uploaded photos found.');
    }

    // Set download headers for ZIP streaming
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', 'attachment; filename="FinalYear_CSE_Passport_Photos.zip"');

    // Create a zip archiver instance
    const archive = archiver('zip', {
      zlib: { level: 9 } // Maximum compression level
    });

    // Catch warnings
    archive.on('warning', (err) => {
      console.warn(`[${new Date().toISOString()}] [WARN] Archiver warning:`, err.message);
    });

    // Catch archiving errors
    archive.on('error', (err) => {
      console.error(`[${new Date().toISOString()}] [ERROR] Archiver error:`, err.message);
      if (!res.headersSent) {
        res.status(500).set('Content-Type', 'text/plain').send('Could not generate ZIP archive.');
      }
    });

    // Pipe the archive output directly to the Express response
    archive.pipe(res);

    let validPhotosCount = 0;
    let missingPhotosCount = 0;

    // Loop through all student records to append their photos from GridFS
    for (const student of students) {
      if (!student.photoFileId) {
        console.warn(`[${new Date().toISOString()}] [WARN] Student record for Reg="${student.registerNumber}" lacks a GridFS file reference.`);
        missingPhotosCount++;
        continue;
      }

      // Check if file actually exists in the GridFS files metadata collection
      const fileMeta = await filesCollection.findOne({ _id: student.photoFileId });
      if (!fileMeta) {
        console.warn(`[${new Date().toISOString()}] [WARN] GridFS file referenced by Reg="${student.registerNumber}" (File ID: ${student.photoFileId}) was not found in database.`);
        missingPhotosCount++;
        continue;
      }

      // Open a GridFS download stream and append it directly to the archiver stream
      const downloadStream = bucket.openDownloadStream(student.photoFileId);
      
      // Handle read stream errors to prevent crashing the response
      downloadStream.on('error', (streamErr) => {
        console.error(`[${new Date().toISOString()}] [ERROR] Stream read error for Reg="${student.registerNumber}":`, streamErr.message);
      });

      archive.append(downloadStream, { name: student.photoFileName });
      validPhotosCount++;
    }

    // Finalize the archive stream (closes the pipe and flushes to browser)
    await archive.finalize();

    console.log(`[${new Date().toISOString()}] [INFO] ZIP Download Completed. Total Students Checked: ${students.length}, Zipped Photos: ${validPhotosCount}, Missing Photos: ${missingPhotosCount}`);

  } catch (error) {
    console.error(`[${new Date().toISOString()}] [ERROR] Dynamic ZIP zipping failed:`, error.message);
    if (!res.headersSent) {
      res.status(500).set('Content-Type', 'text/plain').send('An error occurred while compiling the ZIP archive.');
    }
  }
};

module.exports = {
  downloadAllPhotos
};

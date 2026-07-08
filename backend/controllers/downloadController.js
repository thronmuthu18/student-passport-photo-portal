const fs = require('fs');
const path = require('path');
const archiver = require('archiver');

const downloadAllPhotos = async (req, res) => {
  const uploadsDir = path.join(__dirname, '../../uploads');

  // Verify uploads directory exists
  if (!fs.existsSync(uploadsDir)) {
    return res.status(200).set('Content-Type', 'text/plain').send('No photos have been uploaded yet.');
  }

  try {
    // Read files in uploads directory
    const files = fs.readdirSync(uploadsDir);

    // Filter out temporary files and keep only valid photo extensions
    const photoFiles = files.filter(file => {
      const ext = path.extname(file).toLowerCase();
      return !file.startsWith('temp-') && ['.jpg', '.jpeg', '.png'].includes(ext);
    });

    // Check if there are any files to zip
    if (photoFiles.length === 0) {
      return res.status(200).set('Content-Type', 'text/plain').send('No photos have been uploaded yet.');
    }

    // Set download headers for ZIP streaming
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', 'attachment; filename="FinalYear_CSE_Passport_Photos.zip"');

    // Create a zip archiver instance
    const archive = archiver('zip', {
      zlib: { level: 9 } // Maximum compression level
    });

    // Catch warnings (e.g. stat failures)
    archive.on('warning', (err) => {
      if (err.code === 'ENOENT') {
        console.warn('Archiver warning (ENOENT):', err);
      } else {
        throw err;
      }
    });

    // Catch archiving errors
    archive.on('error', (err) => {
      console.error('Archiver error:', err);
      // If headers haven't been sent yet, send a 500 error, otherwise end the response
      if (!res.headersSent) {
        res.status(500).send({ success: false, message: 'Could not generate ZIP archive.' });
      }
    });

    // Pipe the archive output directly to the Express response
    archive.pipe(res);

    // Add each photo to the archive
    photoFiles.forEach(file => {
      const filePath = path.join(uploadsDir, file);
      archive.file(filePath, { name: file });
    });

    // Finalize the archive stream (this closes the pipe and flushes output)
    await archive.finalize();

  } catch (error) {
    console.error('Error zipping uploads:', error);
    if (!res.headersSent) {
      res.status(500).set('Content-Type', 'text/plain').send('An error occurred while zipping files.');
    }
  }
};

module.exports = {
  downloadAllPhotos
};

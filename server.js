require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const path = require('path');
const fs = require('fs');
const helmet = require('helmet');
const compression = require('compression');
const uploadRoutes = require('./backend/routes/uploadRoutes');
const {
  enforceHttps,
  validateCors,
  filterHttpMethods,
  preventCaching
} = require('./backend/middleware/securityMiddleware');

const app = express();
const PORT = process.env.PORT || 5000;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/student_passport_portal';

// 1. Disable X-Powered-By header
app.disable('x-powered-by');

// 2. Configure Helmet Security Headers (with CSP for CDNs)
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "https://cdn.jsdelivr.net"],
        styleSrc: [
          "'self'",
          "'unsafe-inline'",
          "https://cdn.jsdelivr.net",
          "https://fonts.googleapis.com"
        ],
        fontSrc: [
          "'self'",
          "https://fonts.gstatic.com",
          "https://fonts.googleapis.com"
        ],
        imgSrc: ["'self'", "data:", "blob:"],
        connectSrc: ["'self'"],
        objectSrc: ["'none'"],
        upgradeInsecureRequests: [],
      },
    },
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    frameguard: { action: 'deny' }
  })
);

// 3. Enable GZIP compression
app.use(compression());

// 4. Standard Express body parsers
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 5. Apply Global Custom Security Middlewares
app.use(enforceHttps);
app.use(validateCors);
app.use(filterHttpMethods);
app.use(preventCaching);

// Ensure uploads folder exists
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// 6. Prevent Directory Listing on uploads path
app.get('/uploads', (req, res) => {
  console.warn(`[${new Date().toISOString()}] [WARN] Directory listing blocked on /uploads: IP=${req.ip}`);
  return res.status(403).send('Directory listing is forbidden.');
});

app.get('/uploads/', (req, res) => {
  console.warn(`[${new Date().toISOString()}] [WARN] Directory listing blocked on /uploads/: IP=${req.ip}`);
  return res.status(403).send('Directory listing is forbidden.');
});

// Serve uploaded photos
app.use('/uploads', express.static(uploadsDir));

// Serve frontend static files
app.use(express.static(path.join(__dirname, 'frontend')));

// Register Routes
app.use(uploadRoutes);

// Catch-all route for frontend (SPA fallback)
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'frontend', 'index.html'));
});

// 7. Global Error Handler (Prevents stack trace leaks)
app.use((err, req, res, next) => {
  console.error(`[${new Date().toISOString()}] [ERROR] Unhandled error:`, err.message);
  if (res.headersSent) {
    return next(err);
  }
  return res.status(500).json({
    success: false,
    message: 'An internal server error occurred.'
  });
});

// Database Connection and Server Startup
mongoose
  .connect(MONGODB_URI)
  .then(() => {
    console.log(`[${new Date().toISOString()}] [INFO] Successfully connected to MongoDB.`);
    app.listen(PORT, () => {
      console.log(`[${new Date().toISOString()}] [INFO] Server is running on port ${PORT}`);
    });
  })
  .catch((err) => {
    console.error(`[${new Date().toISOString()}] [ERROR] Database connection failed.`);
    process.exit(1);
  });

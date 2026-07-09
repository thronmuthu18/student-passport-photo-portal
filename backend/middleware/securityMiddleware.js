const rateLimit = require('express-rate-limit');

// 1. Rate Limiting: Max 5 uploads per IP per 15 minutes
const uploadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5,
  handler: (req, res) => {
    console.warn(`[${new Date().toISOString()}] [WARN] Rate Limit Violation: IP=${req.ip}, URL=${req.originalUrl}`);
    return res.status(429).json({
      success: false,
      message: 'Too many requests. Please try again after 15 minutes.'
    });
  },
  standardHeaders: true,
  legacyHeaders: false
});

// 2. HTTPS Enforcer (for Production environment)
const enforceHttps = (req, res, next) => {
  if (process.env.NODE_ENV === 'production') {
    const proto = req.headers['x-forwarded-proto'];
    if (proto !== 'https') {
      console.warn(`[${new Date().toISOString()}] [WARN] Blocked insecure HTTP request: IP=${req.ip}`);
      return res.status(403).send('HTTPS required.');
    }
  }
  next();
};

// 3. Strict CORS Validation
const allowedOrigins = ['https://stdpassportpic.netlify.app'];

const validateCors = (req, res, next) => {
  const origin = req.headers.origin;

  // Allow requests with no origin (like mobile apps, same-origin, curl)
  if (!origin) {
    return next();
  }

  // Check if origin is allowed (or if local development environment allows localhost)
  const isAllowed = allowedOrigins.includes(origin) || 
                    (process.env.NODE_ENV !== 'production' && 
                     (origin.startsWith('http://localhost') || origin.startsWith('http://127.0.0.1')));

  if (isAllowed) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    
    // Handle preflight OPTIONS request
    if (req.method === 'OPTIONS') {
      return res.sendStatus(200);
    }
    next();
  } else {
    console.warn(`[${new Date().toISOString()}] [WARN] CORS Blocked: Origin=${origin}, IP=${req.ip}`);
    return res.status(403).send('CORS request forbidden.');
  }
};

// 4. HTTP Method Filter: Only allow GET, POST, OPTIONS
const filterHttpMethods = (req, res, next) => {
  const allowedMethods = ['GET', 'POST', 'OPTIONS'];
  if (!allowedMethods.includes(req.method)) {
    console.warn(`[${new Date().toISOString()}] [WARN] Blocked unsupported HTTP method: Method=${req.method}, IP=${req.ip}`);
    return res.status(405).send('Method Not Allowed');
  }
  next();
};

// 5. Caching Prevention Middleware
const preventCaching = (req, res, next) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  next();
};

module.exports = {
  uploadLimiter,
  enforceHttps,
  validateCors,
  filterHttpMethods,
  preventCaching
};

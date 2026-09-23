/**
 * Production Web Server for Hostinger Web App / Cloud / VPS Deployments
 * Live Arena Counter Assistant
 */

const path = require('path');
const fs = require('fs');

const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';
const ROOT_DIR = __dirname;

// Attempt to use Express if installed, otherwise fall back to native Node HTTP module
function startWithExpress() {
  const express = require('express');
  const app = express();

  // Security & Cache Headers
  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    next();
  });

  // Health check endpoint for Hostinger load balancers & container monitors
  app.get(['/health', '/ping'], (req, res) => {
    res.status(200).json({
      status: 'ok',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
      service: 'live-counter-website'
    });
  });

  // Serve static files with caching
  app.use(express.static(ROOT_DIR, {
    maxAge: '1d',
    etag: true,
    setHeaders: (res, filePath) => {
      if (filePath.endsWith('.html') || filePath.endsWith('sw.js')) {
        // Do not cache HTML or Service Worker to ensure instant updates
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      } else if (filePath.endsWith('.webmanifest')) {
        res.setHeader('Content-Type', 'application/manifest+json');
        res.setHeader('Cache-Control', 'public, max-age=86400');
      } else if (filePath.match(/\.(jpg|jpeg|png|gif|svg|ico|webp|mp3|wav|ogg)$/)) {
        res.setHeader('Cache-Control', 'public, max-age=604800, immutable');
      }
    }
  }));

  // Fallback route to index.html
  app.get('*', (req, res) => {
    res.sendFile(path.join(ROOT_DIR, 'index.html'));
  });

  const server = app.listen(PORT, HOST, () => {
    console.log(`[Hostinger Web App] Live Counter server running on http://${HOST}:${PORT}`);
    console.log(`[Hostinger Web App] Health check available at http://${HOST}:${PORT}/health`);
  });

  setupGracefulShutdown(server);
}

// Fallback native HTTP server if express is not yet installed
function startNativeHttp() {
  const http = require('http');

  const MIME_TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.json': 'application/json',
    '.webmanifest': 'application/manifest+json',
    '.svg': 'image/svg+xml',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.webp': 'image/webp',
    '.ico': 'image/x-icon',
    '.mp3': 'audio/mpeg',
    '.wav': 'audio/wav',
    '.ogg': 'audio/ogg'
  };

  const server = http.createServer((req, res) => {
    // Health check
    if (req.url === '/health' || req.url === '/ping') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ status: 'ok', uptime: process.uptime() }));
    }

    const cleanUrl = req.url.split('?')[0];
    let filePath = path.join(ROOT_DIR, cleanUrl === '/' ? 'index.html' : cleanUrl);

    // Prevent directory traversal
    if (!filePath.startsWith(ROOT_DIR)) {
      res.writeHead(403);
      return res.end('Forbidden');
    }

    fs.stat(filePath, (err, stats) => {
      if (err || !stats.isFile()) {
        filePath = path.join(ROOT_DIR, 'index.html');
      }

      const ext = path.extname(filePath).toLowerCase();
      const contentType = MIME_TYPES[ext] || 'application/octet-stream';

      fs.readFile(filePath, (readErr, content) => {
        if (readErr) {
          res.writeHead(500);
          return res.end('Internal Server Error');
        }
        res.writeHead(200, {
          'Content-Type': contentType,
          'X-Content-Type-Options': 'nosniff'
        });
        res.end(content);
      });
    });
  });

  server.listen(PORT, HOST, () => {
    console.log(`[Hostinger Web App - Native] Server running on http://${HOST}:${PORT}`);
  });

  setupGracefulShutdown(server);
}

function setupGracefulShutdown(server) {
  const shutdown = (signal) => {
    console.log(`[Hostinger Web App] Received ${signal}. Closing server gracefully...`);
    server.close(() => {
      console.log('[Hostinger Web App] Server closed.');
      process.exit(0);
    });
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

// Bootstrap
try {
  startWithExpress();
} catch (err) {
  if (err.code === 'MODULE_NOT_FOUND') {
    console.warn('[Hostinger Web App] Express not found, using zero-dependency HTTP server fallback.');
    startNativeHttp();
  } else {
    console.error('[Hostinger Web App] Startup error:', err);
    process.exit(1);
  }
}

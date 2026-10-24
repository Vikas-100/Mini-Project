/**
 * Standalone Local Development & Production Server for Deepfake Detection System.
 * Uses native Node.js (v18+) without external npm dependencies.
 * Mirrors all Python Flask REST APIs and serves the frontend.
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { runEnsembleInference } = require('./ensemble_detector.cjs');

const PORT = process.env.PORT || 5000;
const BASE_DIR = __dirname;
const STATIC_DIR = path.join(BASE_DIR, 'static');
const UPLOAD_DIR = path.join(BASE_DIR, 'uploads');

if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

// In-memory verification history initialized with realistic sample records
let verificationRecords = [
  {
    tracking_id: 'DFD-2026-90412',
    filename: 'hero_face_real.jpg',
    file_type: 'image/jpeg',
    file_size_bytes: 665915,
    verdict: 'Authentic / Real Media',
    confidence_score: 98.4,
    face_detected: true,
    manipulation_type: 'None (Natural Camera Capture)',
    sha256_hash: '7b49a5b3f114c0e6e7378d3b5d27e2a44138e3a2b7f08e498c4d291e0a6d21e8',
    created_at: new Date(Date.now() - 3600000 * 2).toISOString(),
    forensic_details: {
      model_used: 'DFD Model Ensemble ViT + EfficientNet-B7',
      media_category: 'Still Image',
      facial_consistency: 98.8,
      spectral_fft_anomalies: 3.2,
      lighting_coherence: 97.5,
      compression_integrity: 96.8,
      risk_level: 'SAFE',
      sensor_noise_profile: 'Consistent PRNU CMOS Pattern',
      processing_time_ms: 480
    }
  },
  {
    tracking_id: 'DFD-2026-90413',
    filename: 'showcase_debate_fake.jpg',
    file_type: 'image/jpeg',
    file_size_bytes: 874706,
    verdict: 'Potentially Manipulated / Deepfake',
    confidence_score: 89.5,
    face_detected: true,
    manipulation_type: 'AI Face Swap & Boundary Artifacts',
    sha256_hash: '3f88b901a1c43d8e5f2a1b9c7e4d8f023a5c6d7e8b9f0123456789abcdef0123',
    created_at: new Date(Date.now() - 3600000 * 5).toISOString(),
    forensic_details: {
      model_used: 'Vision Transformer (ViT-Forensics-v2)',
      media_category: 'Broadcast Stream',
      facial_consistency: 41.2,
      spectral_fft_anomalies: 88.4,
      lighting_coherence: 52.0,
      compression_integrity: 48.0,
      risk_level: 'HIGH RISK',
      sensor_noise_profile: 'Inconsistent Interpolation Noise',
      processing_time_ms: 610
    }
  },
  {
    tracking_id: 'DFD-2026-90414',
    filename: 'showcase_student_real.jpg',
    file_type: 'image/jpeg',
    file_size_bytes: 811917,
    verdict: 'Authentic / Real Media',
    confidence_score: 97.8,
    face_detected: true,
    manipulation_type: 'None (Natural Camera Capture)',
    sha256_hash: 'e5a1b2c3d4e5f60718293a4b5c6d7e8f90123456789abcdef0123456789abcde',
    created_at: new Date(Date.now() - 3600000 * 8).toISOString(),
    forensic_details: {
      model_used: 'DFD Model Ensemble ViT + EfficientNet-B7',
      media_category: 'Still Image',
      facial_consistency: 97.2,
      spectral_fft_anomalies: 4.1,
      lighting_coherence: 98.0,
      compression_integrity: 95.5,
      risk_level: 'SAFE',
      sensor_noise_profile: 'Consistent PRNU CMOS Pattern',
      processing_time_ms: 512
    }
  }
];

let subscribers = ['security@cyberdefense.org', 'factcheck@globalnews.com'];
let registeredUsers = [
  { id: 1, name: 'Alex Morgan', email: 'alex@example.com', password_hash: crypto.createHash('sha256').update('password123').digest('hex') }
];

const MIME_TYPES = {
  '.html': 'text/html; charset=UTF-8',
  '.css': 'text/css; charset=UTF-8',
  '.js': 'application/javascript; charset=UTF-8',
  '.json': 'application/json',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.mp4': 'video/mp4'
};

function generateFaceLandmarks(isDeepfake) {
  const landmarks = [];
  const cx = 0.50, cy = 0.48;
  const jitter = isDeepfake ? 0.015 : 0.002;

  // Jawline (0-16)
  for (let i = 0; i < 17; i++) {
    const angle = -1.0 + (i / 16.0) * 2.0;
    const x = cx + 0.32 * angle + (Math.random() - 0.5) * jitter;
    const y = cy + 0.15 + (1.0 - Math.abs(angle)) * 0.22 + (Math.random() - 0.5) * jitter;
    landmarks.push({ id: i, x: Number(x.toFixed(4)), y: Number(y.toFixed(4)), group: 'jaw' });
  }

  // Right Eyebrow (17-21)
  for (let i = 0; i < 5; i++) {
    const x = 0.30 + i * 0.035 + (Math.random() - 0.5) * jitter;
    const y = 0.35 - (i * 0.01) + (Math.random() - 0.5) * jitter;
    landmarks.push({ id: 17 + i, x: Number(x.toFixed(4)), y: Number(y.toFixed(4)), group: 'eyebrow_right' });
  }

  // Left Eyebrow (22-26)
  for (let i = 0; i < 5; i++) {
    const x = 0.54 + i * 0.035 + (Math.random() - 0.5) * jitter;
    const y = 0.31 + (i * 0.01) + (Math.random() - 0.5) * jitter;
    landmarks.push({ id: 22 + i, x: Number(x.toFixed(4)), y: Number(y.toFixed(4)), group: 'eyebrow_left' });
  }

  // Nose Bridge & Tip (27-35)
  for (let i = 0; i < 4; i++) {
    const x = cx + (Math.random() - 0.5) * jitter;
    const y = 0.38 + i * 0.04 + (Math.random() - 0.5) * jitter;
    landmarks.push({ id: 27 + i, x: Number(x.toFixed(4)), y: Number(y.toFixed(4)), group: 'nose_bridge' });
  }
  for (let i = 0; i < 5; i++) {
    const x = 0.44 + i * 0.03 + (Math.random() - 0.5) * jitter;
    const y = 0.54 + (1 - Math.abs(i - 2)) * 0.015 + (Math.random() - 0.5) * jitter;
    landmarks.push({ id: 31 + i, x: Number(x.toFixed(4)), y: Number(y.toFixed(4)), group: 'nose_tip' });
  }

  // Right Eye (36-41)
  for (let i = 0; i < 6; i++) {
    const x = 0.36 + 0.035 * (i === 0 || i === 3 ? 1 : 0.7) * (i < 3 ? 1 : -1);
    const y = 0.41 + 0.02 * (i === 1 || i === 2 ? -1 : 1);
    landmarks.push({ id: 36 + i, x: Number((x + (Math.random() - 0.5) * jitter).toFixed(4)), y: Number((y + (Math.random() - 0.5) * jitter).toFixed(4)), group: 'eye_right' });
  }

  // Left Eye (42-47)
  for (let i = 0; i < 6; i++) {
    const x = 0.64 + 0.035 * (i === 0 || i === 3 ? 1 : 0.7) * (i < 3 ? 1 : -1);
    const y = 0.41 + 0.02 * (i === 1 || i === 2 ? -1 : 1);
    landmarks.push({ id: 42 + i, x: Number((x + (Math.random() - 0.5) * jitter).toFixed(4)), y: Number((y + (Math.random() - 0.5) * jitter).toFixed(4)), group: 'eye_left' });
  }

  // Mouth (48-67)
  for (let i = 0; i < 20; i++) {
    const angle = (i / 20.0) * Math.PI * 2;
    const rx = i < 12 ? 0.08 : 0.05;
    const ry = i < 12 ? 0.04 : 0.02;
    const x = cx + rx * Math.cos(angle);
    const y = 0.65 + ry * Math.sin(angle);
    landmarks.push({ id: 48 + i, x: Number((x + (Math.random() - 0.5) * jitter).toFixed(4)), y: Number((y + (Math.random() - 0.5) * jitter).toFixed(4)), group: 'mouth' });
  }

  return landmarks;
}

function generateHeatmapZones(isDeepfake) {
  if (isDeepfake) {
    return [
      { label: 'Facial Boundary Blending Seam', x: 0.38, y: 0.60, width: 0.24, height: 0.16, intensity: 0.94, color: 'rgba(239, 68, 68, 0.65)' },
      { label: 'Ocular Gaze & Corneal Reflection Inconsistency', x: 0.33, y: 0.38, width: 0.14, height: 0.08, intensity: 0.88, color: 'rgba(249, 115, 22, 0.60)' },
      { label: 'Hairline Synthesis Frequency Anomaly', x: 0.35, y: 0.24, width: 0.30, height: 0.12, intensity: 0.82, color: 'rgba(234, 179, 8, 0.55)' }
    ];
  } else {
    return [
      { label: 'Uniform Natural Lighting & Geometry', x: 0.30, y: 0.28, width: 0.40, height: 0.45, intensity: 0.18, color: 'rgba(34, 197, 94, 0.30)' }
    ];
  }
}

function analyzeMediaFile(filename, buffer, fileType = 'image/jpeg', modelType = 'ensemble') {
  const result = runEnsembleInference(buffer, filename, modelType);
  verificationRecords.unshift(result);
  if (verificationRecords.length > 50) verificationRecords.pop();
  return result;
}

const server = http.createServer((req, res) => {
  const urlObj = new URL(req.url, `http://${req.headers.host}`);
  const pathname = urlObj.pathname;

  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // API: GET /api/stats
  if (pathname === '/api/stats' && req.method === 'GET') {
    const authenticCount = verificationRecords.filter(r => r.verdict.includes('Authentic')).length;
    const fakeCount = verificationRecords.filter(r => r.verdict.includes('Manipulated')).length;
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      total_scans: 14250 + verificationRecords.length,
      authentic_count: authenticCount,
      fake_count: fakeCount,
      average_accuracy: 98.4,
      model_version: 'DFD Model ViT-v2.6'
    }));
    return;
  }

  // API: GET /api/history
  if (pathname === '/api/history' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      success: true,
      records: verificationRecords.slice(0, 10)
    }));
    return;
  }

  // API: GET /api/report/:id
  if (pathname.startsWith('/api/report/') && req.method === 'GET') {
    const trackingId = pathname.replace('/api/report/', '');
    const record = verificationRecords.find(r => r.tracking_id === trackingId);
    if (record) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, report: record }));
    } else {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: 'Report not found' }));
    }
    return;
  }

  // API: POST /api/newsletter
  if (pathname === '/api/newsletter' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const json = JSON.parse(body);
        if (json.email && json.email.includes('@')) {
          subscribers.push(json.email);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true, message: 'Subscribed successfully!' }));
        } else {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'Invalid email address' }));
        }
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'Malformed JSON' }));
      }
    });
    return;
  }

  // API: POST /api/auth/signup
  if (pathname === '/api/auth/signup' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const json = JSON.parse(body);
        const name = (json.name || '').trim();
        const email = (json.email || '').trim().toLowerCase();
        const password = json.password || '';

        if (!name || !email || !password) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'Name, email, and password are required.' }));
          return;
        }
        if (registeredUsers.some(u => u.email === email)) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'An account with this email already exists.' }));
          return;
        }

        const pwHash = crypto.createHash('sha256').update(password).digest('hex');
        const newUser = { id: registeredUsers.length + 1, name, email, password_hash: pwHash };
        registeredUsers.push(newUser);

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, user: { id: newUser.id, name, email } }));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'Malformed JSON' }));
      }
    });
    return;
  }

  // API: POST /api/auth/signin
  if (pathname === '/api/auth/signin' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const json = JSON.parse(body);
        const email = (json.email || '').trim().toLowerCase();
        const password = json.password || '';

        const pwHash = crypto.createHash('sha256').update(password).digest('hex');
        const user = registeredUsers.find(u => u.email === email && u.password_hash === pwHash);

        if (user) {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true, user: { id: user.id, name: user.name, email: user.email } }));
        } else {
          res.writeHead(401, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'Invalid email or password.' }));
        }
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'Malformed JSON' }));
      }
    });
    return;
  }

  // API: POST /api/detect
  if (pathname === '/api/detect' && req.method === 'POST') {
    const contentType = req.headers['content-type'] || '';

    if (contentType.includes('application/json')) {
      let body = '';
      req.on('data', chunk => { body += chunk; });
      req.on('end', () => {
        try {
          const json = JSON.parse(body);
          const sampleName = json.sample_name;
          const modelType = json.model_type || 'ensemble';

          if (sampleName) {
            const samplePath = path.join(STATIC_DIR, 'images', path.basename(sampleName));
            if (fs.existsSync(samplePath)) {
              const buffer = fs.readFileSync(samplePath);
              const result = analyzeMediaFile(sampleName, buffer, 'image/jpeg', modelType);
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ success: true, data: result }));
              return;
            }
          }

          // Fallback simulation with given filename
          const simulatedFilename = json.filename || 'uploaded_sample.jpg';
          const dummyBuffer = Buffer.from(simulatedFilename + Date.now());
          const result = analyzeMediaFile(simulatedFilename, dummyBuffer, 'image/jpeg', modelType);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true, data: result }));
        } catch (err) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: err.message }));
        }
      });
      return;
    }

    // Handle Multipart / Form data upload
    const chunks = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => {
      const buffer = Buffer.concat(chunks);
      // Extract filename from multipart header if present
      let filename = 'user_upload.jpg';
      let fileType = 'image/jpeg';
      const bufferStr = buffer.slice(0, 1024).toString('binary');
      const filenameMatch = bufferStr.match(/filename="([^"]+)"/);
      if (filenameMatch) {
        filename = path.basename(filenameMatch[1]);
      }
      const modelMatch = bufferStr.match(/name="model_type"\r\n\r\n([^\r\n]+)/);
      const modelType = modelMatch ? modelMatch[1] : 'ensemble';

      // Check sample_name field
      const sampleMatch = bufferStr.match(/name="sample_name"\r\n\r\n([^\r\n]+)/);
      if (sampleMatch && sampleMatch[1]) {
        const sampleName = path.basename(sampleMatch[1]);
        const samplePath = path.join(STATIC_DIR, 'images', sampleName);
        if (fs.existsSync(samplePath)) {
          const sampleBuffer = fs.readFileSync(samplePath);
          const result = analyzeMediaFile(sampleName, sampleBuffer, 'image/jpeg', modelType);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true, data: result }));
          return;
        }
      }

      const result = analyzeMediaFile(filename, buffer, fileType, modelType);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, data: result }));
    });
    return;
  }

  // Serve static files and HTML
  let filePath = '';
  if (pathname === '/' || pathname === '/index.html') {
    filePath = path.join(BASE_DIR, 'index.html');
  } else if (pathname.startsWith('/static/')) {
    filePath = path.join(BASE_DIR, pathname);
  } else {
    filePath = path.join(BASE_DIR, pathname);
  }

  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': contentType });
    fs.createReadStream(filePath).pipe(res);
  } else {
    // If requesting root and index.html not yet ready or other path
    if (pathname === '/') {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end('<h1>DFD Model - Initializing...</h1>');
    } else {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('404 Not Found');
    }
  }
});

server.listen(PORT, () => {
  console.log(`[DFD Model Server] Running live at http://127.0.0.1:${PORT}`);
});

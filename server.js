require('dotenv').config();

const express = require('express');
const fsSync = require('fs');
const fs = require('fs/promises');
const path = require('path');
const cookieParser = require('cookie-parser');
const crypto = require('crypto');
const { OAuth2Client } = require('google-auth-library');

const app = express();
const PORT = 3006;
const ROOT_DIR = path.resolve(process.env.EDITOR_ROOT || 'C:/Project');
const START_PATH = String(process.env.START_PATH || '').trim();
const SESSION_COOKIE = 'auth_token';
const DAY4_ENV_PATH = 'C:/Project/day4/apps/api/.env';
const ALLOWED_GOOGLE_EMAILS = String(process.env.ALLOWED_GOOGLE_EMAILS || process.env.ALLOWED_GOOGLE_EMAIL || '')
  .split(',')
  .map((email) => email.trim().toLowerCase())
  .filter(Boolean);
const sessions = new Set();

const EDITABLE_EXTENSIONS = new Set([
  '.txt', '.md', '.json', '.js', '.ts', '.tsx', '.jsx', '.html', '.css', '.scss', '.xml', '.yml', '.yaml',
  '.py', '.java', '.c', '.cpp', '.h', '.hpp', '.cs', '.go', '.rs', '.sh', '.ps1', '.sql', '.ini', '.env',
  '.log', '.csv'
]);

const MIME_BY_EXTENSION = {
  '.txt': 'text/plain',
  '.md': 'text/markdown',
  '.json': 'application/json',
  '.js': 'text/javascript',
  '.ts': 'text/typescript',
  '.html': 'text/html',
  '.css': 'text/css',
  '.xml': 'application/xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.mp4': 'video/mp4',
  '.mov': 'video/quicktime',
  '.avi': 'video/x-msvideo',
  '.mkv': 'video/x-matroska',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.pdf': 'application/pdf',
  '.zip': 'application/zip'
};

function readDay4GoogleClientId() {
  try {
    const envFile = fsSync.readFileSync(DAY4_ENV_PATH, 'utf8');
    const match = envFile.match(/^GOOGLE_CLIENT_ID=(.+)$/m);
    return match ? match[1].trim() : '';
  } catch {
    return '';
  }
}

const googleClientId = readDay4GoogleClientId();
const googleClient = googleClientId ? new OAuth2Client(googleClientId) : null;

app.use(express.json({ limit: '10mb' }));
app.use(cookieParser());
app.use((req, res, next) => {
  if (req.path === '/' || req.path.endsWith('.js') || req.path.endsWith('.css') || req.path.endsWith('.html')) {
    res.set('Cache-Control', 'no-store');
  }

  if (req.path === '/' || req.path === '/login' || req.path.endsWith('.html')) {
    res.type('text/html; charset=utf-8');
  } else if (req.path.endsWith('.js')) {
    res.type('application/javascript; charset=utf-8');
  } else if (req.path.endsWith('.css')) {
    res.type('text/css; charset=utf-8');
  }

  next();
});

function isAuthed(req) {
  const token = req.cookies?.[SESSION_COOKIE];
  return token ? sessions.has(token) : false;
}

function authRequired(req, res, next) {
  if (isAuthed(req)) return next();

  if (req.path.startsWith('/api/')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  return res.redirect('/login');
}

function resolveSafePath(relativePath = '') {
  const clean = String(relativePath || '').replace(/\\/g, '/');
  const resolved = path.resolve(ROOT_DIR, clean);
  if (!resolved.startsWith(ROOT_DIR)) {
    throw new Error('Invalid path');
  }
  return resolved;
}

function getFileExtension(filePath) {
  const baseName = path.basename(filePath).toLowerCase();
  const extension = path.extname(baseName).toLowerCase();
  if (extension) return extension;
  if (baseName.startsWith('.') && baseName.indexOf('.', 1) === -1) {
    return baseName;
  }
  return '';
}

async function listDirectory(absPath) {
  const entries = await fs.readdir(absPath, { withFileTypes: true });
  return entries
    .map((entry) => ({
      name: entry.name,
      type: entry.isDirectory() ? 'directory' : 'file',
    }))
    .sort((a, b) => {
      if (a.type !== b.type) return a.type === 'directory' ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
}

app.get('/login', (req, res) => {
  if (isAuthed(req)) {
    return res.redirect('/');
  }
  return res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.get('/login.css', (req, res) => {
  return res.sendFile(path.join(__dirname, 'public', 'login.css'));
});

app.get('/login.js', (req, res) => {
  return res.sendFile(path.join(__dirname, 'public', 'login.js'));
});

app.get('/favicon.svg', (req, res) => {
  return res.sendFile(path.join(__dirname, 'public', 'favicon.svg'));
});

app.get('/auth/google-config', (req, res) => {
  if (!googleClientId) {
    return res.status(500).json({ error: 'day4 Google client ID를 찾을 수 없습니다.' });
  }

  return res.json({ clientId: googleClientId });
});

app.post('/auth/google', async (req, res) => {
  try {
    if (!googleClient || !googleClientId) {
      return res.status(500).json({ error: 'Google 로그인 설정이 없습니다.' });
    }

    const credential = String(req.body?.credential || '');
    if (!credential) {
      return res.status(400).json({ error: 'Google 인증 정보가 없습니다.' });
    }

    const ticket = await googleClient.verifyIdToken({
      idToken: credential,
      audience: googleClientId,
    });

    const payload = ticket.getPayload();
    const email = String(payload?.email || '').toLowerCase();
    const emailVerified = Boolean(payload?.email_verified);

    if (!emailVerified) {
      return res.status(403).json({ error: 'Google 이메일 인증이 필요합니다.' });
    }

    if (!ALLOWED_GOOGLE_EMAILS.includes(email)) {
      return res.status(403).json({ error: '승인되지 않은 Google 계정입니다.' });
    }

    const token = crypto.randomUUID();
    sessions.add(token);
    res.cookie(SESSION_COOKIE, token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: false,
      maxAge: 1000 * 60 * 60 * 8,
    });

    return res.json({ ok: true, email });
  } catch {
    return res.status(401).json({ error: 'Google 로그인 검증에 실패했습니다.' });
  }
});

app.post('/logout', authRequired, (req, res) => {
  const token = req.cookies?.[SESSION_COOKIE];
  if (token) sessions.delete(token);
  res.clearCookie(SESSION_COOKIE);
  res.json({ ok: true });
});

app.get('/', authRequired, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/styles.css', authRequired, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'styles.css'));
});

app.get('/app.js', authRequired, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'app.js'));
});

app.get('/api/tree', authRequired, async (req, res) => {
  try {
    const relPath = req.query.path || '';
    const absPath = resolveSafePath(relPath);
    const stats = await fs.stat(absPath);
    if (!stats.isDirectory()) {
      return res.status(400).json({ error: 'Not a directory' });
    }

    const items = await listDirectory(absPath);

    res.json({
      root: ROOT_DIR,
      path: relPath,
      startPath: START_PATH,
      items,
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.get('/api/file-info', authRequired, async (req, res) => {
  try {
    const relPath = req.query.path;
    if (!relPath) {
      return res.status(400).json({ error: 'Path is required' });
    }

    const absPath = resolveSafePath(relPath);
    const stats = await fs.stat(absPath);
    if (!stats.isFile()) {
      return res.status(400).json({ error: 'Not a file' });
    }

    const extension = getFileExtension(absPath);
    const editable = EDITABLE_EXTENSIONS.has(extension);
    const mimeType = MIME_BY_EXTENSION[extension] || 'application/octet-stream';

    res.json({
      path: relPath,
      name: path.basename(absPath),
      extension: extension || '(none)',
      size: stats.size,
      mimeType,
      editable,
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.get('/api/raw', authRequired, async (req, res) => {
  try {
    const relPath = req.query.path;
    if (!relPath) {
      return res.status(400).json({ error: 'Path is required' });
    }

    const absPath = resolveSafePath(relPath);
    const stats = await fs.stat(absPath);
    if (!stats.isFile()) {
      return res.status(400).json({ error: 'Not a file' });
    }

    return res.sendFile(absPath);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

app.get('/api/download', authRequired, async (req, res) => {
  try {
    const relPath = req.query.path;
    if (!relPath) {
      return res.status(400).json({ error: 'Path is required' });
    }

    const absPath = resolveSafePath(relPath);
    const stats = await fs.stat(absPath);
    if (!stats.isFile()) {
      return res.status(400).json({ error: 'Not a file' });
    }

    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Length', stats.size);
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(path.basename(absPath))}"`);
    return fsSync.createReadStream(absPath).pipe(res);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

app.get('/api/file', authRequired, async (req, res) => {
  try {
    const relPath = req.query.path;
    if (!relPath) {
      return res.status(400).json({ error: 'Path is required' });
    }

    const absPath = resolveSafePath(relPath);
    const stats = await fs.stat(absPath);
    if (!stats.isFile()) {
      return res.status(400).json({ error: 'Not a file' });
    }

    const extension = getFileExtension(absPath);
    if (!EDITABLE_EXTENSIONS.has(extension)) {
      return res.status(400).json({ error: '이 파일 형식은 편집할 수 없습니다.' });
    }

    const content = await fs.readFile(absPath, 'utf8');
    res.json({ path: relPath, content });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.delete('/api/file', authRequired, async (req, res) => {
  try {
    const relPath = req.query.path;
    if (!relPath) {
      return res.status(400).json({ error: 'Path is required' });
    }

    const absPath = resolveSafePath(relPath);
    const stats = await fs.stat(absPath);
    if (!stats.isFile()) {
      return res.status(400).json({ error: 'Not a file' });
    }

    await fs.unlink(absPath);
    return res.json({ ok: true, path: relPath });
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

app.post('/api/file', authRequired, async (req, res) => {
  try {
    const { path: relPath, content } = req.body || {};
    if (!relPath) {
      return res.status(400).json({ error: 'Path is required' });
    }

    const absPath = resolveSafePath(relPath);
    const extension = getFileExtension(absPath);
    if (!EDITABLE_EXTENSIONS.has(extension)) {
      return res.status(400).json({ error: '이 파일 형식은 편집할 수 없습니다.' });
    }

    await fs.writeFile(absPath, String(content ?? ''), 'utf8');
    res.json({ ok: true, path: relPath });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`FBridge running on http://0.0.0.0:${PORT}`);
  console.log(`Editing root: ${ROOT_DIR}`);
  console.log(`Start path: ${START_PATH || '(root)'}`);
  console.log(`Google login client loaded: ${googleClientId ? 'yes' : 'no'}`);
  console.log(`Allowed Google emails configured: ${ALLOWED_GOOGLE_EMAILS.length}`);
});


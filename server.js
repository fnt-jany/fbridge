require('dotenv').config();

const express = require('express');
const fs = require('fs/promises');
const path = require('path');
const cookieParser = require('cookie-parser');
const crypto = require('crypto');

const app = express();
const PORT = 3006;
const ROOT_DIR = path.resolve(process.env.EDITOR_ROOT || 'C:/Project');
const START_PATH = String(process.env.START_PATH || '').trim();
const APP_PASSWORD = process.env.APP_PASSWORD || '3437';
const SESSION_COOKIE = 'auth_token';
const sessions = new Set();
const failedByIp = new Map();
const blockedIps = new Set();

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

app.use(express.json({ limit: '10mb' }));
app.use(cookieParser());
app.use((req, res, next) => {
  if (req.path === '/' || req.path.endsWith('.js') || req.path.endsWith('.css') || req.path.endsWith('.html')) {
    res.set('Cache-Control', 'no-store');
  }
  next();
});

function getClientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.length > 0) {
    return forwarded.split(',')[0].trim();
  }
  return req.socket.remoteAddress || 'unknown';
}

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

async function listDirectory(absPath) {
  const entries = await fs.readdir(absPath, { withFileTypes: true });
  return entries
    .filter((entry) => !entry.name.startsWith('.'))
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

app.post('/login', (req, res) => {
  const ip = getClientIp(req);
  const { password } = req.body || {};

  if (blockedIps.has(ip)) {
    return res.status(403).json({ error: '3회 실패로 접근이 차단되었습니다.' });
  }

  if (String(password || '') === APP_PASSWORD) {
    failedByIp.delete(ip);
    const token = crypto.randomUUID();
    sessions.add(token);
    res.cookie(SESSION_COOKIE, token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: false,
      maxAge: 1000 * 60 * 60 * 8,
    });
    return res.json({ ok: true });
  }

  const count = (failedByIp.get(ip) || 0) + 1;
  failedByIp.set(ip, count);
  if (count >= 3) {
    blockedIps.add(ip);
    return res.status(403).json({ error: '3회 실패로 접근이 차단되었습니다.' });
  }

  return res.status(401).json({ error: `비밀번호 오류 (${count}/3)` });
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

    const extension = path.extname(absPath).toLowerCase();
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

    const extension = path.extname(absPath).toLowerCase();
    if (!EDITABLE_EXTENSIONS.has(extension)) {
      return res.status(400).json({ error: '이 파일 형식은 편집할 수 없습니다.' });
    }

    const content = await fs.readFile(absPath, 'utf8');
    res.json({ path: relPath, content });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/file', authRequired, async (req, res) => {
  try {
    const { path: relPath, content } = req.body || {};
    if (!relPath) {
      return res.status(400).json({ error: 'Path is required' });
    }

    const absPath = resolveSafePath(relPath);
    const extension = path.extname(absPath).toLowerCase();
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
});




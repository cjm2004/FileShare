const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const cors = require('cors');
const archiver = require('archiver');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const Iconv = require('iconv-lite');

const app = express();
const PORT = 6606;

// ── Paths ──
const DATA_DIR = path.join(__dirname, 'data');
const UPLOADS_DIR = path.join(__dirname, 'uploads');
const PUBLIC_DIR = path.join(__dirname, 'public');
const SHARED_DIR = path.join(__dirname, 'shared');
const LOG_DIR = path.join(__dirname, 'logs');

const DB_PATH = path.join(DATA_DIR, 'fileshare.db');

// ── Persistent JWT secret ──
const JWT_SECRET_FILE = path.join(DATA_DIR, 'jwt.secret');
let JWT_SECRET;
if (fs.existsSync(JWT_SECRET_FILE)) {
  JWT_SECRET = fs.readFileSync(JWT_SECRET_FILE, 'utf8').trim();
} else {
  JWT_SECRET = crypto.randomBytes(32).toString('hex');
  try { fs.mkdirSync(path.dirname(JWT_SECRET_FILE), { recursive: true }); } catch {}
  fs.writeFileSync(JWT_SECRET_FILE, JWT_SECRET);
}


// ── Logger (sync writes, no buffer) ──
const LOG_FILE = path.join(LOG_DIR, 'app.log');
try { if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true }); } catch(e) {}
// Simple rotation: keep 2 files
try {
  const f1 = LOG_FILE + '.1';
  const f2 = LOG_FILE + '.2';
  if (fs.existsSync(f1)) { try { fs.renameSync(f1, f2); } catch {} }
  if (fs.existsSync(LOG_FILE)) { try { fs.renameSync(LOG_FILE, f1); } catch {} }
} catch(e) {}

function log(level, msg, data) {
  const time = new Date().toISOString().replace('T', ' ').slice(0, 19);
  const line = '[' + time + '] [' + level + '] ' + msg + (data ? ' | ' + JSON.stringify(data) : '');
  process.stdout.write(line + '\n');
  try { fs.appendFileSync(LOG_FILE, line + '\n'); } catch(e) {}
}

const logger = { info: (m,d) => log('INFO',m,d), warn: (m,d) => log('WARN',m,d), error: (m,d) => log('ERROR',m,d), debug: (m,d) => log('DEBUG',m,d) };// ── Global error handlers ──
process.on('uncaughtException', (err) => {
  logger.error('UNCAUGHT EXCEPTION', { message: err.message, stack: (err.stack || '').split('\n').slice(0,5).join('|') });
});
process.on('unhandledRejection', (reason) => {
  logger.error('UNHANDLED REJECTION', { message: reason?.message || String(reason) });
});

// ── SQLite ──
const Database = require('better-sqlite3');
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Init tables
db.exec(`
  CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT);
  CREATE TABLE IF NOT EXISTS shares (
    id TEXT PRIMARY KEY,
    code TEXT UNIQUE NOT NULL,
    files TEXT NOT NULL DEFAULT '[]',
    extractCode TEXT DEFAULT '',
    expiryDate TEXT DEFAULT '',
    maxVisits INTEGER DEFAULT 0,
    visitCount INTEGER DEFAULT 0,
    topHint TEXT DEFAULT '',
    bottomHint TEXT DEFAULT '',
    createdAt TEXT NOT NULL,
    createdBy TEXT DEFAULT ''
  );
  CREATE TABLE IF NOT EXISTS users (
    username TEXT PRIMARY KEY,
    passwordHash TEXT NOT NULL
  );
`);

// ── DB Helper ──
function getSetting(key, def) {
  const row = db.prepare('SELECT value FROM settings WHERE key=?').get(key);
  return row ? row.value : (def !== undefined ? def : null);
}
function setSetting(key, value) {
  db.prepare('INSERT OR REPLACE INTO settings (key,value) VALUES (?,?)').run(key, value);
}

function getShares() {
  const rows = db.prepare('SELECT * FROM shares ORDER BY rowid DESC').all();
  return rows.map(r => ({ ...r, files: JSON.parse(r.files || '[]') }));
}
function getShare(code) {
  const r = db.prepare('SELECT * FROM shares WHERE code=?').get(code);
  if (!r) return null;
  return { ...r, files: JSON.parse(r.files || '[]') };
}
function addShare(data) {
  db.prepare(`INSERT INTO shares (id,code,files,extractCode,expiryDate,maxVisits,visitCount,topHint,bottomHint,createdAt,createdBy)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)`).run(
    data.id, data.code, JSON.stringify(data.files),
    data.extractCode || '', data.expiryDate || '',
    data.maxVisits || 0, data.visitCount || 0,
    data.topHint || '', data.bottomHint || '',
    data.createdAt, data.createdBy || ''
  );
}
function deleteShare(id) {
  db.prepare('DELETE FROM shares WHERE id=?').run(id);
}
function updateShare(id, fields) {
  const sets = Object.keys(fields).map(k => `${k}=?`).join(',');
  const vals = Object.values(fields);
  db.prepare(`UPDATE shares SET ${sets} WHERE id=?`).run(...vals, id);
}
function incVisit(code) {
  db.prepare('UPDATE shares SET visitCount=visitCount+1 WHERE code=?').run(code);
}

function getUsers() {
  return db.prepare('SELECT * FROM users').all();
}
function getUser(username) {
  return db.prepare('SELECT * FROM users WHERE username=?').get(username);
}
function addUser(username, hash) {
  db.prepare('INSERT OR REPLACE INTO users (username,passwordHash) VALUES (?,?)').run(username, hash);
}
function updateUser(oldName, newName, hash) {
  if (hash) db.prepare('UPDATE users SET username=?, passwordHash=? WHERE username=?').run(newName, hash, oldName);
  else db.prepare('UPDATE users SET username=? WHERE username=?').run(newName, oldName);
}

// ── Middleware ──
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(PUBLIC_DIR));
app.use('/api/admin/upload', express.static(UPLOADS_DIR));

// ── Request Logger (logs every HTTP request) ──
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const ms = Date.now() - start;
    const level = res.statusCode >= 500 ? 'ERROR' : res.statusCode >= 400 ? 'WARN' : 'INFO';
    logger[level.toLowerCase()](`${req.method} ${req.originalUrl}`, { status: res.statusCode, ms, ip: req.ip, ua: (req.headers['user-agent']||'').slice(0,60) });
    if (ms > 3000) logger.warn('SLOW REQUEST', { url: req.originalUrl, ms, method: req.method });
  });
  next();
});

function sanitizePath(p) {
  const n = path.normalize(p).replace(/\\/g, '/');
  return n.includes('..') ? null : n;
}
function formatSize(bytes) {
  if (!bytes) return '0 B';
  const u = ['B','KB','MB','GB','TB'];
  let i = 0, s = bytes;
  while (s >= 1024 && i < u.length-1) { s /= 1024; i++; }
  return s.toFixed(i>0?1:0) + ' ' + u[i];
}
const OFFICE_EXTS = ['.doc','.docx','.ppt','.pptx','.xls','.xlsx','.pdf','.wps','.wpt','.et','.ett','.dps','.dpt'];
const VIDEO_EXTS = ['.mp4','.webm','.ogg','.mov','.avi','.mkv','.flv','.wmv'];
const AUDIO_EXTS = ['.mp3','.wav','.ogg','.aac','.flac','.m4a','.wma'];
const IMAGE_EXTS = ['.jpg','.jpeg','.png','.gif','.bmp','.webp','.svg','.ico'];
const TEXT_EXTS = ['.txt','.md','.log','.json','.xml','.yaml','.yml','.csv','.ini','.cfg','.conf','.env','.bat','.sh','.bash','.zsh','.ps1','.cmd','.css','.less','.scss','.sass','.styl','.js','.jsx','.ts','.tsx','.mjs','.cjs','.vue','.svelte','.astro','.py','.rb','.go','.java','.c','.cc','.cpp','.cxx','.h','.hpp','.cs','.rs','.kt','.scala','.swift','.pl','.pm','.lua','.r','.m','.php','.sql','.dart','.ex','.exs','.html','.htm','.svg','.toml','.makefile','.dockerfile','.gitignore','.editorconfig'];
function getFileType(ext) {
  ext = ext.toLowerCase();
  if (IMAGE_EXTS.includes(ext)) return 'image';
  if (VIDEO_EXTS.includes(ext)) return 'video';
  if (AUDIO_EXTS.includes(ext)) return 'audio';
  if (OFFICE_EXTS.includes(ext)) return 'office';
  if (TEXT_EXTS.includes(ext)) return 'text';
  return 'other';
}
function genCode() {
  return crypto.randomBytes(6).toString('base64url').slice(0, 8);
}

// ── URL helper ──
function getBaseUrl() {
  const d = getSetting('domain', 'localhost:6606');
  const proto = d.includes(':') ? 'http://' : 'https://';
  return proto + d;
}

// ── Auth ──
function auth(req, res, next) {
  const a = req.headers.authorization;
  if (!a || !a.startsWith('Bearer ')) return res.status(401).json({ error: '未授权' });
  try { req.user = jwt.verify(a.slice(7), JWT_SECRET); next(); }
  catch { res.status(401).json({ error: '令牌无效' }); }
}

// ── Init ──
(async () => {
  const users = getUsers();
  if (users.length === 0) {
    addUser('admin', await bcrypt.hash('admin123', 10));
    console.log('[Init] 管理员已创建');
  }
  if (!fs.existsSync(SHARED_DIR)) fs.mkdirSync(SHARED_DIR, { recursive: true });
  if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  console.log('[Init] SQLite 数据库就绪');
})();

// ── scanDir ──
function scanDir(dirPath) {
  // Resolve symlinks safely - skip if target is inaccessible
  let realPath;
  try {
    const stat = fs.lstatSync(dirPath);
    if (stat.isSymbolicLink()) {
      const target = fs.readlinkSync(dirPath);
      const resolved = path.resolve(path.dirname(dirPath), target);
      try { fs.accessSync(resolved, fs.constants.R_OK); realPath = resolved; }
      catch { return []; } // symlink target inaccessible, skip
    } else {
      realPath = dirPath;
    }
  } catch { return null; }

  try { fs.accessSync(realPath, fs.constants.R_OK); } catch { return null; }

  try {
    return fs.readdirSync(realPath, { withFileTypes: true }).map(item => {
      try {
        if (item.name.startsWith('.')) return null; // skip hidden
        const lst = fs.lstatSync(path.join(realPath, item.name));
        if (lst.isSymbolicLink()) return null; // skip symlinks (avoid loops)
        const st = lst;
        return { name: item.name, isDir: st.isDirectory(), size: st.isDirectory() ? 0 : st.size, sizeFormatted: st.isDirectory() ? '-' : formatSize(st.size), modified: st.mtime, modifiedFormatted: st.mtime.toLocaleString('zh-CN'), fullPath: path.join(realPath, item.name) };
      } catch { return null; }
    }).filter(Boolean);
  } catch (e) {
    if (e.code === 'EACCES') return null;
    throw e;
  }
}

// ═══════════════ PUBLIC ═══════════════
app.get('/s/:shareCode', (req, res) => {
  const code = sanitizePath(req.params.shareCode);
  if (!code) return res.status(400).send('Invalid');
  const share = getShare(code);
  if (!share) {
    const html = fs.readFileSync(path.join(PUBLIC_DIR, 'share.html'), 'utf8')
      .replace('<!--SHARE_DATA-->', JSON.stringify({ error: 'deleted', errorMsg: '该分享已被删除', errorIcon: '🗑️' }))
      .replace('<!--SETTINGS_DATA-->', JSON.stringify({ siteName: getSetting('siteName','文件分享'), backgroundImage: getSetting('backgroundImage',''), announcement: '', footer: getSetting('footer',''), previewMode: getSetting('preview_mode','system'), captchaEnabled: getSetting('captcha_enabled','true'), captchaOnExtract: 'true', captchaOnDownload: 'true' }));
    return res.status(404).send(html);
  }

  // Check expiry
  if (share.expiryDate) {
    let expiryStr = share.expiryDate;
    if (!expiryStr.includes('T')) expiryStr += 'T23:59:59';
    const e = new Date(expiryStr);
    if (new Date() > e) {
      const html = fs.readFileSync(path.join(PUBLIC_DIR, 'share.html'), 'utf8')
        .replace('<!--SHARE_DATA-->', JSON.stringify({ error: 'expired', errorMsg: '该分享已过期', errorIcon: '⏰' }))
        .replace('<!--SETTINGS_DATA-->', JSON.stringify({ siteName: getSetting('siteName','文件分享'), backgroundImage: getSetting('backgroundImage',''), announcement: '', footer: getSetting('footer',''), previewMode: getSetting('preview_mode','system'), captchaEnabled: getSetting('captcha_enabled','true'), captchaOnExtract: 'true', captchaOnDownload: 'true' }));
      return res.status(410).send(html);
    }
  }

  // Check if shared files still exist on disk
  let filesDeleted = false;
  for (const f of share.files) {
    if (!fs.existsSync(f.path)) { filesDeleted = true; break; }
  }
  if (filesDeleted) {
    const html = fs.readFileSync(path.join(PUBLIC_DIR, 'share.html'), 'utf8')
      .replace('<!--SHARE_DATA-->', JSON.stringify({ error: 'deleted', errorMsg: '该分享的文件已被删除', errorIcon: '🗑️' }))
      .replace('<!--SETTINGS_DATA-->', JSON.stringify({ siteName: getSetting('siteName','文件分享'), backgroundImage: getSetting('backgroundImage',''), announcement: '', footer: getSetting('footer',''), previewMode: getSetting('preview_mode','system'), captchaEnabled: 'true', captchaOnExtract: 'true', captchaOnDownload: 'true' }));
    return res.status(410).send(html);
  }

  const s = { siteName: getSetting('siteName','文件分享'), backgroundImage: getSetting('backgroundImage',''), announcement: getSetting('announcement',''), footer: getSetting('footer',''), domain: getSetting('domain',''), previewExtensions: getSetting('preview_extensions',''), kkfileviewUrl: getSetting('kkfileview_url',''), previewMode: getSetting('preview_mode','system'), captchaEnabled: getSetting('captcha_enabled','true'), captchaOnExtract: getSetting('captcha_on_extract','true'), captchaOnDownload: getSetting('captcha_on_download','true') };
  const html = fs.readFileSync(path.join(PUBLIC_DIR, 'share.html'), 'utf8')
    .replace('<!--SHARE_DATA-->', JSON.stringify({ code: share.code, files: share.files, hasExtractCode: !!share.extractCode, topHint: share.topHint || '', bottomHint: share.bottomHint || '', created: share.createdAt }))
    .replace('<!--SETTINGS_DATA-->', JSON.stringify(s));
  res.send(html);
});

app.post('/api/share/:shareCode/verify', (req, res) => {
  const code = req.params.shareCode;
  const share = getShare(code);
  if (!share) return res.status(404).json({ error: '分享不存在' });
  if (share.expiryDate) {
    let expiryStr = share.expiryDate;
    if (!expiryStr.includes('T')) expiryStr += 'T23:59:59';
    const e = new Date(expiryStr);
    if (new Date() > e) return res.status(410).json({ error: '分享已过期', expired: true });
  }
  if (share.maxVisits && share.visitCount >= share.maxVisits) return res.status(410).json({ error: '已达上限', exhausted: true });
  if (share.extractCode) { const { code: c } = req.body; if (!c || c !== share.extractCode) return res.status(403).json({ error: '提取码错误' }); }
  incVisit(code);
  const base = getBaseUrl();
  res.json({ success: true, files: share.files.map(f => ({ ...f, previewUrl: base+'/api/share/'+code+'/preview/'+encodeURIComponent(f.name), downloadUrl: base+'/api/share/'+code+'/download/'+encodeURIComponent(f.name) })) });
});

app.get('/api/share/:shareCode/info', (req, res) => {
  const share = getShare(req.params.shareCode);
  if (!share) return res.status(404).json({ error: '不存在' });
  res.json({ code: share.code, files: share.files, hasExtractCode: !!share.extractCode, visitCount: share.visitCount, maxVisits: share.maxVisits, expiryDate: share.expiryDate });
});

// ── Admin extract share (bypass extract code) ──
app.get('/api/admin/share/extract/:shareCode', auth, (req, res) => {
  const share = getShare(req.params.shareCode);
  if (!share) return res.status(404).json({ error: '分享不存在' });
  if (share.expiryDate) {
    let expiryStr = share.expiryDate;
    if (!expiryStr.includes('T')) expiryStr += 'T23:59:59';
    if (new Date() > new Date(expiryStr)) return res.status(410).json({ error: '分享已过期', expired: true });
  }
  if (share.maxVisits && share.visitCount >= share.maxVisits) return res.status(410).json({ error: '已达上限', exhausted: true });
  incVisit(share.code);
  const base = getBaseUrl();
  res.json({
    success: true,
    share: { ...share, link: base+'/s/'+share.code },
    files: share.files.map(f => ({
      ...f,
      previewUrl: base+'/api/share/'+share.code+'/preview/'+encodeURIComponent(f.name),
      downloadUrl: base+'/api/share/'+share.code+'/download/'+encodeURIComponent(f.name)
    }))
  });
});

app.get('/api/share/:shareCode/download/*', (req, res) => {
  const share = getShare(req.params.shareCode);
  if (!share) return res.status(404).json({ error: '不存在' });
  const fileName = req.params[0];
  const f = share.files.find(x => x.name === fileName);
  if (!f || !fs.existsSync(f.path)) return res.status(404).json({ error: '文件不存在' });
  res.download(f.path, fileName);
});

app.get('/api/share/:shareCode/preview/*', (req, res) => {
  const share = getShare(req.params.shareCode);
  if (!share) return res.status(404).json({ error: '不存在' });
  const fileName = req.params[0];
  const f = share.files.find(x => x.name === fileName);
  if (!f || !fs.existsSync(f.path)) return res.status(404).json({ error: '文件不存在' });
  res.sendFile(f.path);
});

// ── Batch download (ZIP) ──
app.post('/api/share/:shareCode/download-batch', (req, res) => {
  const share = getShare(req.params.shareCode);
  if (!share) return res.status(404).json({ error: '不存在' });
  const { files } = req.body;
  if (!files || !files.length) return res.status(400).json({ error: '请选择文件' });

  const matched = [];
  for (const name of files) {
    const f = share.files.find(x => x.name === name);
    if (f && fs.existsSync(f.path)) matched.push(f);
  }
  if (!matched.length) return res.status(404).json({ error: '文件不存在' });

  // Calculate total raw size for progress estimation on client
  const totalRawSize = matched.reduce((sum, f) => sum + (f.size || 0), 0);
  res.setHeader('X-Total-Raw-Size', totalRawSize.toString());

  const zipName = encodeURIComponent('下载_' + share.code + '.zip');
  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', 'attachment; filename*=UTF-8\'\'' + zipName);

  const archive = archiver('zip', { zlib: { level: 5 } });
  archive.on('error', (err) => {
    logger.error('Archive error', { error: err.message });
    if (!res.headersSent) res.status(500).json({ error: '打包失败' });
  });
  archive.pipe(res);

  for (const f of matched) {
    // Preserve folder structure in ZIP — f.name contains relative path
    archive.file(f.path, { name: f.name });
  }
  archive.finalize();
});

// ── Text file content (for inline preview) ──
app.get('/api/share/:shareCode/text', (req, res) => {
  const share = getShare(req.params.shareCode);
  if (!share) return res.status(404).json({ error: '不存在' });
  const fileName = req.query.file;
  if (!fileName) return res.status(400).json({ error: '缺少文件参数' });
  const f = share.files.find(x => x.name === fileName);
  if (!f || !fs.existsSync(f.path)) return res.status(404).json({ error: '文件不存在' });
  const ext = path.extname(f.name).toLowerCase();
  if (!TEXT_EXTS.includes(ext)) return res.status(400).json({ error: '不支持预览' });
  const buf = fs.readFileSync(f.path);
  // Detect encoding: try UTF-8 first, fallback to GBK
  let content;
  const utf8 = Iconv.decode(buf, 'utf-8');
  // Check if utf-8 decode looks clean (no replacement chars for common CJK range)
  if (Iconv.encode(utf8, 'utf-8').equals(buf)) {
    content = utf8;
  } else {
    // Fallback: try GBK (common Chinese encoding)
    content = Iconv.decode(buf, 'gbk');
  }
  res.json({ content, name: f.name });
});

app.get('/404.html', (req, res) => res.sendFile(path.join(PUBLIC_DIR, '404.html')));

// ═══════════════ CAPTCHA (EasyCaptcha-style) ═══════════════
const svgCaptcha = require('svg-captcha');
const captchaStore = new Map();
const CAPTCHA_TTL = 5 * 60 * 1000; // 5 minutes

// Periodic cleanup
setInterval(() => {
  const now = Date.now();
  for (const [key, val] of captchaStore) {
    if (now > val.expires) captchaStore.delete(key);
  }
}, 60 * 1000);

const CAPTCHA_TYPES = {
  arithmetic: 'arithmetic',
  char: 'char'
};

function getCaptchaSetting(key, def) {
  const v = getSetting('captcha_' + key);
  return v !== null ? v : def;
}

app.get('/api/captcha/generate', (req, res) => {
  try {
    const type = getCaptchaSetting('type', CAPTCHA_TYPES.arithmetic);
    const width = parseInt(getCaptchaSetting('width', '150'));
    const height = parseInt(getCaptchaSetting('height', '50'));
    const length = parseInt(getCaptchaSetting('length', '2'));

    let data, text;

    if (type === CAPTCHA_TYPES.arithmetic) {
      const mathCaptcha = svgCaptcha.createMathExpr({
        mathMin: 1,
        mathMax: 20,
        mathOperator: '+'
      });
      data = mathCaptcha.data;
      text = mathCaptcha.text;
    } else {
      const charCaptcha = svgCaptcha.create({
        size: Math.max(4, Math.min(8, length)),
        width,
        height,
        ignoreChars: '0o1il',
        noise: 2,
        color: true,
        background: '#f0f4ff'
      });
      data = charCaptcha.data;
      text = charCaptcha.text;
    }

    const key = crypto.randomBytes(16).toString('hex');
    captchaStore.set(key, { text: text.toLowerCase(), expires: Date.now() + CAPTCHA_TTL });

    res.json({ key, svg: data, type });
  } catch (e) {
    logger.error('Captcha generate error', { error: e.message });
    res.status(500).json({ error: '验证码生成失败' });
  }
});

app.post('/api/captcha/verify', (req, res) => {
  const { key, answer } = req.body;
  if (!key || !answer) return res.json({ success: false, error: '请填写验证码' });

  const record = captchaStore.get(key);
  if (!record) return res.json({ success: false, error: '验证码已过期' });

  // One-time use
  captchaStore.delete(key);

  if (record.text === answer.trim().toLowerCase()) {
    // Generate a short-lived verification token
    const verifyToken = crypto.randomBytes(8).toString('hex');
    captchaStore.set('vt_' + verifyToken, { expires: Date.now() + 30000 });
    res.json({ success: true, verifyToken });
  } else {
    res.json({ success: false, error: '验证码错误' });
  }
});

app.get('/api/captcha/verify-check', (req, res) => {
  const token = req.query.token;
  if (!token) return res.json({ verified: false });
  const record = captchaStore.get('vt_' + token);
  if (record && Date.now() < record.expires) {
    captchaStore.delete('vt_' + token);
    return res.json({ verified: true });
  }
  res.json({ verified: false });
});

// ── Admin captcha settings ──
app.get('/api/admin/captcha-settings', auth, (req, res) => {
  const settings = {
    type: getCaptchaSetting('type', CAPTCHA_TYPES.arithmetic),
    width: getCaptchaSetting('width', '150'),
    height: getCaptchaSetting('height', '50'),
    length: getCaptchaSetting('length', '2'),
    enabled: getCaptchaSetting('enabled', 'true'),
    onExtract: getCaptchaSetting('on_extract', 'true'),
    onDownload: getCaptchaSetting('on_download', 'true')
  };
  res.json(settings);
});

app.put('/api/admin/captcha-settings', auth, (req, res) => {
  const { type, width, height, length, enabled, onExtract, onDownload } = req.body;
  if (type && ![CAPTCHA_TYPES.arithmetic, CAPTCHA_TYPES.char].includes(type)) {
    return res.status(400).json({ error: '无效的验证码类型' });
  }
  if (type) setSetting('captcha_type', type);
  if (width) setSetting('captcha_width', String(width));
  if (height) setSetting('captcha_height', String(height));
  if (length) setSetting('captcha_length', String(length));
  if (enabled !== undefined) setSetting('captcha_enabled', enabled ? 'true' : 'false');
  if (onExtract !== undefined) setSetting('captcha_on_extract', onExtract ? 'true' : 'false');
  if (onDownload !== undefined) setSetting('captcha_on_download', onDownload ? 'true' : 'false');

  res.json({ success: true });
});

// ═══════════════ ADMIN ═══════════════
app.post('/api/admin/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: '请填写完整' });
  const user = getUser(username);
  if (!user) return res.status(401).json({ error: '用户名或密码错误' });
  if (!await bcrypt.compare(password, user.passwordHash)) return res.status(401).json({ error: '用户名或密码错误' });

  // Check if still using default password
  const isDefault = await bcrypt.compare('admin123', user.passwordHash);
  const token = jwt.sign({ username }, JWT_SECRET, { expiresIn: '24h' });
  res.json({ token, username, forceChange: isDefault });
});

app.get('/api/admin/verify', auth, async (req, res) => {
  const user = getUser(req.user.username);
  if (!user) return res.json({ valid: false });
  const isDefault = await bcrypt.compare('admin123', user.passwordHash);
  res.json({ valid: true, username: req.user.username, forceChange: isDefault });
});

app.get('/api/admin/settings', auth, (req, res) => {
  const rows = db.prepare('SELECT key,value FROM settings').all();
  const s = {};
  rows.forEach(r => s[r.key] = r.value);
  s.siteName = s.siteName || '文件分享';
  res.json(s);
});

app.put('/api/admin/settings', auth, (req, res) => {
  const { siteName, announcement, footer, scanRootPath, backgroundImage, domain, preview_extensions, kkfileview_url, preview_mode } = req.body;
  const pairs = { siteName, announcement, footer, scanRootPath, backgroundImage, domain, preview_extensions, kkfileview_url, preview_mode };
  Object.entries(pairs).forEach(([k,v]) => {
    if (v !== undefined) {
      if (k === 'domain') v = v.replace(/^https?:\/\//,'').replace(/\/+$/,'');
      if (k === 'scanRootPath' && v) {
        if (!fs.existsSync(v)) return res.status(400).json({ error: '路径不存在' });
        try { fs.accessSync(v, fs.constants.R_OK); } catch { return res.status(403).json({ error: '无权限' }); }
      }
      setSetting(k, v);
    }
  });
  const rows = db.prepare('SELECT key,value FROM settings').all();
  const s = {}; rows.forEach(r => s[r.key] = r.value);
  res.json({ success: true, settings: s });
});

app.put('/api/admin/password', auth, async (req, res) => {
  const { oldPassword, newPassword } = req.body;
  if (!oldPassword || !newPassword || newPassword.length < 6) return res.status(400).json({ error: '密码至少6位' });
  const user = getUser(req.user.username);
  if (!user || !await bcrypt.compare(oldPassword, user.passwordHash)) return res.status(401).json({ error: '旧密码错误' });
  addUser(req.user.username, await bcrypt.hash(newPassword, 10));
  res.json({ success: true });
});

app.put('/api/admin/username', auth, async (req, res) => {
  const { newUsername, password } = req.body;
  if (!newUsername || !password) return res.status(400).json({ error: '请填写完整' });
  const user = getUser(req.user.username);
  if (!user || !await bcrypt.compare(password, user.passwordHash)) return res.status(401).json({ error: '密码错误' });
  if (getUser(newUsername) && newUsername !== req.user.username) return res.status(409).json({ error: '用户名已存在' });
  updateUser(req.user.username, newUsername, null);
  const token = jwt.sign({ username: newUsername }, JWT_SECRET, { expiresIn: '24h' });
  res.json({ success: true, username: newUsername, token });
});

// ── Upload BG ──
const bgStore = multer.diskStorage({ destination: (r,f,cb) => cb(null, UPLOADS_DIR), filename: (r,f,cb) => cb(null, 'bg_'+Date.now()+path.extname(f.originalname)) });
const uploadBg = multer({ storage: bgStore, limits: { fileSize: 10*1024*1024 }, fileFilter: (r,f,cb) => { const a=['.jpg','.jpeg','.png','.gif','.webp']; cb(null, a.includes(path.extname(f.originalname).toLowerCase())); } });
app.post('/api/admin/upload/bg', auth, (req, res) => {
  uploadBg.single('bg')(req, res, (err) => {
    if (err || !req.file) return res.status(400).json({ error: err ? err.message : '请选择文件' });
    setSetting('backgroundImage', '/api/admin/upload/'+req.file.filename);
    res.json({ success: true, url: '/api/admin/upload/'+req.file.filename });
  });
});

// ── File Browser ──
app.get('/api/admin/files', auth, (req, res) => {
  let rootPath = getSetting('scanRootPath', SHARED_DIR);
  const queryPath = req.query.path || '';
  const targetPath = path.join(rootPath, queryPath);
  const rel = path.relative(rootPath, targetPath);
  if (rel.startsWith('..') || path.isAbsolute(rel)) return res.status(403).json({ error: '不允许上级目录' });
  if (!fs.existsSync(targetPath)) return res.status(404).json({ error: '路径不存在' });

  const items = scanDir(targetPath);
  if (items === null) {
    const acc = [];
    if (fs.existsSync('/home/trim.openclaw')) acc.push('/home/trim.openclaw');
    if (fs.existsSync(SHARED_DIR)) acc.push(SHARED_DIR);
    return res.status(403).json({ error: '无权限读取', tip: '可用路径：\n'+acc.join('\n'), accessible: acc, sharedDir: SHARED_DIR });
  }
  items.sort((a,b) => (a.isDir!==b.isDir) ? (a.isDir?-1:1) : a.name.localeCompare(b.name));
  const files = items.map(({fullPath,...r}) => ({...r, path: path.relative(rootPath, fullPath)}));
  res.json({ currentPath: path.relative(rootPath, targetPath) || '/', rootPath, files });
});

// ── Setup shared dir ──
app.post('/api/admin/setup/share-dir', auth, (req, res) => {
  const { sourcePath: src } = req.body;
  if (!src) return res.status(400).json({ error: '请提供路径' });
  if (!fs.existsSync(src)) return res.status(400).json({ error: '路径不存在' });
  try {
    fs.accessSync(src, fs.constants.R_OK);
    const linkPath = path.join(SHARED_DIR, path.basename(src));
    if (!fs.existsSync(linkPath)) try { fs.symlinkSync(src, linkPath); } catch {}
    return res.json({ success: true, path: src, note: '路径可访问' });
  } catch (e) {
    if (e.code === 'ENOENT') return res.status(400).json({ error: '路径不存在' });
    return res.json({
      error: '无权限访问',
      command: 'sudo setfacl -m u:trim.openclaw:rx "' + src + '"',
      note: '在SSH执行上方命令后刷新，或将文件复制到 ' + SHARED_DIR
    });
  }
});

// ── Recursively collect files from directory ──
const MAX_SCAN_FILES = 5000; // Safety limit
function collectFilesRecursive(dirPath, rootPath, depth = 0) {
  if (depth > 10) return []; // Max depth guard
  const results = [];
  try {
    const items = fs.readdirSync(dirPath, { withFileTypes: true });
    for (const item of items) {
      if (results.length >= MAX_SCAN_FILES) {
        logger.warn('Max scan files reached', { dir: dirPath, max: MAX_SCAN_FILES });
        break;
      }
      const fullPath = path.join(dirPath, item.name);
      try {
        // Use lstat to detect symlinks (avoid loops)
        const lst = fs.lstatSync(fullPath);
        const isSymlink = lst.isSymbolicLink();
        // Skip symlinks entirely to prevent loops
        if (isSymlink) continue;
        // Skip hidden files/dirs
        if (item.name.startsWith('.')) continue;

        if (lst.isDirectory()) {
          const collected = collectFilesRecursive(fullPath, rootPath, depth + 1);
          results.push(...collected);
        } else {
          const st = lst;
          const relPath = path.relative(rootPath, fullPath);
          results.push({
            name: relPath,
            path: fullPath,
            size: st.size,
            sizeFormatted: formatSize(st.size),
            type: getFileType(path.extname(item.name))
          });
        }
      } catch (e) {
        logger.warn('Skipping file/dir', { path: fullPath, error: e.message });
      }
    }
  } catch (e) {
    logger.warn('Failed to scan directory', { dir: dirPath, error: e.message });
  }
  return results;
}

// ── Share create ──
app.post('/api/admin/share/create', auth, (req, res) => {
  try {
    const { filePaths, extractCode, expiryDate, maxVisits, topHint, bottomHint, appendCode } = req.body;
    if (!filePaths || filePaths.length === 0) return res.status(400).json({ error: '请选择文件' });
    const rootPath = getSetting('scanRootPath', SHARED_DIR);
    const files = [];
    for (const fp of filePaths) {
      const fp2 = path.join(rootPath, fp);
      if (path.relative(rootPath, fp2).startsWith('..')) continue;
      try {
        const st = fs.statSync(fp2);
        if (st.isDirectory()) {
          const dirName = path.basename(fp2);
          const collected = collectFilesRecursive(fp2, fp2);
          // Prefix collected files with folder name to preserve hierarchy on share page
          files.push(...collected.map(f => ({ ...f, name: dirName + '/' + f.name })));
          logger.info('Directory selected for share', { dir: fp2, fileCount: collected.length });
        } else {
          files.push({ name: path.basename(fp2), path: fp2, size: st.size, sizeFormatted: formatSize(st.size), type: getFileType(path.extname(fp2)) });
        }
      } catch { continue; }
    }
    if (files.length === 0) return res.status(400).json({ error: '文件无效' });
    let code;
    do { code = genCode(); } while (getShare(code));
    const share = { id: Date.now().toString(36)+Math.random().toString(36).slice(2,6), code, files, extractCode: extractCode||'', expiryDate: expiryDate||'', maxVisits: parseInt(maxVisits)||0, visitCount: 0, topHint: topHint||'', bottomHint: bottomHint||'', createdAt: new Date().toISOString(), createdBy: req.user.username };
    addShare(share);
    let link = getBaseUrl()+'/s/'+code;
    if (appendCode && extractCode) {
      link += '#' + encodeURIComponent(extractCode);
    }
    res.json({ success: true, share: { ...share, link: link } });
  } catch (e) {
    logger.error('Create share failed', { error: e.message, stack: (e.stack||'').split('\n').slice(0,3).join('|') });
    res.status(500).json({ error: '创建分享失败: ' + e.message });
  }
});

// ── Shares list ──
app.get('/api/admin/shares', auth, (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const pageSize = parseInt(req.query.pageSize) || 10;
  const all = getShares();
  const total = all.length;
  const totalPages = Math.ceil(total / pageSize);
  const start = (page-1) * pageSize;
  const items = all.slice(start, start+pageSize).map(s => ({
    ...s, link: getBaseUrl()+'/s/'+s.code,
    isExpired: s.expiryDate ? (() => { let e = s.expiryDate; if (!e.includes('T')) e += 'T23:59:59'; return new Date() > new Date(e); })() : false,
    isExhausted: s.maxVisits > 0 && s.visitCount >= s.maxVisits
  }));
  res.json({ items, total, page, pageSize, totalPages });
});

app.delete('/api/admin/share/:id', auth, (req, res) => {
  deleteShare(req.params.id);
  res.json({ success: true });
});

app.patch('/api/admin/share/:id', auth, (req, res) => {
  const { extractCode, expiryDate, maxVisits } = req.body;
  const upd = {};
  if (extractCode !== undefined) upd.extractCode = extractCode;
  if (expiryDate !== undefined) upd.expiryDate = expiryDate;
  if (maxVisits !== undefined) upd.maxVisits = parseInt(maxVisits) || 0;
  updateShare(req.params.id, upd);
  res.json({ success: true });
});

app.post('/api/admin/shares/cleanup', auth, (req, res) => {
  const all = getShares();
  const before = all.length;
  let removed = 0;
  all.forEach(s => {
    let expired = false;
    if (s.expiryDate) { const e = new Date(s.expiryDate+'T23:59:59'); if (new Date() > e) expired = true; }
    if (s.maxVisits > 0 && s.visitCount >= s.maxVisits) expired = true;
    if (expired) { deleteShare(s.id); removed++; }
  });
  const remaining = before - removed;
  res.json({ success: true, removed, remaining });
});

app.get('/admin', (req, res) => res.sendFile(path.join(PUBLIC_DIR, 'admin.html')));
app.get('/admin/*', (req, res) => res.sendFile(path.join(PUBLIC_DIR, 'admin.html')));

// ── Health check (for crontab watchdog) ──
app.get('/api/ping', (req, res) => res.json({ ok: true, time: Date.now() }));

// ═══════════════ START ═══════════════
app.listen(PORT, '0.0.0.0', () => {
  logger.info('FileShare started', { port: PORT, db: DB_PATH, pid: process.pid });
  console.log(`┌─────────────────────────────────────────┐`);
  console.log(`│  FileShare System (SQLite)               │`);
  console.log(`│  Port:    ${PORT}                         │`);
  console.log(`│  PID:     ${process.pid}                  │`);
  console.log(`│  Log:     ${LOG_DIR}/app.log              │`);
  console.log(`└─────────────────────────────────────────┘`);
});

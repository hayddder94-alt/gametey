'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');
const sharp = require('sharp');
const config = require('./config');

fs.mkdirSync(config.uploadsDir, { recursive: true });

const MIME_MAGIC = [
  { mime: 'image/jpeg', bytes: [0xff, 0xd8, 0xff] },
  { mime: 'image/png', bytes: [0x89, 0x50, 0x4e, 0x47] },
  { mime: 'image/gif', bytes: [0x47, 0x49, 0x46, 0x38] },
  { mime: 'image/webp', bytes: null }, // يُفحص عبر RIFF/WEBP
];

function sniffMime(buffer) {
  if (!buffer || buffer.length < 12) return null;
  for (const m of MIME_MAGIC) {
    if (m.bytes && m.bytes.every((b, i) => buffer[i] === b)) return m.mime;
  }
  if (buffer.slice(0, 4).toString('ascii') === 'RIFF' && buffer.slice(8, 12).toString('ascii') === 'WEBP') {
    return 'image/webp';
  }
  return null;
}

const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: { fileSize: config.maxUploadBytes, files: 8 },
});

/**
 * يستقبل صورة، يتحقق من نوعها الفعلي (وليس الامتداد)،
 * يحسّن حجمها عبر sharp، ويخزنها باسم عشوائي آمن.
 */
async function saveImage(req, res, next) {
  try {
    const file = req.file;
    if (!file || !file.buffer) return res.status(400).json({ error: 'لم يتم استلام أي ملف.' });

    const declared = (file.mimetype || '').toLowerCase();
    if (!config.allowedMime.has(declared)) {
      return res.status(400).json({ error: 'نوع الملف غير مسموح. الصور المسموحة: JPG, PNG, WEBP, GIF.' });
    }
    const real = sniffMime(file.buffer);
    if (!real || !config.allowedMime.has(real)) {
      return res.status(400).json({ error: 'محتوى الملف ليس صورة صالحة.' });
    }

    const name = crypto.randomBytes(12).toString('hex') + '.webp';
    const dest = path.join(config.uploadsDir, name);
    // منع أي تجاوز للمسار
    if (!dest.startsWith(config.uploadsDir)) return res.status(400).json({ error: 'مسار غير صالح.' });

    try {
      await sharp(file.buffer)
        .rotate()
        .resize({ width: 1400, height: 1400, fit: 'inside', withoutEnlargement: true })
        .webp({ quality: 82 })
        .toFile(dest);
    } catch {
      return res.status(400).json({ error: 'تعذر معالجة الصورة. تأكد أنها صورة سليمة.' });
    }

    req.savedImage = '/uploads/' + name;
    next();
  } catch (err) {
    next(err);
  }
}

function deleteImageFile(relPath) {
  if (!relPath || !relPath.startsWith('/uploads/')) return false;
  const abs = path.join(config.root, 'public', relPath);
  if (!abs.startsWith(config.uploadsDir)) return false;
  try {
    if (fs.existsSync(abs)) fs.unlinkSync(abs);
    return true;
  } catch {
    return false;
  }
}

module.exports = { upload, saveImage, deleteImageFile };

import { Router } from 'express';
import { LocalObjectStore, objectStore, sha256 } from '../../common/object-store';
import type { RouteMount } from '../types';

/**
 * Serves objects for the local driver through an HMAC-signed, short-lived token (minted by the
 * object store when an authorised caller asks for a download link). With the S3 driver downloads go
 * straight to the bucket via a pre-signed URL and this route answers 404.
 */
const router = Router();

router.get('/download', async (req, res, next) => {
  try {
    const store = objectStore();
    const token = typeof req.query.token === 'string' ? req.query.token : '';
    if (!(store instanceof LocalObjectStore)) return void res.status(404).json({ message: 'Not found' });
    const grant = store.verifyToken(token);
    if (!grant) return void res.status(403).json({ message: 'This download link is invalid or has expired' });
    const object = await store.get(grant.key);
    if (!object) return void res.status(404).json({ message: 'Not found' });
    res.setHeader('Content-Type', grant.contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${grant.fileName.replace(/[^A-Za-z0-9._-]/g, '_')}"`);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('X-Content-SHA256', sha256(object.body));
    res.send(object.body);
  } catch (error) {
    next(error);
  }
});

const mounts: RouteMount[] = [{ path: '/files', router }];
export default mounts;

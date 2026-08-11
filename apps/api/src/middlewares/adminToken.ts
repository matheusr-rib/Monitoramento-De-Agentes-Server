import type { Request, Response, NextFunction } from 'express';

export function adminToken(req: Request, res: Response, next: NextFunction) {
  const expected = (process.env.ADMIN_TOKEN || '').trim();

  if (!expected || expected.length < 16) {
    return res.status(500).json({
      error: 'SERVER_MISCONFIGURED',
      message: 'ADMIN_TOKEN ausente ou muito curto (mínimo 16 chars).',
    });
  }

  const headerToken = (req.header('x-admin-token') || '').trim();
  const queryToken =
    typeof req.query.admin_token === 'string' ? req.query.admin_token.trim() : '';

  const got = headerToken || queryToken;

  if (!got || got !== expected) {
    return res.status(401).json({ error: 'UNAUTHORIZED' });
  }

  next();
}
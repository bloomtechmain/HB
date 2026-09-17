import { Request, Response, NextFunction } from 'express';
import { verifyToken } from '../utils/jwt';
import { AuthPayload } from '../types';
import { query } from '../config/database';
import { planIncludes, FeatureKey } from '../data/plans';
import { runInSchema } from '../config/schemaContext';
import { isTokenRevoked } from '../utils/tokenRevocation';

export interface AuthRequest extends Request {
  user?: AuthPayload;
}

// The schema a request should actually run against, given its decoded
// token. A live request always means the real "public" schema (undefined =
// no override, see database.ts); Sandbox mode is the one case that
// redirects everything to the fixed sibling "sandbox" schema instead.
const effectiveSchema = (decoded: AuthPayload): string | undefined => {
  return decoded.sandbox ? 'sandbox' : undefined;
};

export const authenticate = (req: AuthRequest, res: Response, next: NextFunction): void => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({ success: false, message: 'No token provided' });
      return;
    }

    const token = authHeader.split(' ')[1];
    const decoded = verifyToken(token);
    if (isTokenRevoked(decoded.id, decoded.iat)) {
      res.status(401).json({ success: false, message: 'Session expired — please log in again' });
      return;
    }
    req.user = decoded;
    const schema = effectiveSchema(decoded);
    if (schema) {
      // Everything downstream of this call — every remaining middleware and
      // the route handler itself — runs inside this schema's context, so
      // every query()/transaction() call for the rest of the request
      // automatically resolves against it.
      runInSchema(schema, () => next());
    } else {
      // Live mode: no schema override — every query already resolves
      // against the one flat "public" schema.
      next();
    }
  } catch {
    res.status(401).json({ success: false, message: 'Invalid or expired token' });
  }
};

// Like `authenticate`, but never rejects — used by routes that need the
// schema context WHEN a token is present (e.g. GET /settings, called both
// after login with a real token, and once eagerly on every app mount
// including the login screen itself, before any token exists at all).
// Missing or invalid tokens just proceed with no schema override, exactly
// like a request that never had a token to begin with; the handler itself
// decides what to return in that case rather than getting a hard 401.
export const optionalAuthenticate = (req: AuthRequest, res: Response, next: NextFunction): void => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    next();
    return;
  }
  try {
    const decoded = verifyToken(authHeader.split(' ')[1]);
    req.user = decoded;
    const schema = effectiveSchema(decoded);
    if (schema) {
      runInSchema(schema, () => next());
    } else {
      next();
    }
  } catch {
    next();
  }
};

export const requireRole = (...roles: string[]) => {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }
    if (!roles.includes(req.user.role_name)) {
      res.status(403).json({ success: false, message: 'Insufficient permissions' });
      return;
    }
    next();
  };
};

// Business-wide gate (unlike requireRole/requirePermission, which are
// per-user from the JWT) — the subscription plan lives on `settings`, so
// this is the one auth middleware that needs a DB read.
export const requireFeature = (feature: FeatureKey) => {
  return async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await query('SELECT plan_key, custom_features FROM settings WHERE id = 1', []);
      const planKey = result.rows[0]?.plan_key || 'basic';
      const customFeatures = result.rows[0]?.custom_features ?? null;
      if (!planIncludes(planKey, feature, customFeatures)) {
        res.status(403).json({ success: false, message: `This feature isn't included in your current plan. Upgrade in Settings to unlock it.` });
        return;
      }
      next();
    } catch {
      res.status(500).json({ success: false, message: 'Failed to verify plan' });
    }
  };
};

export const requirePermission = (permission: string) => {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }
    const perms = req.user.permissions;
    const keys = permission.split('.');
    let current: unknown = perms;
    for (const key of keys) {
      if (current && typeof current === 'object' && key in (current as Record<string, unknown>)) {
        current = (current as Record<string, unknown>)[key];
      } else {
        current = false;
        break;
      }
    }
    if (!current) {
      res.status(403).json({ success: false, message: 'Permission denied' });
      return;
    }
    next();
  };
};

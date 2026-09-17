import bcrypt from 'bcryptjs';
import { query } from '../config/database';
import { signToken } from '../utils/jwt';
import { createError } from '../middleware/error';
import { AuthPayload } from '../types';
import { ensureSandboxSchema } from './sandbox.service';
import { markPasswordChanged } from '../utils/tokenRevocation';

export const loginUser = async (email: string, password: string) => {
  const result = await query(
    `SELECT u.*, r.name as role_name, r.permissions
     FROM users u
     JOIN roles r ON u.role_id = r.id
     WHERE u.email = $1 AND u.deleted_at IS NULL`,
    [email]
  );

  if (result.rows.length === 0) {
    throw createError('Invalid email or password', 401);
  }

  const user = result.rows[0];

  if (!user.is_active) {
    throw createError('Account is disabled. Contact administrator.', 401);
  }

  const isMatch = await bcrypt.compare(password, user.password);
  if (!isMatch) {
    throw createError('Invalid email or password', 401);
  }

  await query('UPDATE users SET last_login = NOW() WHERE id = $1', [user.id]);

  const token = signToken({
    id: user.id,
    email: user.email,
    role_id: user.role_id,
    role_name: user.role_name,
    permissions: user.permissions,
  });

  return {
    token,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role_name: user.role_name,
      permissions: user.permissions,
    },
  };
};

// Reissues the caller's token with the sandbox flag flipped — same
// identity, just a different `sandbox` claim. Switching to sandbox lazily
// provisions that schema on first use (see ensureSandboxSchema); switching
// back to live is just re-signing, nothing to provision. `user` is always
// req.user from an already-verified token — never derived from anything the
// client sent.
export const switchSandbox = async (user: AuthPayload, sandbox: boolean) => {
  if (sandbox) {
    await ensureSandboxSchema();
  }

  const token = signToken({
    id: user.id,
    email: user.email,
    role_id: user.role_id,
    role_name: user.role_name,
    permissions: user.permissions,
    sandbox,
  });

  return { token, sandbox };
};

// `user` is req.user from an already-verified token (same convention as
// switchSandbox below) — needed so we can re-sign a fresh token with the
// same claims once the old one is revoked, instead of just leaving the
// caller's now-invalid token in place. Without this, the very next request
// 401s and force-logs the user out right after a "successful" change.
export const changePassword = async (user: AuthPayload, currentPassword: string, newPassword: string) => {
  const result = await query('SELECT password FROM users WHERE id = $1', [user.id]);
  if (result.rows.length === 0) throw createError('User not found', 404);

  const isMatch = await bcrypt.compare(currentPassword, result.rows[0].password);
  if (!isMatch) throw createError('Current password is incorrect', 400);

  const hashed = await bcrypt.hash(newPassword, 10);
  await query('UPDATE users SET password = $1, updated_at = NOW() WHERE id = $2', [hashed, user.id]);
  markPasswordChanged(user.id);

  const token = signToken({
    id: user.id,
    email: user.email,
    role_id: user.role_id,
    role_name: user.role_name,
    permissions: user.permissions,
    sandbox: user.sandbox,
  });

  return { token };
};

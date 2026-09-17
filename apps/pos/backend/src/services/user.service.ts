import bcrypt from 'bcryptjs';
import { query } from '../config/database';
import { createError } from '../middleware/error';
import { AuthPayload, User } from '../types';
import { PLANS, DEFAULT_PLAN_KEY } from '../data/plans';
import { markPasswordChanged } from '../utils/tokenRevocation';
import { signToken } from '../utils/jwt';

export const getUsers = async () => {
  const result = await query(
    `SELECT u.id, u.name, u.email, u.role_id, r.name as role_name,
       u.is_active, u.last_login, u.created_at
     FROM users u JOIN roles r ON u.role_id = r.id
     WHERE u.deleted_at IS NULL
     ORDER BY u.name ASC`,
    []
  );
  return result.rows;
};

export const createUser = async (data: {
  name: string;
  email: string;
  password: string;
  role_id: number;
  pin?: string;
}): Promise<User> => {
  if (!data.password || data.password.length < 6) {
    throw createError('Password must be at least 6 characters', 400);
  }

  const existing = await query('SELECT id FROM users WHERE email = $1', [data.email]);
  if (existing.rows.length > 0) throw createError('Email already exists', 400);

  const settingsResult = await query('SELECT plan_key FROM settings WHERE id = 1', []);
  const planKey = settingsResult.rows[0]?.plan_key || DEFAULT_PLAN_KEY;
  const maxUsers = PLANS[planKey]?.max_users;
  if (maxUsers !== null && maxUsers !== undefined) {
    const countResult = await query(
      `SELECT COUNT(*) FROM users WHERE deleted_at IS NULL AND is_active = TRUE`,
      []
    );
    if (parseInt(countResult.rows[0].count) >= maxUsers) {
      throw createError(
        `Your ${PLANS[planKey].name} plan allows up to ${maxUsers} staff account${maxUsers === 1 ? '' : 's'}. Upgrade in Settings to add more.`,
        403
      );
    }
  }

  const hashed = await bcrypt.hash(data.password, 10);
  const result = await query(
    `INSERT INTO users (name, email, password, role_id, pin, is_active)
     VALUES ($1,$2,$3,$4,$5,TRUE) RETURNING id, name, email, role_id, is_active, created_at`,
    [data.name, data.email, hashed, data.role_id, data.pin || null]
  );
  return result.rows[0];
};

export const updateUser = async (
  id: number,
  data: { name?: string; email?: string; role_id?: number; is_active?: boolean; pin?: string; password?: string },
  // The caller's own token, when known — only needed to detect the
  // self-edit-own-password case below and re-sign a working token for it.
  requester?: AuthPayload
): Promise<User & { token?: string }> => {
  if (data.email) {
    const existing = await query('SELECT id FROM users WHERE email = $1 AND id != $2', [data.email, id]);
    if (existing.rows.length > 0) throw createError('Email already exists', 400);
  }

  const fields: string[] = [];
  const values: unknown[] = [];
  let i = 1;

  if (data.name) { fields.push(`name = $${i++}`); values.push(data.name); }
  if (data.email) { fields.push(`email = $${i++}`); values.push(data.email); }
  if (data.role_id) { fields.push(`role_id = $${i++}`); values.push(data.role_id); }
  if (data.is_active !== undefined) { fields.push(`is_active = $${i++}`); values.push(data.is_active); }
  if (data.pin !== undefined) { fields.push(`pin = $${i++}`); values.push(data.pin || null); }
  if (data.password) {
    if (data.password.length < 6) throw createError('Password must be at least 6 characters', 400);
    const hashed = await bcrypt.hash(data.password, 10);
    fields.push(`password = $${i++}`);
    values.push(hashed);
  }

  if (fields.length === 0) throw createError('No fields to update', 400);
  fields.push('updated_at = NOW()');
  values.push(id);

  const result = await query(
    `UPDATE users SET ${fields.join(', ')} WHERE id = $${i} AND deleted_at IS NULL
     RETURNING id, name, email, role_id, is_active, created_at, updated_at`,
    values
  );
  if (result.rows.length === 0) throw createError('User not found', 404);
  if (!data.password) return result.rows[0];

  markPasswordChanged(id);

  // Changing your OWN password through this (admin) endpoint revokes the
  // very token you're making this request with — e.g. the first-run Setup
  // wizard and a self-edit from the Users page both do this. Without a
  // fresh token here, the caller's next request 401s as "session expired"
  // even though the password change itself just succeeded. Only relevant
  // when editing someone else's password (an admin resetting a staff
  // member's login) — that staff member's own token is revoked as
  // intended, and the admin's token is untouched since it's a different id.
  if (!requester || requester.id !== id) return result.rows[0];

  const roleResult = await query(
    'SELECT u.role_id, r.name as role_name, r.permissions FROM users u JOIN roles r ON u.role_id = r.id WHERE u.id = $1',
    [id]
  );
  const fresh = roleResult.rows[0];
  const token = signToken({
    id,
    email: result.rows[0].email,
    role_id: fresh.role_id,
    role_name: fresh.role_name,
    permissions: fresh.permissions,
    sandbox: requester.sandbox,
  });
  return { ...result.rows[0], token };
};

export const deleteUser = async (id: number): Promise<void> => {
  const result = await query(
    `UPDATE users SET deleted_at = NOW() WHERE id = $1 AND deleted_at IS NULL`,
    [id]
  );
  if (result.rowCount === 0) throw createError('User not found', 404);
};

export const getRoles = async () => {
  const result = await query('SELECT id, name FROM roles ORDER BY name', []);
  return result.rows;
};

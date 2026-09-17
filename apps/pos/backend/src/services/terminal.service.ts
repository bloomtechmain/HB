import { query, transaction } from '../config/database';
import { createError } from '../middleware/error';
import { Terminal } from '../types';
import { PoolClient } from 'pg';

// Called by a Terminal machine on startup, before any staff login exists —
// there is no JWT to authenticate this request with, so trust is purely
// "reachable on the same LAN as the Server." Idempotent by fingerprint: a
// Terminal that's already registered just refreshes last_seen_at.
export const registerTerminal = async (fingerprint: string, name: string | null): Promise<Terminal> => {
  if (!fingerprint || typeof fingerprint !== 'string') {
    throw createError('Missing machine fingerprint', 400);
  }

  return transaction(async (client: PoolClient) => {
    const existing = await client.query('SELECT * FROM terminals WHERE fingerprint = $1 FOR UPDATE', [fingerprint]);
    if (existing.rows.length > 0) {
      const updated = await client.query(
        'UPDATE terminals SET last_seen_at = NOW(), name = COALESCE($1, name) WHERE fingerprint = $2 RETURNING *',
        [name, fingerprint]
      );
      return updated.rows[0];
    }

    const inserted = await client.query(
      'INSERT INTO terminals (fingerprint, name) VALUES ($1, $2) RETURNING *',
      [fingerprint, name]
    );
    return inserted.rows[0];
  });
};

export const getTerminals = async (): Promise<Terminal[]> => {
  const result = await query('SELECT * FROM terminals ORDER BY last_seen_at DESC', []);
  return result.rows;
};

export const removeTerminal = async (id: number): Promise<void> => {
  const result = await query('DELETE FROM terminals WHERE id = $1', [id]);
  if (result.rowCount === 0) throw createError('Terminal not found', 404);
};

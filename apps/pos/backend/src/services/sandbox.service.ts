import { PoolClient } from 'pg';
import { transaction, query } from '../config/database';
import { createError } from '../middleware/error';
import { SANDBOX_SCHEMA_STATEMENTS } from '../config/sandboxSchemaStatements';
import { DEFAULT_PLAN_KEY } from '../data/plans';
import { isSafeSchemaName } from '../config/database';

// Starter data for a freshly-created sandbox — enough to click around and
// try a sale immediately, not a full demo of every feature. Spans piece/kg/
// litre units on purpose so the unit-of-measure feature is visible too.
const SANDBOX_CATEGORIES = [
  { name: 'Groceries', color: '#22c55e' },
  { name: 'Beverages', color: '#3b82f6' },
  { name: 'Household', color: '#f59e0b' },
];
const SANDBOX_PRODUCTS: Array<{
  name: string; sku: string; category: string; unit_type: string;
  cost_price: number; selling_price: number; current_stock: number;
}> = [
  { name: 'Basmati Rice 5kg', sku: 'SBX-001', category: 'Groceries', unit_type: 'piece', cost_price: 8.5, selling_price: 11.99, current_stock: 40 },
  { name: 'Sugar', sku: 'SBX-002', category: 'Groceries', unit_type: 'kg', cost_price: 1.1, selling_price: 1.5, current_stock: 60 },
  { name: 'Cooking Oil 1L', sku: 'SBX-003', category: 'Groceries', unit_type: 'litre', cost_price: 2.8, selling_price: 3.75, current_stock: 30 },
  { name: 'Bottled Water 500ml', sku: 'SBX-004', category: 'Beverages', unit_type: 'piece', cost_price: 0.2, selling_price: 0.5, current_stock: 120 },
  { name: 'Orange Juice 1L', sku: 'SBX-005', category: 'Beverages', unit_type: 'piece', cost_price: 1.6, selling_price: 2.4, current_stock: 25 },
  { name: 'Instant Coffee', sku: 'SBX-006', category: 'Beverages', unit_type: 'piece', cost_price: 3.2, selling_price: 4.5, current_stock: 18 },
  { name: 'Dish Soap', sku: 'SBX-007', category: 'Household', unit_type: 'piece', cost_price: 1.4, selling_price: 2.1, current_stock: 35 },
  { name: 'Paper Towels', sku: 'SBX-008', category: 'Household', unit_type: 'piece', cost_price: 2.0, selling_price: 2.99, current_stock: 22 },
];

// Called from POST /auth/sandbox the first time this install switches into
// sandbox mode — creates a sibling "sandbox" Postgres schema (a full copy of
// every business table, see SANDBOX_SCHEMA_STATEMENTS) seeded with
// disposable practice data, so a shop can click around and try a sale
// without touching their real data. Idempotent — if the schema already
// exists (a previous switch already created it), this is a no-op so nothing
// the user already added there is ever touched or reset.
const SANDBOX_SCHEMA = 'sandbox';

export const ensureSandboxSchema = async (): Promise<string> => {
  const existing = await query(
    `SELECT 1 FROM information_schema.schemata WHERE schema_name = $1`,
    [SANDBOX_SCHEMA]
  );
  if (existing.rows.length > 0) return SANDBOX_SCHEMA;

  if (!isSafeSchemaName(SANDBOX_SCHEMA)) throw createError('Invalid sandbox schema name', 500);

  // Mirror the live plan/currency/business name into the sandbox once, at
  // creation, so feature-gating and formatting match what the user actually
  // has. This is a one-time snapshot, not kept in sync afterward — the
  // sandbox is for learning the system, not a live mirror of the account.
  const liveSettingsResult = await query('SELECT * FROM settings WHERE id = 1', []);
  const live = liveSettingsResult.rows[0];

  return transaction(async (client: PoolClient) => {
    await client.query(`CREATE SCHEMA "${SANDBOX_SCHEMA}"`);
    await client.query(`SET search_path TO "${SANDBOX_SCHEMA}", public`);

    for (const statement of SANDBOX_SCHEMA_STATEMENTS) {
      await client.query(statement);
    }

    await client.query(
      `INSERT INTO settings (business_name, business_type, plan_key, custom_features, currency_code, currency_symbol, setup_completed)
       VALUES ($1,$2,$3,$4,$5,$6,TRUE)
       ON CONFLICT (id) DO UPDATE SET business_name = $1, business_type = $2, plan_key = $3, custom_features = $4, currency_code = $5, currency_symbol = $6, setup_completed = TRUE`,
      [
        live?.business_name ? `${live.business_name} (Sandbox)` : 'My Sandbox Business',
        live?.business_type || '',
        live?.plan_key || DEFAULT_PLAN_KEY,
        live?.custom_features ? JSON.stringify(live.custom_features) : null,
        live?.currency_code || 'USD',
        live?.currency_symbol || '$',
      ]
    );

    const categoryIdByName: Record<string, number> = {};
    for (const cat of SANDBOX_CATEGORIES) {
      const result = await client.query(
        'INSERT INTO categories (name, color) VALUES ($1, $2) RETURNING id',
        [cat.name, cat.color]
      );
      categoryIdByName[cat.name] = result.rows[0].id;
    }

    for (const p of SANDBOX_PRODUCTS) {
      await client.query(
        `INSERT INTO products (name, sku, category_id, unit_type, cost_price, selling_price, current_stock, costing_method)
         VALUES ($1,$2,$3,$4,$5,$6,$7,'weighted_average')`,
        [p.name, p.sku, categoryIdByName[p.category] || null, p.unit_type, p.cost_price, p.selling_price, p.current_stock]
      );
    }

    return SANDBOX_SCHEMA;
  });
};

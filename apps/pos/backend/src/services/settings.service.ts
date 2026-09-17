import { PoolClient } from 'pg';
import { query, transaction } from '../config/database';
import { createError } from '../middleware/error';
import { Settings } from '../types';
import { CATEGORY_TEMPLATES } from '../data/categoryTemplates';

// With NO valid token at all (the frontend calls this eagerly on every app
// mount, including the login screen before any token exists), there's
// nothing to authenticate against yet — the caller (see
// settings.controller.ts) returns this without ever reaching the DB.
export const GENERIC_DEFAULTS: Settings = {
  id: 1,
  business_name: 'BloomPOS',
  business_type: '',
  currency_code: 'USD',
  currency_symbol: '$',
  plan_key: 'basic',
  setup_completed: false,
  restaurant_mode_enabled: false,
  loyalty_enabled: false,
  loyalty_earn_rate_percent: 0.025,
  whatsapp_enabled: false,
  backup_schedule_enabled: false,
  backup_schedule_frequency: 'daily',
  backup_schedule_time: '23:00',
  backup_schedule_day_of_week: 0,
  backup_schedule_day_of_month: 1,
  created_at: new Date(0),
  updated_at: new Date(0),
};

export const getSettings = async (): Promise<Settings> => {
  const result = await query('SELECT * FROM settings WHERE id = 1', []);
  if (result.rows.length === 0) throw createError('Settings not found', 404);
  return result.rows[0];
};

export const updateSettings = async (
  data: Partial<{
    business_name: string;
    business_type: string;
    logo_data_url: string;
    address: string;
    phone: string;
    email: string;
    currency_code: string;
    currency_symbol: string;
    vat_registration_number: string;
    default_invoice_note: string;
    restaurant_mode_enabled: boolean;
    loyalty_enabled: boolean;
    loyalty_earn_rate_percent: number;
    whatsapp_enabled: boolean;
    whatsapp_country_code: string;
  }>
): Promise<Settings> => {
  const existing = await getSettings();

  // Merchant-editable rate — no hardcoded default, admin can raise or lower
  // it at any time from Settings. Just bounded to a sane non-negative
  // percentage so a typo can't silently give away >100% of every sale.
  let loyaltyRate = existing.loyalty_earn_rate_percent;
  if (data.loyalty_earn_rate_percent !== undefined) {
    const rate = Number(data.loyalty_earn_rate_percent);
    if (!Number.isFinite(rate) || rate < 0 || rate > 100) {
      throw createError('Loyalty earn rate must be a number between 0 and 100', 400);
    }
    loyaltyRate = rate;
  }

  const result = await query(
    `UPDATE settings SET
       business_name = $1, business_type = $2, logo_data_url = $3, address = $4,
       phone = $5, email = $6, currency_code = $7, currency_symbol = $8,
       vat_registration_number = $9, restaurant_mode_enabled = $10, default_invoice_note = $11,
       loyalty_enabled = $12, loyalty_earn_rate_percent = $13,
       whatsapp_enabled = $14, whatsapp_country_code = $15, updated_at = NOW()
     WHERE id = 1 RETURNING *`,
    [
      data.business_name?.trim() || existing.business_name,
      data.business_type ?? existing.business_type,
      data.logo_data_url ?? existing.logo_data_url,
      data.address ?? existing.address,
      data.phone ?? existing.phone,
      data.email ?? existing.email,
      data.currency_code?.trim() || existing.currency_code,
      data.currency_symbol?.trim() || existing.currency_symbol,
      data.vat_registration_number ?? existing.vat_registration_number,
      data.restaurant_mode_enabled ?? existing.restaurant_mode_enabled,
      data.default_invoice_note ?? existing.default_invoice_note,
      data.loyalty_enabled ?? existing.loyalty_enabled,
      loyaltyRate,
      data.whatsapp_enabled ?? existing.whatsapp_enabled,
      data.whatsapp_country_code?.trim() ?? existing.whatsapp_country_code,
    ]
  );
  return result.rows[0];
};

export const listTemplates = () => {
  return Object.entries(CATEGORY_TEMPLATES).map(([key, template]) => ({
    key,
    label: template.label,
    categories: template.categories,
  }));
};


// plan_key is not accepted here either, for the same reason as updateSettings
// above.
export const completeSetup = async (data: {
  business_name?: string;
  business_type?: string;
  logo_data_url?: string;
  address?: string;
  phone?: string;
  email?: string;
  currency_code?: string;
  currency_symbol?: string;
  template_key?: string;
}): Promise<Settings> => {
  return transaction(async (client: PoolClient) => {
    const existingResult = await client.query('SELECT * FROM settings WHERE id = 1 FOR UPDATE');
    if (existingResult.rows.length === 0) throw createError('Settings not found', 404);
    const existing = existingResult.rows[0];

    const updateResult = await client.query(
      `UPDATE settings SET
         business_name = $1, business_type = $2, logo_data_url = $3, address = $4,
         phone = $5, email = $6, currency_code = $7, currency_symbol = $8,
         setup_completed = TRUE, updated_at = NOW()
       WHERE id = 1 RETURNING *`,
      [
        data.business_name?.trim() || existing.business_name,
        data.business_type ?? existing.business_type,
        data.logo_data_url ?? existing.logo_data_url,
        data.address ?? existing.address,
        data.phone ?? existing.phone,
        data.email ?? existing.email,
        data.currency_code?.trim() || existing.currency_code,
        data.currency_symbol?.trim() || existing.currency_symbol,
      ]
    );

    const template = data.template_key ? CATEGORY_TEMPLATES[data.template_key] : undefined;
    if (template) {
      for (const cat of template.categories) {
        const exists = await client.query('SELECT id FROM categories WHERE name = $1', [cat.name]);
        if (exists.rows.length === 0) {
          await client.query('INSERT INTO categories (name, color) VALUES ($1, $2)', [cat.name, cat.color]);
        }
      }
    }

    return updateResult.rows[0];
  });
};

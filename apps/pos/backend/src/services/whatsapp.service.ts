import path from 'path';
import os from 'os';
import fs from 'fs';
import pino from 'pino';
import QRCode from 'qrcode';
import type { WASocket, ConnectionState } from '@whiskeysockets/baileys';
import { query } from '../config/database';
import { getSaleById } from './sales.service';
import { getCustomerById } from './customer.service';
import { buildWhatsappReceiptText } from '../utils/whatsappReceipt';
import { Settings } from '../types';

// ─── Embedded WhatsApp connection ───────────────────────────────────────────
// No official WhatsApp Business API — this links the shop's own WhatsApp
// number by scanning a QR code, the same way WhatsApp Web does, via Baileys
// (a reverse-engineered WhatsApp Web client). One connection per running
// backend process — correct, since this is always a single-business install
// (Electron desktop app or self-hosted web app).
//
// Baileys ships as an ESM-only package; this backend compiles to CommonJS
// (tsconfig's module: "commonjs"), so it's loaded via a dynamic import()
// rather than a static one — TypeScript preserves dynamic import() as a real
// runtime import even under a commonjs target, which is exactly the
// interop path Node itself documents for requiring ESM from CJS.
type BaileysModule = typeof import('@whiskeysockets/baileys');
let baileysModulePromise: Promise<BaileysModule> | null = null;
const loadBaileys = (): Promise<BaileysModule> => {
  if (!baileysModulePromise) baileysModulePromise = import('@whiskeysockets/baileys');
  return baileysModulePromise;
};

// Never inside the repo — this is a login credential for the shop's own
// WhatsApp account and must never end up in source control or a backup zip
// of the app's install directory.
const SESSION_DIR = process.env.WHATSAPP_SESSION_DIR || path.join(os.homedir(), '.retail-pos-whatsapp-session');

const logger = pino({ level: 'silent' });

export type WhatsappConnectionState = 'disconnected' | 'connecting' | 'qr' | 'connected';

let sock: WASocket | null = null;
let state: WhatsappConnectionState = 'disconnected';
let currentQr: string | null = null;
let connectedNumber: string | null = null;
let connecting = false;

const connect = async (): Promise<void> => {
  if (connecting) return;
  connecting = true;
  try {
    const { makeWASocket, useMultiFileAuthState, DisconnectReason, DEFAULT_CONNECTION_CONFIG } = await loadBaileys();
    const { state: authState, saveCreds } = await useMultiFileAuthState(SESSION_DIR);

    state = 'connecting';
    currentQr = null;

    const socket = makeWASocket({
      ...DEFAULT_CONNECTION_CONFIG,
      auth: authState,
      logger,
      printQRInTerminal: false,
    });
    sock = socket;

    socket.ev.on('creds.update', saveCreds);
    socket.ev.on('connection.update', (update: Partial<ConnectionState>) => {
      if (update.qr) {
        currentQr = update.qr;
        state = 'qr';
      }
      if (update.connection === 'open') {
        state = 'connected';
        currentQr = null;
        connectedNumber = socket.user?.id?.split('@')[0]?.split(':')[0] || null;
      }
      if (update.connection === 'close') {
        // Boom | Error union — only the statusCode matters here, and only
        // Boom errors carry one; anything else falls through to "reconnect".
        const statusCode = (update.lastDisconnect?.error as { output?: { statusCode?: number } } | undefined)
          ?.output?.statusCode;
        const loggedOut = statusCode === DisconnectReason.loggedOut;
        sock = null;
        state = 'disconnected';
        currentQr = null;
        connectedNumber = null;
        if (loggedOut) {
          // Unlinked from the phone — the saved session is dead. Clear it so
          // the next pairing attempt starts completely fresh instead of
          // retrying credentials that will never work again.
          fs.rmSync(SESSION_DIR, { recursive: true, force: true });
        } else {
          // Any other close (network blip, server restart, WhatsApp server
          // hiccup) — reconnect automatically with the same saved session,
          // no rescanning needed.
          connect().catch((err) => console.warn('[whatsapp] Reconnect failed:', (err as Error).message));
        }
      }
    });
  } finally {
    connecting = false;
  }
};

// Called once at backend startup — resumes a previously linked session so
// the shop doesn't have to rescan a QR code every time the app restarts.
// A no-op if this install never paired (no saved session on disk yet); the
// admin starts that with startPairing() below.
export const initFromSavedSession = async (): Promise<void> => {
  if (!fs.existsSync(path.join(SESSION_DIR, 'creds.json'))) return;
  try {
    await connect();
  } catch (err) {
    console.warn('[whatsapp] Failed to resume saved session:', (err as Error).message);
  }
};

export const startPairing = async (): Promise<void> => {
  if (state === 'connected' || state === 'connecting' || state === 'qr') return;
  await connect();
};

export const logout = async (): Promise<void> => {
  if (sock) {
    try { await sock.logout(); } catch { /* session may already be dead — clearing it below is what matters */ }
  }
  sock = null;
  state = 'disconnected';
  currentQr = null;
  connectedNumber = null;
  fs.rmSync(SESSION_DIR, { recursive: true, force: true });
};

export const getStatus = async (): Promise<{ state: WhatsappConnectionState; qrDataUrl: string | null; phoneNumber: string | null }> => {
  return {
    state,
    qrDataUrl: currentQr ? await QRCode.toDataURL(currentQr) : null,
    phoneNumber: connectedNumber,
  };
};

// Turns a locally-formatted number (e.g. "077 026 275") into the digits
// WhatsApp expects (country code + subscriber number, no leading zero, no
// symbols). settings.whatsapp_country_code supplies the code to substitute
// for a leading 0; a number that already looks internationally formatted
// (no leading 0, long enough) is passed through as-is.
export const normalizePhone = (raw: string, countryCode: string | null | undefined): string | null => {
  const digits = raw.replace(/\D/g, '');
  if (!digits) return null;
  if (digits.startsWith('0')) {
    if (!countryCode?.trim()) return null;
    return `${countryCode.replace(/\D/g, '')}${digits.slice(1)}`;
  }
  if (digits.length < 8) return null;
  return digits;
};

export const sendTextMessage = async (phoneDigits: string, text: string): Promise<{ success: boolean; error?: string }> => {
  if (state !== 'connected' || !sock) return { success: false, error: 'WhatsApp is not connected' };
  try {
    await sock.sendMessage(`${phoneDigits}@s.whatsapp.net`, { text });
    return { success: true };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
};

// Fire-and-forget checkout hook — called right after a sale completes (see
// sales.controller.ts). Never throws: a WhatsApp failure (not connected, no
// phone on file, bad number, network error) must never surface as a
// checkout error to the cashier — the sale already succeeded.
export const sendReceiptForSale = async (saleId: number): Promise<void> => {
  try {
    const settingsResult = await query('SELECT * FROM settings WHERE id = 1', []);
    const settings: Settings | undefined = settingsResult.rows[0];
    if (!settings?.whatsapp_enabled) return;

    const sale = await getSaleById(saleId);
    if (!sale.customer_id) return;

    const customer = await getCustomerById(sale.customer_id);
    if (!customer.phone) return;

    const phoneDigits = normalizePhone(customer.phone, settings.whatsapp_country_code);
    if (!phoneDigits) {
      console.warn(`[whatsapp] Could not normalize phone "${customer.phone}" for customer ${customer.id} — set a country code in Settings > WhatsApp.`);
      return;
    }

    const text = buildWhatsappReceiptText(sale, sale.items || [], settings);
    const result = await sendTextMessage(phoneDigits, text);
    if (!result.success) {
      console.warn(`[whatsapp] Failed to send receipt for sale ${sale.sale_number}:`, result.error);
    }
  } catch (err) {
    console.warn('[whatsapp] sendReceiptForSale error:', (err as Error).message);
  }
};

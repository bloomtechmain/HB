import { Response, NextFunction } from 'express';
import * as whatsappService from '../services/whatsapp.service';
import * as settingsService from '../services/settings.service';
import { AuthRequest } from '../middleware/auth';
import { createError } from '../middleware/error';

export const status = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const data = await whatsappService.getStatus();
    res.json({ success: true, data });
  } catch (err) { next(err); }
};

export const pair = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    await whatsappService.startPairing();
    res.json({ success: true });
  } catch (err) { next(err); }
};

export const logout = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    await whatsappService.logout();
    res.json({ success: true });
  } catch (err) { next(err); }
};

export const test = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const phone = (req.body.phone as string || '').trim();
    if (!phone) throw createError('Enter a phone number', 400);

    const settings = await settingsService.getSettings();
    const digits = whatsappService.normalizePhone(phone, settings.whatsapp_country_code);
    if (!digits) throw createError('Could not normalize that phone number — check the country code in Settings > WhatsApp', 400);

    const result = await whatsappService.sendTextMessage(digits, 'This is a test message from your POS. WhatsApp is connected correctly.');
    if (!result.success) throw createError(result.error || 'Failed to send test message', 400);

    res.json({ success: true });
  } catch (err) { next(err); }
};

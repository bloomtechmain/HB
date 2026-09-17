import { Response, NextFunction } from 'express';
import * as settingsService from '../services/settings.service';
import { AuthRequest } from '../middleware/auth';

export const get = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    // No valid token at all (the frontend calls this eagerly on every app
    // mount, including the login screen before any token exists) — skip the
    // DB entirely rather than erroring. A valid token always resolves for
    // real, against this install's one public.settings row.
    const data = req.user ? await settingsService.getSettings() : settingsService.GENERIC_DEFAULTS;
    res.json({ success: true, data });
  } catch (err) { next(err); }
};

export const update = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const data = await settingsService.updateSettings(req.body);
    res.json({ success: true, data });
  } catch (err) { next(err); }
};

export const templates = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const data = settingsService.listTemplates();
    res.json({ success: true, data });
  } catch (err) { next(err); }
};

export const completeSetup = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const data = await settingsService.completeSetup(req.body);
    res.json({ success: true, data });
  } catch (err) { next(err); }
};

export const plans = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const data = settingsService.listPlans();
    res.json({ success: true, data });
  } catch (err) { next(err); }
};

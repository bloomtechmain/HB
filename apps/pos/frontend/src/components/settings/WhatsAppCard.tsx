import { useCallback, useEffect, useState } from 'react';
import { useToastStore } from '../../store/toastStore';
import { useSettingsStore } from '../../store/settingsStore';
import api from '../../services/api';
import { AxiosError } from 'axios';

type WhatsappConnectionState = 'disconnected' | 'connecting' | 'qr' | 'connected';

interface WhatsappStatus {
  state: WhatsappConnectionState;
  qrDataUrl: string | null;
  phoneNumber: string | null;
}

export function WhatsAppCard() {
  const toast = useToastStore();
  const { settings, setSettings } = useSettingsStore();
  const [status, setStatus] = useState<WhatsappStatus | null>(null);
  const [pairing, setPairing] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  const [countryCode, setCountryCode] = useState('');
  const [autoSend, setAutoSend] = useState(false);
  const [saving, setSaving] = useState(false);

  const [testPhone, setTestPhone] = useState('');
  const [sendingTest, setSendingTest] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const r = await api.get('/whatsapp/status');
      setStatus(r.data.data);
    } catch {
      // Leave the last known status showing rather than flashing "unknown"
      // on a single missed poll.
    }
  }, []);

  useEffect(() => {
    refresh();
    // Polls so the QR code / connected state updates live once the shop
    // owner scans it on their phone, without a page reload.
    const interval = setInterval(refresh, 3000);
    return () => clearInterval(interval);
  }, [refresh]);

  useEffect(() => {
    if (settings) {
      setCountryCode(settings.whatsapp_country_code || '');
      setAutoSend(settings.whatsapp_enabled || false);
    }
  }, [settings]);

  const startPairing = async () => {
    setPairing(true);
    try {
      await api.post('/whatsapp/pair');
      await refresh();
    } catch (err) {
      const e = err as AxiosError<{ message: string }>;
      toast.error(e.response?.data?.message || 'Failed to start pairing');
    } finally {
      setPairing(false);
    }
  };

  const disconnect = async () => {
    if (!confirm('Disconnect WhatsApp? You\'ll need to scan a new QR code to reconnect.')) return;
    setLoggingOut(true);
    try {
      await api.post('/whatsapp/logout');
      toast.success('WhatsApp disconnected');
      await refresh();
    } catch (err) {
      const e = err as AxiosError<{ message: string }>;
      toast.error(e.response?.data?.message || 'Failed to disconnect');
    } finally {
      setLoggingOut(false);
    }
  };

  const save = async () => {
    setSaving(true);
    try {
      const r = await api.put('/settings', {
        whatsapp_enabled: autoSend,
        whatsapp_country_code: countryCode,
      });
      setSettings(r.data.data);
      toast.success('WhatsApp settings saved');
    } catch (err) {
      const e = err as AxiosError<{ message: string }>;
      toast.error(e.response?.data?.message || 'Failed to save WhatsApp settings');
    } finally {
      setSaving(false);
    }
  };

  const sendTest = async () => {
    if (!testPhone.trim()) { toast.error('Enter a phone number'); return; }
    setSendingTest(true);
    try {
      await api.post('/whatsapp/test', { phone: testPhone });
      toast.success('Test message sent');
    } catch (err) {
      const e = err as AxiosError<{ message: string }>;
      toast.error(e.response?.data?.message || 'Failed to send test message');
    } finally {
      setSendingTest(false);
    }
  };

  const state = status?.state || 'disconnected';

  return (
    <div className="card p-6 space-y-6">
      <div>
        <h3 className="font-semibold text-surface-900">WhatsApp</h3>
        <p className="text-surface-500 text-sm mt-0.5">
          Connect your own WhatsApp number by scanning a QR code — no third-party API involved. Once connected, receipts can be sent automatically to any customer with a WhatsApp number on file.
        </p>
      </div>

      {/* Connection panel */}
      <div className="bg-surface-50 rounded-xl p-4">
        {state === 'connected' ? (
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 shrink-0" />
              <div>
                <p className="text-sm font-semibold text-surface-900">Connected</p>
                {status?.phoneNumber && <p className="text-xs text-surface-500 font-mono">+{status.phoneNumber}</p>}
              </div>
            </div>
            <button onClick={disconnect} disabled={loggingOut} className="btn-secondary btn-sm">
              {loggingOut ? 'Disconnecting...' : 'Disconnect'}
            </button>
          </div>
        ) : state === 'qr' && status?.qrDataUrl ? (
          <div className="text-center space-y-2">
            <p className="text-sm font-medium text-surface-700">Scan this with WhatsApp on your phone</p>
            <p className="text-xs text-surface-400">WhatsApp → Settings → Linked Devices → Link a Device</p>
            <img src={status.qrDataUrl} alt="WhatsApp QR code" className="mx-auto w-48 h-48 rounded-lg border border-surface-200" />
          </div>
        ) : state === 'connecting' ? (
          <div className="flex items-center gap-3 justify-center py-4">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-500 animate-pulse shrink-0" />
            <p className="text-sm text-surface-600">Connecting…</p>
          </div>
        ) : (
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <span className="w-2.5 h-2.5 rounded-full bg-surface-300 shrink-0" />
              <p className="text-sm text-surface-600">Not connected</p>
            </div>
            <button onClick={startPairing} disabled={pairing} className="btn-primary btn-sm">
              {pairing ? 'Starting...' : 'Connect WhatsApp'}
            </button>
          </div>
        )}
      </div>

      {/* Policy settings */}
      <div className="space-y-3">
        <label className="flex items-center gap-3 cursor-pointer">
          <input type="checkbox" className="w-4 h-4" checked={autoSend} onChange={(e) => setAutoSend(e.target.checked)} />
          <div>
            <span className="text-sm font-medium text-surface-900">Auto-send receipt after checkout</span>
            <p className="text-xs text-surface-500 mt-0.5">Sends a text summary of the bill to any customer with a phone number on file, right after their sale completes.</p>
          </div>
        </label>

        <div>
          <label className="label">Country Code <span className="font-normal text-surface-400">(used to complete a locally-formatted number, e.g. "94" for a number saved as 077...)</span></label>
          <input
            className="input font-mono max-w-[120px]"
            value={countryCode}
            onChange={(e) => setCountryCode(e.target.value)}
            placeholder="e.g. 94"
          />
        </div>

        <div className="flex justify-end pt-1">
          <button className="btn-primary btn-sm" disabled={saving} onClick={save}>
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>

      {/* Test message */}
      {state === 'connected' && (
        <div className="border-t border-surface-200 pt-4 space-y-2">
          <label className="label">Send a Test Message</label>
          <div className="flex gap-2">
            <input
              className="input font-mono"
              value={testPhone}
              onChange={(e) => setTestPhone(e.target.value)}
              placeholder="e.g. 077 026 275"
            />
            <button onClick={sendTest} disabled={sendingTest} className="btn-secondary btn-sm shrink-0">
              {sendingTest ? 'Sending...' : 'Send Test'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

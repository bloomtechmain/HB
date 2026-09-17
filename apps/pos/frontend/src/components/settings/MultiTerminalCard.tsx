import { useState, useEffect, useCallback } from 'react';
import { Terminal } from '../../types';
import { useToastStore } from '../../store/toastStore';
import api from '../../services/api';

interface TerminalRoleAPI {
  isTerminal: () => Promise<{ role: 'terminal'; serverHost: string; serverPort: number } | null>;
  disconnect: () => Promise<{ success: boolean }>;
  getServerInfo: () => Promise<{ lanIp: string | null; port: number }>;
  testConnection: (params: { host: string; port: number }) => Promise<{ success: boolean; error?: string }>;
  connectAsTerminal: (params: { host: string; port: number }) => Promise<{ success: boolean; error?: string }>;
}

declare global {
  interface Window {
    electronTerminalAPI?: TerminalRoleAPI;
  }
}

export function MultiTerminalCard() {
  const toast = useToastStore();
  const [roleInfo, setRoleInfo] = useState<{ role: 'terminal'; serverHost: string; serverPort: number } | null | undefined>(undefined);
  const [serverInfo, setServerInfo] = useState<{ lanIp: string | null; port: number } | null>(null);
  const [terminals, setTerminals] = useState<Terminal[]>([]);
  const [loading, setLoading] = useState(true);
  const [disconnecting, setDisconnecting] = useState(false);

  const [showConnectForm, setShowConnectForm] = useState(false);
  const [connectHost, setConnectHost] = useState('');
  const [connectPort, setConnectPort] = useState('5000');
  const [connecting, setConnecting] = useState(false);
  const [connectError, setConnectError] = useState('');

  const load = useCallback(async () => {
    if (!window.electronTerminalAPI) { setLoading(false); return; }
    setLoading(true);
    try {
      const role = await window.electronTerminalAPI.isTerminal();
      setRoleInfo(role);
      if (!role) {
        const [info, list] = await Promise.all([
          window.electronTerminalAPI.getServerInfo(),
          api.get('/terminals').catch(() => ({ data: { data: [] } })),
        ]);
        setServerInfo(info);
        setTerminals(list.data.data);
      }
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const disconnect = async () => {
    if (!window.electronTerminalAPI) return;
    if (!confirm('Disconnect this device from the Server and use it standalone? It will start its own local database.')) return;
    setDisconnecting(true);
    try {
      await window.electronTerminalAPI.disconnect();
      // App relaunches itself right after this resolves.
    } catch {
      toast.error('Failed to disconnect');
      setDisconnecting(false);
    }
  };

  const connectToServer = async () => {
    if (!window.electronTerminalAPI) return;
    const host = connectHost.trim();
    const port = parseInt(connectPort, 10) || 5000;
    if (!host) { setConnectError('Enter the Server\'s address'); return; }

    setConnecting(true);
    setConnectError('');
    try {
      const test = await window.electronTerminalAPI.testConnection({ host, port });
      if (!test.success) {
        setConnectError(test.error || `Could not reach ${host}:${port}`);
        return;
      }
      const result = await window.electronTerminalAPI.connectAsTerminal({ host, port });
      if (!result.success) {
        setConnectError(result.error || 'Could not pair with that Server');
        return;
      }
      // App relaunches itself as a Terminal right after this resolves.
    } catch {
      setConnectError('Connection failed');
    } finally {
      setConnecting(false);
    }
  };

  const removeTerminal = async (id: number) => {
    if (!confirm('Remove this terminal? It will need to reconnect (and count against the seat limit again) to be used here.')) return;
    try {
      await api.delete(`/terminals/${id}`);
      load();
    } catch {
      toast.error('Failed to remove terminal');
    }
  };

  if (!window.electronTerminalAPI) {
    return (
      <div>
        <h3 className="font-semibold text-surface-900">Multi-Terminal</h3>
        <p className="text-surface-500 text-sm mt-2">
          Multi-Terminal networking (pairing several tills over LAN to one Server machine) is a feature of the
          offline desktop app, not the web/browser version. Install and open the desktop app to set it up.
        </p>
      </div>
    );
  }

  if (loading) {
    return <p className="text-sm text-surface-400">Loading...</p>;
  }

  if (roleInfo) {
    return (
      <div className="space-y-3">
        <div>
          <h3 className="font-semibold text-surface-900">Multi-Terminal</h3>
          <p className="text-surface-500 text-sm mt-0.5">
            This device is a <strong>Terminal</strong>, connected to the Server at{' '}
            <span className="font-mono">{roleInfo.serverHost}:{roleInfo.serverPort}</span>. It has no local database of its own.
          </p>
        </div>
        <button onClick={disconnect} disabled={disconnecting} className="btn-secondary btn-sm">
          {disconnecting ? 'Disconnecting...' : 'Disconnect from Server'}
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="font-semibold text-surface-900">Multi-Terminal</h3>
        <p className="text-surface-500 text-sm mt-0.5">
          Other tills on this network can connect to this machine as a <strong>Terminal</strong> — give them the address below during their setup.
        </p>
      </div>

      {serverInfo && (
        <div className="bg-surface-50 border border-surface-200 rounded-lg px-3 py-2 text-sm">
          <span className="text-surface-500">This Server's address: </span>
          <span className="font-mono font-semibold">{serverInfo.lanIp || 'Could not detect — check ipconfig'}:{serverInfo.port}</span>
        </div>
      )}

      {terminals.length === 0 ? (
        <p className="text-sm text-surface-400">No terminals connected yet.</p>
      ) : (
        <div className="table-wrapper">
          <table className="table">
            <thead>
              <tr><th>Name</th><th>Last Seen</th><th></th></tr>
            </thead>
            <tbody>
              {terminals.map((t) => (
                <tr key={t.id}>
                  <td className="font-medium">{t.name || 'Unnamed terminal'}</td>
                  <td className="text-sm text-surface-500">{new Date(t.last_seen_at).toLocaleString()}</td>
                  <td>
                    <button onClick={() => removeTerminal(t.id)} className="btn-sm text-red-500 hover:bg-red-50 rounded-lg px-2 py-1 text-xs font-medium">Remove</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="border-t border-surface-200 pt-4">
        {!showConnectForm ? (
          <button
            type="button"
            onClick={() => setShowConnectForm(true)}
            className="text-sm text-primary-600 hover:text-primary-800 font-medium"
          >
            🖥 Connect to a Server instead
          </button>
        ) : (
          <div className="space-y-2 max-w-sm">
            <p className="text-surface-500 text-sm">
              Turn this device into a Terminal of another till on this network — it'll use that Server's database instead of its own.
            </p>
            <div className="flex gap-2">
              <input
                className="input py-2 text-sm flex-1"
                placeholder="e.g. 192.168.1.10"
                value={connectHost}
                onChange={(e) => setConnectHost(e.target.value)}
              />
              <input
                className="input py-2 text-sm w-24"
                placeholder="5000"
                value={connectPort}
                onChange={(e) => setConnectPort(e.target.value)}
              />
            </div>
            {connectError && <p className="text-xs text-red-600">{connectError}</p>}
            <div className="flex gap-2">
              <button onClick={connectToServer} disabled={connecting} className="btn-primary btn-sm">
                {connecting ? 'Connecting...' : 'Connect'}
              </button>
              <button onClick={() => setShowConnectForm(false)} className="btn-secondary btn-sm">Cancel</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

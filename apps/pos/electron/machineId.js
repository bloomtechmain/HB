'use strict';
/**
 * A stable machine identifier for this install — used by Multi-Terminal
 * pairing (see terminal:connect in main.js) to name/identify a till on the
 * shop's LAN. Not a license/activation concept.
 */

const crypto = require('crypto');
const os = require('os');

/**
 * Returns a stable SHA-256 fingerprint of this machine.
 * Uses hostname + first non-internal MAC address + platform.
 */
function getMachineFingerprint() {
  const hostname = os.hostname();
  const platform = os.platform();

  let mac = '';
  const nets = os.networkInterfaces();
  outer: for (const name of Object.keys(nets)) {
    for (const iface of nets[name] || []) {
      if (!iface.internal && iface.mac && iface.mac !== '00:00:00:00:00:00') {
        mac = iface.mac;
        break outer;
      }
    }
  }

  return crypto
    .createHash('sha256')
    .update(`${hostname}|${mac}|${platform}`)
    .digest('hex');
}

module.exports = { getMachineFingerprint };

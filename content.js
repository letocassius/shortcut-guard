const DEFAULT_BLOCKED_KEYS = [];
const ELIGIBLE_PROTOCOLS = new Set(['http:', 'https:']);
const BRIDGE_SOURCE = 'shortcut-blocker-ext';
const BRIDGE_TARGET = 'shortcut-blocker-page';
const MSG_UPDATE_KEYS = 'SB_UPDATE_KEYS';
const MSG_BRIDGE_READY = 'SB_BRIDGE_READY';

let blockedKeys = DEFAULT_BLOCKED_KEYS.slice();
let bridgeReady = false;

function normalizeKey(key) {
  return typeof key === 'string' ? key.trim().toLowerCase() : '';
}

function normalizeList(list) {
  return Array.isArray(list) ? list.map(normalizeKey).filter(Boolean) : DEFAULT_BLOCKED_KEYS.slice();
}

function getBaseHost(hostname) {
  if (!hostname) {
    return null;
  }

  const ipv4Pattern = /^(?:\d{1,3}\.){3}\d{1,3}$/;
  if (hostname === 'localhost' || ipv4Pattern.test(hostname) || hostname.includes(':')) {
    return hostname;
  }

  const parts = hostname.split('.');
  if (parts.length <= 2) {
    return hostname;
  }
  return parts.slice(-2).join('.');
}

const currentHostKey = getBaseHost(window.location.hostname);
const isEligibleDocument = ELIGIBLE_PROTOCOLS.has(window.location.protocol) && !!currentHostKey;

function deriveKeysForCurrentHost(map = {}, legacyList = DEFAULT_BLOCKED_KEYS) {
  if (!isEligibleDocument || !currentHostKey) {
    return DEFAULT_BLOCKED_KEYS.slice();
  }
  if (map[currentHostKey]) {
    return normalizeList(map[currentHostKey]);
  }
  return normalizeList(legacyList);
}

function sendBlockedKeysToPage() {
  if (!bridgeReady || !isEligibleDocument) {
    return;
  }

  window.postMessage(
    {
      source: BRIDGE_SOURCE,
      type: MSG_UPDATE_KEYS,
      payload: blockedKeys,
    },
    '*'
  );
}

function injectBridgeScript() {
  if (window.__shortcutBlockerBridgeInjected || !isEligibleDocument) {
    return;
  }

  const script = document.createElement('script');
  script.src = chrome.runtime.getURL('pageGuard.js');
  script.async = false;
  script.onload = () => script.remove();
  const container = document.documentElement || document.head || document.body;
  if (!container) {
    document.addEventListener('DOMContentLoaded', injectBridgeScript, { once: true });
    return;
  }

  container.appendChild(script);
  window.__shortcutBlockerBridgeInjected = true;
}

function initBlockedKeys() {
  chrome.storage.sync.get({ blockedKeysByHost: {}, blockedKeys: DEFAULT_BLOCKED_KEYS }, (data) => {
    blockedKeys = deriveKeysForCurrentHost(data.blockedKeysByHost, data.blockedKeys);
    sendBlockedKeysToPage();
  });
}

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== 'sync' || !isEligibleDocument) {
    return;
  }

  if (changes.blockedKeysByHost) {
    const map = changes.blockedKeysByHost.newValue || {};
    blockedKeys = deriveKeysForCurrentHost(map, DEFAULT_BLOCKED_KEYS);
    sendBlockedKeysToPage();
    return;
  }

  if (changes.blockedKeys) {
    blockedKeys = deriveKeysForCurrentHost({}, changes.blockedKeys.newValue || DEFAULT_BLOCKED_KEYS);
    sendBlockedKeysToPage();
  }
});

window.addEventListener('message', (event) => {
  if (event.source !== window || !event.data || event.data.source !== BRIDGE_TARGET) {
    return;
  }

  if (event.data.type === MSG_BRIDGE_READY) {
    bridgeReady = true;
    sendBlockedKeysToPage();
  }
});

injectBridgeScript();
initBlockedKeys();

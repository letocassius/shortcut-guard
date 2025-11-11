const DEFAULT_BLOCKED_KEYS = [];
const SUPPORTED_PROTOCOLS = new Set(['http:', 'https:']);

const keyListEl = document.getElementById('keyList');
const addKeyForm = document.getElementById('addKeyForm');
const keyInput = document.getElementById('keyInput');
const addKeyButton = addKeyForm.querySelector('button');
const siteNameEl = document.getElementById('siteName');
const siteMessageEl = document.getElementById('siteMessage');

let blockedKeysByHost = {};
let blockedKeys = DEFAULT_BLOCKED_KEYS.slice();
let currentSiteContext = { hostKey: null, protocol: null, canEdit: false };

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

function getSiteContext(url) {
  try {
    const { hostname, protocol } = new URL(url);
    const hostKey = getBaseHost(hostname);
    const canEdit = SUPPORTED_PROTOCOLS.has(protocol) && !!hostKey;
    return { hostKey, protocol, canEdit };
  } catch (error) {
    return { hostKey: null, protocol: null, canEdit: false };
  }
}

function canEditCurrentSite() {
  return !!currentSiteContext && currentSiteContext.canEdit;
}

function deriveKeysForCurrentHost(map = {}, legacyList = DEFAULT_BLOCKED_KEYS) {
  if (!canEditCurrentSite()) {
    return [];
  }
  const hostKey = currentSiteContext.hostKey;
  if (hostKey && map[hostKey]) {
    return normalizeList(map[hostKey]);
  }
  return normalizeList(legacyList);
}

function renderKeys(keys) {
  keyListEl.innerHTML = '';
  if (!keys.length) {
    const emptyItem = document.createElement('li');
    emptyItem.className = 'key-list__empty';
    emptyItem.textContent = canEditCurrentSite() ? 'No keys blocked yet.' : 'Not available for this site.';
    keyListEl.appendChild(emptyItem);
    return;
  }

  keys.forEach((key) => {
    const li = document.createElement('li');
    li.className = 'key-list__item';

    const label = document.createElement('span');
    label.textContent = key;

    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.className = 'remove-btn';
    removeBtn.textContent = '×';
    removeBtn.title = `Unblock ${key}`;
    removeBtn.addEventListener('click', () => removeKey(key));

    li.appendChild(label);
    li.appendChild(removeBtn);
    keyListEl.appendChild(li);
  });
}

function setFormEnabled(enabled) {
  keyInput.disabled = !enabled;
  addKeyButton.disabled = !enabled;
  if (!enabled) {
    keyInput.value = '';
  }
}

function updateSiteMessage() {
  if (canEditCurrentSite()) {
    siteNameEl.textContent = currentSiteContext.hostKey;
    siteMessageEl.textContent = 'Keys saved and applied only on this site.';
    siteMessageEl.classList.remove('site-message--warning');
    setFormEnabled(true);
  } else {
    siteNameEl.textContent = currentSiteContext.hostKey || 'Unavailable';
    siteMessageEl.textContent = 'Open an HTTP(S) site with a valid domain to manage blocked keys.';
    siteMessageEl.classList.add('site-message--warning');
    setFormEnabled(false);
  }
}

function saveKeysForCurrentHost(keys) {
  if (!canEditCurrentSite()) {
    return;
  }
  blockedKeys = keys;
  blockedKeysByHost = { ...blockedKeysByHost, [currentSiteContext.hostKey]: blockedKeys };
  renderKeys(blockedKeys);
  chrome.storage.sync.set({ blockedKeysByHost });
}

function addKey(rawKey) {
  if (!canEditCurrentSite()) {
    return;
  }
  const key = normalizeKey(rawKey);
  if (!key || blockedKeys.includes(key)) {
    return;
  }
  saveKeysForCurrentHost([...blockedKeys, key]);
}

function removeKey(key) {
  if (!canEditCurrentSite()) {
    return;
  }
  saveKeysForCurrentHost(blockedKeys.filter((k) => k !== key));
}

function loadBlockedKeys() {
  chrome.storage.sync.get({ blockedKeysByHost: {}, blockedKeys: DEFAULT_BLOCKED_KEYS }, (data) => {
    blockedKeysByHost = data.blockedKeysByHost || {};
    blockedKeys = deriveKeysForCurrentHost(blockedKeysByHost, data.blockedKeys);
    updateSiteMessage();
    renderKeys(blockedKeys);
  });
}

addKeyForm.addEventListener('submit', (event) => {
  event.preventDefault();
  addKey(keyInput.value);
  keyInput.value = '';
  keyInput.focus();
});

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== 'sync') {
    return;
  }

  if (changes.blockedKeysByHost) {
    blockedKeysByHost = changes.blockedKeysByHost.newValue || {};
    if (canEditCurrentSite()) {
      blockedKeys = deriveKeysForCurrentHost(blockedKeysByHost, DEFAULT_BLOCKED_KEYS);
      renderKeys(blockedKeys);
    }
    return;
  }

  if (changes.blockedKeys) {
    if (canEditCurrentSite()) {
      blockedKeys = deriveKeysForCurrentHost(blockedKeysByHost, changes.blockedKeys.newValue || DEFAULT_BLOCKED_KEYS);
      renderKeys(blockedKeys);
    }
  }
});

chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
  if (chrome.runtime.lastError) {
    currentSiteContext = { hostKey: null, protocol: null, canEdit: false };
    updateSiteMessage();
    renderKeys([]);
    return;
  }

  const activeTab = tabs && tabs[0];
  currentSiteContext = activeTab ? getSiteContext(activeTab.url) : { hostKey: null, protocol: null, canEdit: false };
  updateSiteMessage();
  loadBlockedKeys();
});

(() => {
  const EXT_SOURCE = 'shortcut-blocker-ext';
  const PAGE_SOURCE = 'shortcut-blocker-page';
  const MSG_UPDATE_KEYS = 'SB_UPDATE_KEYS';
  const MSG_BRIDGE_READY = 'SB_BRIDGE_READY';
  const KEY_EVENTS = new Set(['keydown', 'keypress']);

  if (window.__shortcutBlockerPageInjected) {
    return;
  }
  window.__shortcutBlockerPageInjected = true;

  let blockedKeys = new Set();
  const listenerStore = new WeakMap();
  const onPropStore = new WeakMap();

  function isExtensionStack() {
    try {
      const stack = new Error().stack;
      if (!stack) {
        return false;
      }

      const frames = stack.split('\n').slice(1);
      let hasPageFrame = false;
      for (const frame of frames) {
        if (frame.includes('chrome-extension://')) {
          continue;
        }
        if (frame.includes('http://') || frame.includes('https://')) {
          hasPageFrame = true;
          break;
        }
      }

      return !hasPageFrame;
    } catch (error) {
      return false;
    }
  }

  function normalizeKey(key) {
    return typeof key === 'string' ? key.trim().toLowerCase() : '';
  }

  function hasModifier(event) {
    return event.ctrlKey || event.metaKey || event.altKey;
  }

  function isEditableTarget(target) {
    if (!target) {
      return false;
    }

    if (target.isContentEditable) {
      return true;
    }

    const tag = target.tagName;
    if (!tag) {
      return false;
    }

    return tag === 'INPUT' || tag === 'TEXTAREA';
  }

  function shouldBlock(event) {
    if (!event || !event.isTrusted || hasModifier(event) || isEditableTarget(event.target)) {
      return false;
    }

    return blockedKeys.has(normalizeKey(event.key));
  }

  function blockEvent(event) {
    if (event.cancelable && !event.defaultPrevented) {
      event.preventDefault();
    }
  }

  function isPassive(options) {
    if (options && typeof options === 'object') {
      return !!options.passive;
    }
    return false;
  }

  function optionsKey(options) {
    if (options === undefined) {
      return 'false|false|false';
    }

    if (typeof options === 'boolean') {
      return `${options}|false|false`;
    }

    const capture = !!options.capture;
    const once = !!options.once;
    const passive = !!options.passive;
    return `${capture}|${once}|${passive}`;
  }

  function makeStoreKey(type, options) {
    return `${type}|${optionsKey(options)}`;
  }

  function getWrappedListener(listener, type, options, create) {
    if (typeof listener === 'object' && typeof listener.handleEvent === 'function') {
      return getWrappedHandleEvent(listener, type, options, create);
    }

    if (typeof listener !== 'function') {
      return listener;
    }

    let store = listenerStore.get(listener);
    if (!store) {
      if (!create) {
        return null;
      }
      store = new Map();
      listenerStore.set(listener, store);
    }

    const key = makeStoreKey(type, options);
    if (store.has(key)) {
      return store.get(key);
    }

    if (!create) {
      return null;
    }

    const passive = isPassive(options);

    const wrapped = function wrappedListener(event) {
      if (shouldBlock(event)) {
        if (!passive) {
          blockEvent(event);
        }
        return;
      }
      return listener.call(this, event);
    };

    store.set(key, wrapped);
    return wrapped;
  }

  function getWrappedHandleEvent(listener, type, options, create) {
    let store = listenerStore.get(listener);
    if (!store) {
      if (!create) {
        return null;
      }
      store = new Map();
      listenerStore.set(listener, store);
    }

    const key = makeStoreKey(type, options);
    if (store.has(key)) {
      return store.get(key);
    }

    if (!create) {
      return null;
    }

    const passive = isPassive(options);

    const wrapped = function wrappedHandleEvent(event) {
      if (shouldBlock(event)) {
        if (!passive) {
          blockEvent(event);
        }
        return;
      }
      return listener.handleEvent.call(listener, event);
    };

    store.set(key, wrapped);
    return wrapped;
  }

  const originalAdd = EventTarget.prototype.addEventListener;
  const originalRemove = EventTarget.prototype.removeEventListener;

  EventTarget.prototype.addEventListener = function patchedAdd(type, listener, options) {
    if (!KEY_EVENTS.has(type) || !listener || isExtensionStack()) {
      return originalAdd.call(this, type, listener, options);
    }

    const wrapped = getWrappedListener(listener, type, options, true);
    return originalAdd.call(this, type, wrapped, options);
  };

  EventTarget.prototype.removeEventListener = function patchedRemove(type, listener, options) {
    if (!KEY_EVENTS.has(type) || !listener) {
      return originalRemove.call(this, type, listener, options);
    }

    const wrapped = getWrappedListener(listener, type, options, false);
    if (wrapped) {
      return originalRemove.call(this, type, wrapped, options);
    }

    return originalRemove.call(this, type, listener, options);
  };

  function patchOnProp(proto, prop) {
    const descriptor = Object.getOwnPropertyDescriptor(proto, prop);
    if (!descriptor || !descriptor.configurable) {
      return;
    }

    Object.defineProperty(proto, prop, {
      configurable: true,
      enumerable: descriptor.enumerable,
      get() {
        const store = onPropStore.get(this);
        if (store && store[prop]) {
          return store[prop];
        }
        return descriptor.get ? descriptor.get.call(this) : null;
      },
      set(handler) {
        if (typeof handler !== 'function') {
          const store = onPropStore.get(this);
          if (store) {
            delete store[prop];
          }
          return descriptor.set ? descriptor.set.call(this, handler) : undefined;
        }

        if (isExtensionStack()) {
          return descriptor.set ? descriptor.set.call(this, handler) : undefined;
        }

        let store = onPropStore.get(this);
        if (!store) {
          store = {};
          onPropStore.set(this, store);
        }
        store[prop] = handler;

        const wrapped = function wrappedOnProp(event) {
          if (shouldBlock(event)) {
            blockEvent(event);
            return;
          }
          return handler.call(this, event);
        };

        return descriptor.set ? descriptor.set.call(this, wrapped) : undefined;
      },
    });
  }

  ['onkeydown', 'onkeypress'].forEach((prop) => {
    [Window.prototype, Document.prototype, HTMLElement.prototype].forEach((proto) => {
      patchOnProp(proto, prop);
    });
  });

  function updateBlockedKeys(keys) {
    blockedKeys = new Set((keys || []).map(normalizeKey).filter(Boolean));
  }

  window.addEventListener('message', (event) => {
    if (event.source !== window || !event.data || event.data.source !== EXT_SOURCE) {
      return;
    }

    if (event.data.type === MSG_UPDATE_KEYS) {
      updateBlockedKeys(event.data.payload || []);
    }
  });

  window.postMessage(
    {
      source: PAGE_SOURCE,
      type: MSG_BRIDGE_READY,
    },
    '*'
  );
})();

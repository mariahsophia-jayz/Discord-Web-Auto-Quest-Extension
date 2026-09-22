'use strict';

const CYCLE = 'orbit/cycle.js';
const DEFAULTS = { auto: true, pace: 'swift' };

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.get(DEFAULTS, (cur) => {
    chrome.storage.local.set({
      auto: cur.auto !== false,
      pace: cur.pace === 'calm' ? 'calm' : 'swift'
    });
  });
});

chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  if (!msg || typeof msg !== 'object') return false;

  if (msg.op === 'meta') {
    const man = chrome.runtime.getManifest();
    reply({ ok: true, v: man.version, n: man.short_name || man.name });
    return false;
  }

  if (msg.op === 'prefs.get') {
    chrome.storage.local.get(DEFAULTS, (v) => reply({ ok: true, ...v }));
    return true;
  }

  if (msg.op === 'prefs.set') {
    const next = {};
    if (typeof msg.auto === 'boolean') next.auto = msg.auto;
    if (msg.pace === 'calm' || msg.pace === 'swift') next.pace = msg.pace;
    chrome.storage.local.set(next, () => reply({ ok: true, ...next }));
    return true;
  }

  if (msg.op === 'ignite') {
    const tabId = sender.tab && sender.tab.id;
    if (!tabId) {
      reply({ ok: false, err: 'no-tab' });
      return false;
    }

    const pace = msg.pace === 'calm' ? 'calm' : 'swift';
    chrome.scripting
      .executeScript({
        target: { tabId },
        world: 'MAIN',
        func: (p) => {
          try {
            Object.defineProperty(window, '__lnrPace', {
              value: p,
              configurable: true,
              writable: true
            });
          } catch {
            window.__lnrPace = p;
          }
        },
        args: [pace]
      })
      .then(() =>
        chrome.scripting.executeScript({
          target: { tabId },
          world: 'MAIN',
          files: [CYCLE]
        })
      )
      .then(() => reply({ ok: true }))
      .catch((err) => reply({ ok: false, err: String(err && err.message ? err.message : err) }));
    return true;
  }

  return false;
});

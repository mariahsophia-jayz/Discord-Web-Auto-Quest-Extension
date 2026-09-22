'use strict';

const autoEl = document.getElementById('auto');
const swiftEl = document.getElementById('swift');
const calmEl = document.getElementById('calm');
const noteEl = document.getElementById('note');
const verEl = document.getElementById('ver');

function paint(pace) {
  swiftEl.dataset.on = pace === 'swift' ? '1' : '0';
  calmEl.dataset.on = pace === 'calm' ? '1' : '0';
  noteEl.textContent = pace === 'swift'
    ? 'Swift runs every quest in parallel with tighter intervals.'
    : 'Calm uses wider gaps. Still reports progress as a percentage.';
}

chrome.runtime.sendMessage({ op: 'meta' }, (res) => {
  if (res && res.v) verEl.textContent = `v${res.v}`;
});

chrome.runtime.sendMessage({ op: 'prefs.get' }, (res) => {
  if (!res) return;
  autoEl.checked = res.auto !== false;
  paint(res.pace === 'calm' ? 'calm' : 'swift');
});

autoEl.addEventListener('change', () => {
  chrome.runtime.sendMessage({ op: 'prefs.set', auto: autoEl.checked });
});

swiftEl.addEventListener('click', () => {
  paint('swift');
  chrome.runtime.sendMessage({ op: 'prefs.set', pace: 'swift' });
});

calmEl.addEventListener('click', () => {
  paint('calm');
  chrome.runtime.sendMessage({ op: 'prefs.set', pace: 'calm' });
});

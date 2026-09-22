(function () {
  'use strict';

  const PAGE = /\/quest-home(?:\/|$|\?)/;
  const COMPACT_Q = '(max-width: 480px), (pointer: coarse)';
  const Kit = () => window.LunarisKit;
  const orbUrl = () => chrome.runtime.getURL('media/orb.png');
  const mq = typeof window.matchMedia === 'function'
    ? window.matchMedia(COMPACT_Q)
    : { matches: false };

  let mounted = null;
  let cache = new Map();
  let running = false;
  let overall = 0;
  let pace = 'swift';
  let auto = true;
  let ignited = false;

  function onQuestPage() {
    return PAGE.test(location.pathname);
  }

  function kindLabel(kind) {
    if (kind === 'video') return 'Watch';
    if (kind === 'stream') return 'Stream';
    if (kind === 'activity') return 'Activity';
    if (kind === 'play') return 'Play';
    return 'Quest';
  }

  function avgPct() {
    if (cache.size === 0) return 0;
    let sum = 0;
    cache.forEach((q) => { sum += q.pct || 0; });
    return Math.round(sum / cache.size);
  }

  function setBadge(ui, tone, label) {
    ui.badge.dataset.tone = tone;
    ui.badge.textContent = label;
  }

  function renderList(ui) {
    const list = ui.list;
    list.textContent = '';
    if (cache.size === 0) {
      list.appendChild(Kit().el('div', { class: 'lnr-empty', text: 'No active quests yet. Accept one, then ignite.' }));
      return;
    }
    cache.forEach((q) => {
      const r = Kit().ring(42, 3.5);
      r.setInstant(q.pct || 0);
      r.set(q.pct || 0);
      const row = Kit().el('div', { class: 'lnr-row', dataset: { done: q.done ? '1' : '0' } }, [
        r,
        Kit().el('div', { class: 'lnr-row-copy' }, [
          Kit().el('div', { class: 'lnr-row-name', text: q.name, title: q.name }),
          Kit().el('div', { class: 'lnr-row-meta', text: kindLabel(q.kind) })
        ]),
        Kit().el('div', { class: 'lnr-pct', text: q.done ? '100%' : `${Math.round(q.pct || 0)}%` })
      ]);
      list.appendChild(row);
    });
  }

  function applyOverall(ui) {
    overall = avgPct();
    if (ui.fabRing) ui.fabRing.set(overall);
    ui.statLine.textContent = cache.size ? `${overall}% across ${cache.size}` : 'waiting';
  }

  function build() {
    const K = Kit();
    const { wrap, shadow } = K.host();
    const root = K.el('div', { class: 'lnr-root' });
    const dock = K.el('div', { class: 'lnr-dock' });

    const canvas = K.el('canvas');
    const hero = K.el('div', { class: 'lnr-hero' }, [
      canvas,
      K.el('div', { class: 'lnr-hero-copy' }, [
        K.el('div', { class: 'lnr-kicker', text: 'lunaris-auto' }),
        K.el('div', { class: 'lnr-title', text: 'Quest flow' }),
        K.el('div', { class: 'lnr-sub', text: 'Progress as percentage · parallel · quiet' })
      ])
    ]);

    const badge = K.el('div', { class: 'lnr-badge', dataset: { tone: 'idle' }, text: 'Idle' });
    const statLine = K.el('span', { text: 'waiting' });
    const status = K.el('div', { class: 'lnr-status' }, [
      K.el('div', {}, [
        K.el('b', { text: 'Status' }),
        K.el('div', {}, [statLine])
      ]),
      badge
    ]);

    const list = K.el('div', { class: 'lnr-list' });
    const ignite = K.el('button', { class: 'lnr-btn', type: 'button', dataset: { kind: 'primary' }, text: 'Ignite' });
    const hide = K.el('button', { class: 'lnr-btn', type: 'button', dataset: { kind: 'ghost' }, text: 'Hide' });
    const actions = K.el('div', { class: 'lnr-actions' }, [ignite, hide]);
    const hint = K.el('div', { class: 'lnr-hint', text: 'Runs every eligible quest at once. Values show percent complete.' });

    const panel = K.el('div', { class: 'lnr-panel', dataset: { closed: mq.matches ? '1' : '0' } }, [
      hero,
      K.el('div', { class: 'lnr-body' }, [status, list, actions, hint])
    ]);

    const fabRing = K.fabRing(64);
    const pulse = K.el('div', { class: 'lnr-pulse' });
    const fab = K.el('button', {
      class: 'lnr-fab',
      type: 'button',
      title: 'lunaris-Auto',
      'aria-label': 'lunaris-Auto quests',
      'aria-expanded': String(!mq.matches)
    }, [pulse, fabRing]);

    dock.appendChild(panel);
    dock.appendChild(fab);
    root.appendChild(dock);
    shadow.appendChild(root);

    const ui = { wrap, shadow, root, panel, list, badge, statLine, ignite, hide, fab, fabRing, moon: null, orb: null, canvas, stars: null, stylesReady: false, open: !mq.matches };

    fab.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      ui.open = !ui.open;
      panel.dataset.closed = ui.open ? '0' : '1';
      fab.setAttribute('aria-expanded', String(ui.open));
    });

    hide.addEventListener('click', (e) => {
      e.preventDefault();
      ui.open = false;
      panel.dataset.closed = '1';
      fab.setAttribute('aria-expanded', 'false');
    });

    ignite.addEventListener('click', (e) => {
      e.preventDefault();
      launch(ui);
    });

    applyMode(ui, mq.matches);

    return ui;
  }

  // Compact mode = phone/small viewport/coarse pointer: CSS moon instead of
  // orb.png, no starfield canvas, panel closed until tapped so it never
  // covers the quest list. Full mode keeps the orb and stars.
  function applyMode(ui, compact) {
    const K = Kit();
    ui.root.dataset.mode = compact ? 'compact' : 'full';
    if (compact) {
      if (!ui.moon) ui.moon = K.el('span', { class: 'lnr-moon-dot' });
      if (!ui.moon.parentNode) ui.fab.appendChild(ui.moon);
      if (ui.orb && ui.orb.parentNode) ui.orb.parentNode.removeChild(ui.orb);
      if (ui.stars) {
        ui.stars.stop();
        ui.stars = null;
      }
      if (ui.open) {
        ui.open = false;
        ui.panel.dataset.closed = '1';
        ui.fab.setAttribute('aria-expanded', 'false');
      }
    } else {
      if (!ui.orb) ui.orb = K.el('img', { src: orbUrl(), alt: '' });
      if (!ui.orb.parentNode) ui.fab.appendChild(ui.orb);
      if (ui.moon && ui.moon.parentNode) ui.moon.parentNode.removeChild(ui.moon);
      if (ui.stylesReady && !ui.stars) ui.stars = K.starfield(ui.canvas);
    }
  }

  function launch(ui) {
    if (running) return;
    if (typeof chrome === 'undefined' || !chrome.runtime) {
      setBadge(ui, 'bad', 'Error');
      ui.statLine.textContent = 'runtime missing';
      return;
    }
    running = true;
    ignited = true;
    ui.ignite.disabled = true;
    ui.ignite.textContent = 'Flowing';
    setBadge(ui, 'run', 'Live');
    chrome.runtime.sendMessage({ op: 'ignite', pace }, (res) => {
      if (chrome.runtime.lastError || !res || !res.ok) {
        running = false;
        ignited = false;
        ui.ignite.disabled = false;
        ui.ignite.textContent = 'Ignite';
        setBadge(ui, 'bad', 'Error');
        ui.statLine.textContent = 'could not start';
      }
    });
  }

  function onBus(data) {
    if (!mounted || !data || data.k !== 'lnr') return;
    if (data.t === 'list') {
      cache = new Map();
      (data.d || []).forEach((q) => cache.set(q.id, q));
      renderList(mounted);
      applyOverall(mounted);
      if (cache.size === 0) {
        setBadge(mounted, 'idle', 'Empty');
        mounted.ignite.disabled = false;
        mounted.ignite.textContent = 'Ignite';
        running = false;
      } else {
        setBadge(mounted, 'run', 'Live');
      }
    } else if (data.t === 'tick') {
      const q = data.d;
      if (!q) return;
      cache.set(q.id, q);
      renderList(mounted);
      applyOverall(mounted);
      if (q.done && [...cache.values()].every((x) => x.done)) {
        setBadge(mounted, 'ok', 'Done');
        mounted.ignite.disabled = false;
        mounted.ignite.textContent = 'Ignite';
        running = false;
      }
    } else if (data.t === 'idle') {
      setBadge(mounted, 'idle', 'Idle');
      mounted.statLine.textContent = (data.d && data.d.reason) || 'idle';
      mounted.ignite.disabled = false;
      mounted.ignite.textContent = 'Ignite';
      running = false;
    } else if (data.t === 'end') {
      setBadge(mounted, 'ok', 'Done');
      mounted.ignite.disabled = false;
      mounted.ignite.textContent = 'Ignite';
      running = false;
    }
  }

  function attach() {
    if (mounted) return;
    const ui = build();
    mounted = ui;
    Kit().injectStyles(ui.shadow, 'surface/kit.css').then(() => {
      if (mounted !== ui) return;
      ui.stylesReady = true;
      applyMode(ui, mq.matches);
    });
    document.documentElement.appendChild(ui.wrap);
    renderList(ui);
    applyOverall(ui);

    if (auto && !ignited) {
      setTimeout(() => launch(ui), 700);
    }
  }

  function detach() {
    if (!mounted) return;
    if (mounted.stars) mounted.stars.stop();
    if (mounted.wrap && mounted.wrap.parentNode) mounted.wrap.parentNode.removeChild(mounted.wrap);
    mounted = null;
    running = false;
    ignited = false;
  }

  function sync() {
    if (onQuestPage()) attach();
    else detach();
  }

  window.addEventListener('message', (ev) => {
    if (ev.source !== window || !ev.data) return;
    onBus(ev.data);
  });

  // React to rotation / window resize crossing the compact threshold.
  const onCompactChange = (e) => {
    if (mounted) applyMode(mounted, !!e.matches);
  };
  if (typeof mq.addEventListener === 'function') mq.addEventListener('change', onCompactChange);
  else if (typeof mq.addListener === 'function') mq.addListener(onCompactChange);

  function watchNav() {
    let last = location.href;
    const ping = () => {
      if (location.href !== last) {
        last = location.href;
        sync();
      }
    };
    const wrap = (fn) => function () {
      const ret = fn.apply(this, arguments);
      queueMicrotask(ping);
      return ret;
    };
    try {
      history.pushState = wrap(history.pushState);
      history.replaceState = wrap(history.replaceState);
    } catch {
      /* ignore */
    }
    window.addEventListener('popstate', ping);
    let to = 0;
    new MutationObserver(() => {
      clearTimeout(to);
      to = setTimeout(ping, 180);
    }).observe(document.documentElement, { childList: true, subtree: true });
  }

  function boot() {
    chrome.runtime.sendMessage({ op: 'prefs.get' }, (res) => {
      if (res && res.ok) {
        auto = res.auto !== false;
        pace = res.pace === 'calm' ? 'calm' : 'swift';
      }
      sync();
      watchNav();
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();

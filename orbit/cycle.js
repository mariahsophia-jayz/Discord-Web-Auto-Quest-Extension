(function () {
  'use strict';

  if (window.__lnrLock) {
    emit('idle', { reason: 'already flowing' });
    return;
  }
  window.__lnrLock = 1;

  const TASKS = ['PLAY_ON_DESKTOP', 'STREAM_ON_DESKTOP', 'PLAY_ACTIVITY', 'WATCH_VIDEO', 'WATCH_VIDEO_ON_MOBILE'];
  const pace = window.__lnrPace === 'calm' ? 'calm' : 'swift';
  try { delete window.__lnrPace; } catch { window.__lnrPace = undefined; }

  const SWIFT = {
    videoStep: [12, 22],
    videoWait: [160, 380],
    beatWait: [9000, 14000],
    jitter: [40, 180]
  };
  const CALM = {
    videoStep: [6, 12],
    videoWait: [420, 900],
    beatWait: [16000, 21000],
    jitter: [80, 260]
  };
  const CFG = pace === 'calm' ? CALM : SWIFT;

  function rand(a, b) {
    return a + Math.random() * (b - a);
  }
  function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }
  function pct(progress, target) {
    if (!target) return 0;
    return Math.max(0, Math.min(100, Math.round((progress / target) * 100)));
  }
  function emit(t, d) {
    try {
      window.postMessage({ k: 'lnr', t, d }, '*');
    } catch {
      /* ignore */
    }
  }
  function kindOf(task) {
    if (task.startsWith('WATCH_VIDEO')) return 'video';
    if (task === 'STREAM_ON_DESKTOP') return 'stream';
    if (task === 'PLAY_ACTIVITY') return 'activity';
    return 'play';
  }
  function snapshot(state) {
    return {
      id: state.quest.id,
      name: state.questName,
      pct: pct(state.currentProgress, state.needed),
      done: !!state.completed,
      kind: kindOf(state.taskType)
    };
  }

  function waitForWebpack(cb) {
    let n = 0;
    const max = 160;
    const tick = () => {
      if (n++ > max) {
        emit('idle', { reason: 'client not ready' });
        window.__lnrLock = 0;
        return;
      }
      if (typeof window.webpackChunkdiscord_app === 'undefined') {
        setTimeout(tick, 80);
        return;
      }
      try {
        const jq = window.$;
        try { delete window.$; } catch { /* ignore */ }
        const req = window.webpackChunkdiscord_app.push([[Symbol()], {}, (r) => r]);
        window.webpackChunkdiscord_app.pop();
        if (jq) window.$ = jq;
        if (!req || !req.c || Object.keys(req.c).length < 12) {
          setTimeout(tick, 80);
          return;
        }
        cb(req);
      } catch {
        setTimeout(tick, 80);
      }
    };
    tick();
  }

  function candidates(exports) {
    if (!exports) return [];
    return [exports, exports.Z, exports.ZP, exports.Ay, exports.A, exports.default, exports.tn, exports.Bo].filter(Boolean);
  }

  function findModule(req, pred) {
    for (const mod of Object.values(req.c)) {
      for (const cand of candidates(mod && mod.exports)) {
        try {
          if (pred(cand)) return cand;
        } catch {
          /* ignore */
        }
      }
    }
    return null;
  }

  function loadStores(req) {
    const QuestsStore = findModule(req, (m) => m && m.__proto__ && typeof m.__proto__.getQuest === 'function');
    const ChannelStore = findModule(req, (m) => m && m.__proto__ && typeof m.__proto__.getAllThreadsForParent === 'function');
    const GuildChannelStore = findModule(req, (m) => m && typeof m.getSFWDefaultChannel === 'function');
    const RunningGameStore = findModule(req, (m) => m && typeof m.getRunningGames === 'function' && typeof m.getGameForPID === 'function');
    const FluxDispatcher = findModule(req, (m) => m && m.__proto__ && typeof m.__proto__.flushWaitQueue === 'function');
    const StreamStore = findModule(req, (m) => m && typeof m.getStreamerActiveStreamMetadata === 'function');
    const apiWrap = findModule(req, (m) => m && (typeof m.get === 'function') && (typeof m.post === 'function') && (typeof m.put === 'function'));
    const api = apiWrap || findModule(req, (m) => m && m.get && m.post);

    if (!QuestsStore || !api) return null;
    return { QuestsStore, ChannelStore, GuildChannelStore, RunningGameStore, FluxDispatcher, StreamStore, api };
  }

  function getActiveQuests(QuestsStore) {
    const list = [];
    const src = QuestsStore.quests;
    const values = src && typeof src.values === 'function' ? [...src.values()] : Object.values(src || {});
    for (const quest of values) {
      try {
        const expired = new Date(quest.config.expiresAt).getTime() <= Date.now();
        const completed = !!quest.userStatus?.completedAt;
        const enrolled = !!quest.userStatus?.enrolledAt;
        const taskConfig = quest.config.taskConfig ?? quest.config.taskConfigV2;
        const tasks = taskConfig && taskConfig.tasks;
        if (!tasks || !enrolled || completed || expired) continue;
        const taskType = TASKS.find((t) => tasks[t] != null);
        if (!taskType) continue;
        list.push(quest);
      } catch {
        /* ignore */
      }
    }
    return list;
  }

  function initializeQuestState(quest) {
    const taskConfig = quest.config.taskConfig ?? quest.config.taskConfigV2;
    const taskType = TASKS.find((t) => taskConfig.tasks[t] != null);
    const taskData = taskConfig.tasks[taskType];
    const needed = taskData?.target ?? 0;
    const currentProgress = quest.userStatus?.progress?.[taskType]?.value ?? quest.userStatus?.streamProgressSeconds ?? 0;
    return {
      quest,
      taskType,
      needed,
      currentProgress,
      completed: currentProgress >= needed && needed > 0,
      enrolledAt: new Date(quest.userStatus.enrolledAt).getTime(),
      questName: quest.config.messages?.questName || quest.config.application?.name || 'Quest'
    };
  }

  function pickChannelId(stores) {
    try {
      const priv = stores.ChannelStore?.getSortedPrivateChannels?.();
      if (priv && priv[0]?.id) return priv[0].id;
    } catch { /* ignore */ }
    try {
      const guilds = Object.values(stores.GuildChannelStore?.getAllGuilds?.() || {});
      for (const g of guilds) {
        if (g?.VOCAL?.length) return g.VOCAL[0].channel.id;
      }
    } catch { /* ignore */ }
    return null;
  }

  function spoofGame(stores, quest) {
    const rgs = stores.RunningGameStore;
    const flux = stores.FluxDispatcher;
    if (!rgs || !flux) return () => {};
    const app = quest.config.application || {};
    const pid = Math.floor(rand(1200, 28000));
    const exe = (app.name || 'game').replace(/\s+/g, '') + '.exe';
    const fake = {
      cmdLine: `C:\\Program Files\\${app.name || 'Game'}\\${exe}`,
      exeName: exe,
      exePath: `C:\\Program Files\\${app.name || 'Game'}\\${exe}`,
      hidden: false,
      isLauncher: false,
      id: app.id,
      name: app.name || 'Game',
      pid,
      pidPath: [pid],
      processName: app.name || 'Game',
      start: Date.now()
    };
    const realGames = rgs.getRunningGames();
    const realGetRunningGames = rgs.getRunningGames;
    const realGetGameForPID = rgs.getGameForPID;
    const fakeGames = [fake];
    rgs.getRunningGames = () => fakeGames;
    rgs.getGameForPID = (p) => fakeGames.find((g) => g.pid === p) || null;
    try {
      flux.dispatch({ type: 'RUNNING_GAMES_CHANGE', added: fakeGames, removed: realGames, games: fakeGames });
    } catch { /* ignore */ }
    return () => {
      rgs.getRunningGames = realGetRunningGames;
      rgs.getGameForPID = realGetGameForPID;
      try {
        flux.dispatch({ type: 'RUNNING_GAMES_CHANGE', added: [], removed: fakeGames, games: realGetRunningGames() });
      } catch { /* ignore */ }
    };
  }

  async function processVideo(state, api) {
    const { quest, needed } = state;
    const enrolled = state.enrolledAt || Date.now();
    const speed = pace === 'calm' ? rand(8, 12) : rand(14, 22);
    let first = true;
    while (!state.completed) {
      if (!first) await sleep(rand(CFG.videoWait[0], CFG.videoWait[1]));
      first = false;
      const elapsed = (Date.now() - enrolled) / 1000;
      const stepped = state.currentProgress + rand(CFG.videoStep[0], CFG.videoStep[1]);
      const boosted = elapsed * speed;
      const next = Math.min(needed, Math.max(stepped, boosted, state.currentProgress + 1));
      try {
        const res = await api.post({ url: `/quests/${quest.id}/video-progress`, body: { timestamp: next } });
        state.currentProgress = Math.max(next, res?.body?.progress?.WATCH_VIDEO?.value || res?.body?.progress?.WATCH_VIDEO_ON_MOBILE?.value || next);
        const done = res?.body?.completed_at != null || state.currentProgress >= needed;
        if (done) {
          state.currentProgress = needed;
          state.completed = true;
          try { await api.post({ url: `/quests/${quest.id}/video-progress`, body: { timestamp: needed } }); } catch { /* ignore */ }
        }
        emit('tick', snapshot(state));
      } catch {
        await sleep(rand(400, 900));
      }
    }
  }

  async function processHeartbeat(state, stores) {
    const { api } = stores;
    const { quest, taskType, needed } = state;
    let restore = () => {};
    if (taskType === 'PLAY_ON_DESKTOP' || taskType === 'PLAY_ACTIVITY') {
      restore = spoofGame(stores, quest);
    }
    const channelId = pickChannelId(stores);
    let streamKey = `call:${channelId || quest.id}:1`;
    try {
      const meta = stores.StreamStore?.getStreamerActiveStreamMetadata?.();
      if (meta && (meta.channel_id || meta.channelId)) {
        streamKey = `call:${meta.channel_id || meta.channelId}:1`;
      }
    } catch { /* ignore */ }

    try {
      let first = true;
      while (!state.completed) {
        if (!first) await sleep(rand(CFG.beatWait[0], CFG.beatWait[1]));
        first = false;
        await sleep(rand(CFG.jitter[0], CFG.jitter[1]));
        try {
          const response = await api.post({
            url: `/quests/${quest.id}/heartbeat`,
            body: { stream_key: streamKey, terminal: false }
          });
          const server = response?.body?.progress?.[taskType]?.value;
          if (typeof server === 'number') state.currentProgress = server;
          else state.currentProgress = Math.min(needed, state.currentProgress + rand(18, 32));
          if (state.currentProgress >= needed) {
            try {
              await api.post({ url: `/quests/${quest.id}/heartbeat`, body: { stream_key: streamKey, terminal: true } });
            } catch { /* ignore */ }
            state.currentProgress = needed;
            state.completed = true;
          }
          emit('tick', snapshot(state));
        } catch {
          await sleep(rand(800, 1600));
        }
      }
    } finally {
      try { restore(); } catch { /* ignore */ }
    }
  }

  async function runOne(state, stores) {
    if (state.completed) {
      emit('tick', snapshot(state));
      return;
    }
    if (state.taskType.startsWith('WATCH_VIDEO')) await processVideo(state, stores.api);
    else await processHeartbeat(state, stores);
  }

  async function run(req) {
    try {
      const stores = loadStores(req);
      if (!stores) {
        emit('idle', { reason: 'modules missing' });
        return;
      }
      const active = getActiveQuests(stores.QuestsStore);
      if (!active.length) {
        emit('idle', { reason: 'no active quests' });
        emit('list', []);
        return;
      }
      const states = active.map(initializeQuestState);
      emit('list', states.map(snapshot));
      await Promise.all(states.map((s) => runOne(s, stores)));
      emit('end', { ok: true });
    } catch {
      emit('idle', { reason: 'stopped' });
    } finally {
      window.__lnrLock = 0;
    }
  }

  waitForWebpack(run);
})();

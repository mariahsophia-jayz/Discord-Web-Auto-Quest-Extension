(function (global) {
  'use strict';

  const TAU = Math.PI * 2;
  const EASE = {
    out: (t) => 1 - Math.pow(1 - t, 3),
    luna: (t) => 1 - Math.pow(1 - t, 4)
  };

  function el(tag, props, kids) {
    const node = document.createElement(tag);
    if (props) {
      for (const key of Object.keys(props)) {
        const val = props[key];
        if (val == null || val === false) continue;
        if (key === 'class') node.className = val;
        else if (key === 'style' && typeof val === 'object') Object.assign(node.style, val);
        else if (key === 'on' && typeof val === 'object') {
          for (const ev of Object.keys(val)) node.addEventListener(ev, val[ev]);
        } else if (key === 'dataset' && typeof val === 'object') {
          for (const d of Object.keys(val)) node.dataset[d] = String(val[d]);
        } else if (key === 'text') node.textContent = val;
        else if (key === 'html') node.innerHTML = val;
        else if (key.startsWith('aria') || key === 'role' || key === 'id' || key === 'src' || key === 'alt' || key === 'title' || key === 'type' || key === 'disabled') {
          node.setAttribute(key === 'disabled' ? 'disabled' : key, val === true ? '' : val);
        } else node.setAttribute(key, val);
      }
    }
    if (kids != null) {
      const list = Array.isArray(kids) ? kids : [kids];
      for (const child of list) {
        if (child == null || child === false) continue;
        node.appendChild(typeof child === 'string' ? document.createTextNode(child) : child);
      }
    }
    return node;
  }

  function svgEl(tag, attrs, kids) {
    const node = document.createElementNS('http://www.w3.org/2000/svg', tag);
    if (attrs) {
      for (const key of Object.keys(attrs)) node.setAttribute(key, String(attrs[key]));
    }
    if (kids) for (const child of kids) node.appendChild(child);
    return node;
  }

  function clamp(n, a, b) {
    return Math.max(a, Math.min(b, n));
  }

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  function animate(from, to, ms, ease, onTick, onDone) {
    const start = performance.now();
    let raf = 0;
    const step = (now) => {
      const t = clamp((now - start) / ms, 0, 1);
      onTick(lerp(from, to, ease(t)));
      if (t < 1) raf = requestAnimationFrame(step);
      else if (onDone) onDone();
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }

  function ring(size, stroke) {
    const r = (size - stroke) / 2;
    const c = 2 * Math.PI * r;
    const wrap = el('div', { class: 'lnr-ring' });
    const track = svgEl('circle', {
      cx: size / 2,
      cy: size / 2,
      r,
      fill: 'none',
      stroke: 'rgba(154,168,255,0.16)',
      'stroke-width': stroke
    });
    const arc = svgEl('circle', {
      cx: size / 2,
      cy: size / 2,
      r,
      fill: 'none',
      stroke: 'url(#lnrGrad)',
      'stroke-width': stroke,
      'stroke-linecap': 'round',
      'stroke-dasharray': String(c),
      'stroke-dashoffset': String(c)
    });
    const grad = svgEl('linearGradient', { id: 'lnrGrad', x1: '0%', y1: '0%', x2: '100%', y2: '0%' }, [
      svgEl('stop', { offset: '0%', 'stop-color': '#6ee7d8' }),
      svgEl('stop', { offset: '100%', 'stop-color': '#9aa8ff' })
    ]);
    const defs = svgEl('defs', {}, [grad]);
    const svg = svgEl('svg', { viewBox: `0 0 ${size} ${size}` }, [defs, track, arc]);
    wrap.appendChild(svg);
    let shown = 0;
    wrap.set = (pct) => {
      const next = clamp(pct, 0, 100);
      animate(shown, next, 420, EASE.luna, (v) => {
        shown = v;
        arc.setAttribute('stroke-dashoffset', String(c * (1 - v / 100)));
      });
    };
    wrap.setInstant = (pct) => {
      shown = clamp(pct, 0, 100);
      arc.setAttribute('stroke-dashoffset', String(c * (1 - shown / 100)));
    };
    return wrap;
  }

  function fabRing(size) {
    const stroke = 3;
    const r = (size - stroke) / 2;
    const c = 2 * Math.PI * r;
    const svg = svgEl('svg', { viewBox: `0 0 ${size} ${size}`, class: 'lnr-fab-ring' });
    const arc = svgEl('circle', {
      cx: size / 2,
      cy: size / 2,
      r,
      fill: 'none',
      stroke: '#6ee7d8',
      'stroke-width': stroke,
      'stroke-linecap': 'round',
      'stroke-dasharray': String(c),
      'stroke-dashoffset': String(c),
      transform: `rotate(-90 ${size / 2} ${size / 2})`
    });
    svg.appendChild(arc);
    svg.set = (pct) => {
      arc.setAttribute('stroke-dashoffset', String(c * (1 - clamp(pct, 0, 100) / 100)));
    };
    return svg;
  }

  function starfield(canvas) {
    const ctx = canvas.getContext('2d');
    if (!ctx) return { stop() {} };
    let w = 0;
    let h = 0;
    let running = true;
    const stars = [];

    function resize() {
      const rect = canvas.getBoundingClientRect();
      w = Math.max(1, Math.floor(rect.width));
      h = Math.max(1, Math.floor(rect.height));
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      stars.length = 0;
      const n = Math.floor((w * h) / 1800);
      for (let i = 0; i < n; i++) {
        stars.push({
          x: Math.random() * w,
          y: Math.random() * h,
          r: Math.random() * 1.3 + 0.2,
          a: Math.random(),
          s: 0.004 + Math.random() * 0.01
        });
      }
    }

    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    function tick() {
      if (!running) return;
      ctx.clearRect(0, 0, w, h);
      for (const s of stars) {
        s.a += s.s;
        const alpha = 0.25 + Math.abs(Math.sin(s.a * TAU)) * 0.7;
        ctx.beginPath();
        ctx.fillStyle = `rgba(239,234,255,${alpha})`;
        ctx.arc(s.x, s.y, s.r, 0, TAU);
        ctx.fill();
      }
      requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
    return {
      stop() {
        running = false;
        ro.disconnect();
      }
    };
  }

  function tweenText(node, to, suffix) {
    const from = parseFloat(node.dataset.v || '0') || 0;
    node.dataset.v = String(to);
    animate(from, to, 380, EASE.out, (v) => {
      node.textContent = `${Math.round(v)}${suffix || ''}`;
    });
  }

  async function injectStyles(shadow, href) {
    const url = chrome.runtime.getURL(href);
    const css = await fetch(url).then((r) => r.text());
    const style = document.createElement('style');
    style.textContent = css;
    shadow.appendChild(style);
  }

  function host() {
    const wrap = el('div', { id: 'lnr-host' });
    wrap.style.all = 'initial';
    wrap.style.position = 'fixed';
    wrap.style.zIndex = '2147483000';
    wrap.style.inset = '0';
    wrap.style.pointerEvents = 'none';
    const shadow = wrap.attachShadow({ mode: 'closed' });
    return { wrap, shadow };
  }

  global.LunarisKit = {
    el,
    svgEl,
    clamp,
    lerp,
    animate,
    ring,
    fabRing,
    starfield,
    tweenText,
    injectStyles,
    host,
    EASE
  };
})(typeof window !== 'undefined' ? window : globalThis);

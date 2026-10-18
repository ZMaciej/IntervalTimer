(function () {
  const $ = (id) => document.getElementById(id);
  const setupView = $('setup-view'), timerView = $('timer-view');
  const themeMeta = document.querySelector('meta[name="theme-color"]');
  const progress = $('progress'), clock = $('clock'), pauseBtn = $('pause');
  const ICONS = {
    play: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>',
    pause: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg>',
  };
  function setPauseIcon(icon, label) {
    pauseBtn.innerHTML = ICONS[icon];
    pauseBtn.title = label;
    pauseBtn.setAttribute('aria-label', label);
  }
  setPauseIcon('pause', 'Pause');
  let total = 0, remaining = 0, last = 0, raf = 0, running = false;

  const digits = (s) => s.replace(/\D/g, '').replace(/^0+/, '').slice(-6);
  const toSecs = (dg) => {
    const d = dg.padStart(6, '0');
    return +d.slice(0, -4) * 3600 + +d.slice(-4, -2) * 60 + +d.slice(-2);
  };

  // Digits fill from the right: ss, then mm, then h.
  function formatDigits(d) {
    if (d.length <= 2) return d;
    const sec = d.slice(-2), min = d.slice(-4, -2), h = d.slice(0, -4);
    return h ? `${h}:${min.padStart(2, '0')}:${sec}` : `${+min}:${sec}`;
  }

  const DEFAULT_COLOR = '#4caf50';
  const PRESETS = ['#4caf50', '#e53935', '#fb8c00', '#fdd835', '#1e88e5', '#8e24aa', '#546e7a', '#00acc1'];
  const stage = (name = '', dg = '500', color = DEFAULT_COLOR) => ({ name, digits: dg, color });
  let plan = [];
  try { plan = JSON.parse(localStorage.getItem('plan')) || []; } catch (e) { plan = []; }
  if (!Array.isArray(plan) || !plan.length) plan = [{ type: 'stage', ...stage('Stage 1') }];
  const save = () => { try { localStorage.setItem('plan', JSON.stringify(plan)); } catch (e) { /* ignore */ } };

  function el(tag, props = {}, ...kids) {
    const n = Object.assign(document.createElement(tag), props);
    kids.forEach((k) => n.append(k));
    return n;
  }
  const btn = (text, onclick, cls = 'icon', title = '') => el('button', { type: 'button', className: cls, textContent: text, onclick, title });

  const handle = (getElem) => {
    const h = el('span', { className: 'handle', textContent: '⠿', title: 'Drag' });
    h.addEventListener('pointerdown', (e) => startDrag(e, h, getElem()));
    return h;
  };

  // Drag & drop: the dragged element floats under the pointer while a placeholder
  // moves live through the DOM; the model is rebuilt from the DOM on drop.
  function startDrag(e, h, elem) {
    if (e.button > 0) return;
    e.preventDefault();
    const rect = elem.getBoundingClientRect();
    const offY = e.clientY - rect.top;
    const isGroup = elem.classList.contains('group');
    const ph = el('div', { className: 'placeholder' });
    ph.style.height = rect.height + 'px';
    elem.before(ph);
    Object.assign(elem.style, { width: rect.width + 'px', left: rect.left + 'px', top: rect.top + 'px' });
    elem.classList.add('dragging');
    h.setPointerCapture(e.pointerId);
    const scroller = $('setup-view');

    const place = (y, x) => {
      let container = $('plan');
      if (!isGroup) {
        for (const b of container.querySelectorAll('.group-body')) {
          if (b.closest('.dragging')) continue;
          const r = b.getBoundingClientRect();
          if (y >= r.top && y <= r.bottom && x >= r.left && x <= r.right) { container = b; break; }
        }
      }
      const kids = [...container.children].filter((c) => c !== ph && c !== elem && (c.classList.contains('row') || c.classList.contains('group')));
      const before = kids.find((c) => { const r = c.getBoundingClientRect(); return y < r.top + r.height / 2; });
      const ref = before || (container.classList.contains('group-body') ? container.lastElementChild : null);
      if (ref === ph) return;
      container.insertBefore(ph, ref);
    };

    const onMove = (ev) => {
      elem.style.top = (ev.clientY - offY) + 'px';
      const sr = scroller.getBoundingClientRect();
      if (ev.clientY < sr.top + 40) scroller.scrollTop -= 12;
      else if (ev.clientY > sr.bottom - 40) scroller.scrollTop += 12;
      place(ev.clientY, ev.clientX);
    };
    const finish = (commit) => {
      h.removeEventListener('pointermove', onMove);
      h.removeEventListener('pointerup', onUp);
      h.removeEventListener('pointercancel', onCancel);
      if (commit) {
        ph.replaceWith(elem);
        elem.classList.remove('dragging');
        plan = [...$('plan').children].map((c) => {
          if (c.classList.contains('group')) {
            c._ref.stages = [...c.querySelectorAll('.group-body > .row')].map((r) => r._ref);
            return c._ref;
          }
          c._ref.type = 'stage';
          return c._ref;
        });
      }
      renderPlan();
    };
    const onUp = () => finish(true);
    const onCancel = () => finish(false);
    h.addEventListener('pointermove', onMove);
    h.addEventListener('pointerup', onUp);
    h.addEventListener('pointercancel', onCancel);
  }

  const closeSwatches = () => document.querySelectorAll('.swatches:not([hidden])').forEach((s) => { s.hidden = true; });
  document.addEventListener('pointerdown', (e) => { if (!e.target.closest('.swatches, .swatch.current')) closeSwatches(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeSwatches(); });

  function stageRow(st, onRemove) {
    const name = el('input', { className: 'name', type: 'text', placeholder: 'Stage name', value: st.name });
    name.addEventListener('input', () => { st.name = name.value; save(); });
    const time = el('input', { className: 'time', type: 'text', inputMode: 'numeric', autocomplete: 'off', maxLength: 9, value: formatDigits(st.digits) });
    time.addEventListener('input', () => { st.digits = digits(time.value); time.value = formatDigits(st.digits); save(); });
    time.addEventListener('focus', () => time.select());
    const cur = () => (st.color || DEFAULT_COLOR).toLowerCase();
    const toggle = el('button', { type: 'button', className: 'swatch current', title: 'Stage color' });
    toggle.style.background = cur();
    const swatches = el('div', { className: 'swatches', hidden: true });
    const mark = () => {
      toggle.style.background = cur();
      swatches.querySelectorAll('.swatch').forEach((s) => s.classList.toggle('active', s.dataset.color === cur()));
    };
    const setColor = (c) => { st.color = c; mark(); save(); };
    PRESETS.forEach((c) => {
      const s = el('button', { type: 'button', className: 'swatch', title: c });
      s.dataset.color = c;
      s.style.background = c;
      s.addEventListener('click', () => { setColor(c); swatches.hidden = true; });
      swatches.append(s);
    });
    const color = el('input', { type: 'color', value: cur() });
    color.addEventListener('input', () => setColor(color.value));
    color.addEventListener('change', () => { swatches.hidden = true; });
    swatches.append(el('label', { className: 'swatch custom', title: 'Custom color' }, color));
    toggle.addEventListener('click', (e) => {
      const wasHidden = swatches.hidden;
      closeSwatches();
      if (!wasHidden) return;
      color.value = cur();
      swatches.hidden = false;
      const w = swatches.offsetWidth, h = swatches.offsetHeight;
      swatches.style.left = Math.max(4, Math.min(e.clientX, innerWidth - w - 4)) + 'px';
      swatches.style.top = Math.max(4, Math.min(e.clientY, innerHeight - h - 4)) + 'px';
    });
    mark();
    const row = el('div', { className: 'row' }, handle(() => row), name, time, toggle, btn('✕', onRemove, 'icon', 'Remove'), swatches);
    row._ref = st;
    return row;
  }

  function renderPlan() {
    const root = $('plan');
    root.replaceChildren();
    plan.forEach((item, i) => {
      const remove = () => { plan.splice(i, 1); renderPlan(); };
      if (item.type === 'stage') { root.append(stageRow(item, remove)); return; }
      const reps = el('input', { className: 'repeats', type: 'number', min: 1, max: 999, value: item.repeats });
      reps.addEventListener('input', () => { item.repeats = Math.max(1, parseInt(reps.value, 10) || 1); save(); });
      const head = el('div', { className: 'group-head' }, handle(() => group), 'Group ×', reps, el('span', { className: 'spacer' }),
        btn('✕', remove, 'icon', 'Remove group'));
      const body = el('div', { className: 'group-body' });
      item.stages.forEach((st, k) => body.append(stageRow(st,
        () => { item.stages.splice(k, 1); renderPlan(); })));
      body.append(el('div', { className: 'add-row' }, btn('+ Stage in group', () => { item.stages.push(stage('Stage')); renderPlan(); }, 'secondary')));
      const group = el('div', { className: 'group' }, head, body);
      group._ref = item;
      root.append(group);
    });
    save();
  }

  $('add-stage').addEventListener('click', () => { plan.push({ type: 'stage', ...stage('Stage ' + (plan.length + 1)) }); renderPlan(); });
  $('add-group').addEventListener('click', () => { plan.push({ type: 'group', repeats: 1, stages: [] }); renderPlan(); });
  renderPlan();

  function flatten() {
    const out = [];
    const add = (st, label) => { const secs = toSecs(st.digits); if (secs > 0) out.push({ name: st.name, secs, label, color: st.color || DEFAULT_COLOR }); };
    plan.forEach((item) => {
      if (item.type === 'stage') { add(item, ''); return; }
      for (let r = 1; r <= item.repeats; r++) item.stages.forEach((st) => add(st, `Group ${r}/${item.repeats}`));
    });
    return out;
  }

  let seq = [], idx = 0;
  const info = $('stage-info');
  function loadStage() {
    const s = seq[idx];
    total = remaining = s.secs * 1000;
    timerView.style.background = s.color;
    document.documentElement.style.background = s.color;
    themeMeta.content = s.color;
    info.textContent = [`${idx + 1}/${seq.length}`, s.label].filter(Boolean).join(' · ');
    $('stage-name').textContent = s.name;
  }

  function format(ms) {
    const s = Math.ceil(ms / 1000);
    const h = Math.floor(s / 3600), m = Math.floor(s / 60) % 60, sec = s % 60;
    const p = (n) => String(n).padStart(2, '0');
    return h > 0 ? `${h}:${p(m)}:${p(sec)}` : `${p(m)}:${p(sec)}`;
  }

  function render() {
    clock.textContent = format(remaining);
    progress.style.width = (100 * (1 - remaining / total)) + '%';
    if (seq.length) {
      const all = seq.reduce((a, s) => a + s.secs, 0) * 1000;
      const done = seq.slice(0, idx).reduce((a, s) => a + s.secs, 0) * 1000 + (total - remaining);
      $('overall-fill').style.width = (100 * done / all) + '%';
    }
    document.title = format(remaining) + ' – Interval Timer';
  }

  function tick(now) {
    remaining = Math.max(0, remaining - (now - last));
    last = now;
    render();
    if (remaining > 0) raf = requestAnimationFrame(tick);
    else if (idx + 1 < seq.length) { idx++; loadStage(); render(); last = now; raf = requestAnimationFrame(tick); }
    else { running = false; releaseWake(); setPauseIcon('play', 'Restart'); }
  }

  let wakeLock = null, wakePending = false, fallbackVideo = null;

  // Fallback for contexts without the Wake Lock API (plain http, file://, older browsers):
  // a muted, looping video playing from a canvas stream keeps most mobile screens on.
  function startFallback() {
    if (fallbackVideo || !HTMLCanvasElement.prototype.captureStream) return;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 16;
    const ctx = canvas.getContext('2d');
    let on = false;
    const paint = () => { on = !on; ctx.fillStyle = on ? '#010101' : '#000'; ctx.fillRect(0, 0, 16, 16); };
    paint();
    const v = document.createElement('video');
    Object.assign(v, { muted: true, loop: true, playsInline: true, srcObject: canvas.captureStream(5) });
    v.setAttribute('muted', ''); v.setAttribute('playsinline', '');
    Object.assign(v.style, { position: 'fixed', width: '1px', height: '1px', opacity: '0.01', pointerEvents: 'none', left: 0, top: 0 });
    document.body.append(v);
    v._timer = setInterval(paint, 200);
    v.play().catch(() => {});
    fallbackVideo = v;
  }
  function stopFallback() {
    if (!fallbackVideo) return;
    clearInterval(fallbackVideo._timer);
    fallbackVideo.pause();
    fallbackVideo.srcObject = null;
    fallbackVideo.remove();
    fallbackVideo = null;
  }

  async function requestWake() {
    if (!('wakeLock' in navigator)) { startFallback(); return; }
    if (wakeLock || wakePending) return;
    wakePending = true;
    try {
      const lock = await navigator.wakeLock.request('screen');
      lock.addEventListener('release', () => { if (wakeLock === lock) wakeLock = null; });
      if (running) wakeLock = lock; else lock.release().catch(() => {});
    } catch (e) { startFallback(); }
    wakePending = false;
  }
  function releaseWake() {
    if (wakeLock) { wakeLock.release().catch(() => {}); wakeLock = null; }
    stopFallback();
  }
  // The browser drops the lock when the tab is hidden; reacquire on return.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && running) requestWake();
  });

  function play() {
    running = true; setPauseIcon('pause', 'Pause');
    requestWake();
    last = performance.now();
    raf = requestAnimationFrame(tick);
  }

  function stop() { cancelAnimationFrame(raf); running = false; releaseWake(); }

  function show(timer) {
    timerView.hidden = !timer;
    setupView.hidden = timer;
    if (!timer) {
      document.documentElement.style.background = '';
      themeMeta.content = '#2e7d32';
    }
  }

  $('setup-form').addEventListener('submit', (e) => {
    e.preventDefault();
    seq = flatten();
    if (!seq.length) { $('error').textContent = 'Add a stage with a time greater than zero.'; return; }
    $('error').textContent = '';
    idx = 0; loadStage();
    show(true); render(); play();
  });

  pauseBtn.addEventListener('click', () => {
    if (running) { stop(); setPauseIcon('play', 'Resume'); }
    else if (remaining <= 0) { idx = 0; loadStage(); render(); play(); }
    else play();
  });

  $('back').addEventListener('click', () => { stop(); document.title = 'Interval Timer'; show(false); });
})();

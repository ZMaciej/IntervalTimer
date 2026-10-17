(function () {
  const $ = (id) => document.getElementById(id);
  const setupView = $('setup-view'), timerView = $('timer-view');
  const progress = $('progress'), clock = $('clock'), pauseBtn = $('pause');
  let total = 0, remaining = 0, last = 0, raf = 0, running = false;

  function format(ms) {
    const s = Math.ceil(ms / 1000);
    const h = Math.floor(s / 3600), m = Math.floor(s / 60) % 60, sec = s % 60;
    const p = (n) => String(n).padStart(2, '0');
    return h > 0 ? `${h}:${p(m)}:${p(sec)}` : `${p(m)}:${p(sec)}`;
  }

  function render() {
    clock.textContent = format(remaining);
    progress.style.width = (100 * (1 - remaining / total)) + '%';
    document.title = format(remaining) + ' – Interval Timer';
  }

  function tick(now) {
    remaining = Math.max(0, remaining - (now - last));
    last = now;
    render();
    if (remaining > 0) raf = requestAnimationFrame(tick);
    else { running = false; pauseBtn.textContent = 'Od nowa'; }
  }

  function play() {
    running = true; pauseBtn.textContent = 'Pauza';
    last = performance.now();
    raf = requestAnimationFrame(tick);
  }

  function stop() { cancelAnimationFrame(raf); running = false; }

  function show(timer) {
    timerView.hidden = !timer;
    setupView.hidden = timer;
  }

  $('setup-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const v = (id) => Math.max(0, parseInt($(id).value, 10) || 0);
    const secs = v('hours') * 3600 + v('minutes') * 60 + v('seconds');
    if (secs <= 0) { $('error').textContent = 'Podaj czas większy niż zero.'; return; }
    $('error').textContent = '';
    total = remaining = secs * 1000;
    show(true); render(); play();
  });

  pauseBtn.addEventListener('click', () => {
    if (running) { stop(); pauseBtn.textContent = 'Wznów'; }
    else if (remaining <= 0) { remaining = total; render(); play(); }
    else play();
  });

  $('back').addEventListener('click', () => { stop(); document.title = 'Interval Timer'; show(false); });
})();

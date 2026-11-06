import { panels } from './content.js?v=75';
import { createModalInteraction } from './modal-interaction.js?v=53';
import { createTitleGuides, TITLE_SEQUENCE_MS } from './intro-title-guides.js?v=63';

const $ = s => document.querySelector(s);
const lab = $('#lab');
const boot = $('#bootDialog');
const dialog = $('#contentDialog');
const tags = [...document.querySelectorAll('.orbit-tag')];
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
let robot, soundOn = false, audio, activePanel = 0, lastTag;
const modalInteraction = createModalInteraction({ dialog, panel: $('#panelShell'), scene: $('#scene'), getRobot: () => robot });
const homeInteraction = createHomeTagInteraction({
  root: lab, tags, canInteract: () => !dialog.open && !boot.open && !lab.inert,
  getRobot: () => robot, updateAim, reducedMotion,
  open: tag => { lastTag = tag; showPanel(tag.dataset.panel); },
});

function tone(freq = 420, duration = .07, volume = .025) {
  if (!soundOn) return;
  try {
    audio ||= new (window.AudioContext || window.webkitAudioContext)();
    audio.resume();
    const osc = audio.createOscillator(), gain = audio.createGain();
    osc.type = 'sine'; osc.frequency.value = freq;
    gain.gain.setValueAtTime(volume, audio.currentTime);
    gain.gain.exponentialRampToValueAtTime(.001, audio.currentTime + duration);
    osc.connect(gain); gain.connect(audio.destination);
    osc.start(); osc.stop(audio.currentTime + duration);
  } catch {}
}

const opening = createOpeningSequence({ boot, lab, getRobot: () => robot, reducedMotion, playTone: tone, titleGuides: createTitleGuides($('#bootTitle'), { reducedMotion }) });

function showBoot() {
  homeInteraction.cancel();
  if (dialog.open) dialog.close();
  modalInteraction.close();
  document.body.classList.remove('modal-open');
  robot?.resetAim();
  opening.start();
}
$('#reboot').addEventListener('click', showBoot);
$('#soundToggle').addEventListener('click', () => {
  soundOn = !soundOn; $('#soundToggle').setAttribute('aria-pressed', String(soundOn));
  $('#soundToggle').setAttribute('aria-label', soundOn ? 'Mute sound / 关闭音效' : 'Enable sound / 开启音效');
  $('#soundState').textContent = soundOn ? 'SOUND ON' : 'SOUND OFF'; tone(520, .12);
});

function showPanel(id) {
  const index = panels.findIndex(p => p.id === id);
  if (index < 0) return;
  modalInteraction.prepare();
  homeInteraction.cancel();
  activePanel = index;
  const p = panels[index];
  $('#panelEyebrow').textContent = p.eyebrow;
  $('#panelContent').innerHTML = p.layout === 'people' || p.layout === 'publications' ? p.body : `<p class="panel-kicker">${p.kicker}</p><h2 id="panelTitle">${p.title}</h2><p class="panel-title-zh" lang="zh-CN">${p.titleZh}</p><p class="panel-intro">${p.intro}<small class="zh-copy" lang="zh-CN">${p.introZh}</small></p>${p.body}`;
  dialog.setAttribute('aria-labelledby', p.layout === 'publications' ? 'panelEyebrow' : 'panelTitle');
  document.body.classList.add('modal-open'); lab.inert = true;
  if (!dialog.open) dialog.showModal();
  modalInteraction.open();
  dialog.scrollTop = 0; $('#panelContent').scrollTop = 0;
  tone(540, .12);
  if (p.id === 'contact') {
    $('#contactForm').addEventListener('submit', e => {
      e.preventDefault(); const fd = new FormData(e.currentTarget);
      const data = `SYSTEMS DESIGN LAB / COLLABORATION BRIEF\n系统设计实验室 · 合作简报\n\nName / 称呼: ${fd.get('name')}\nEmail / 邮箱: ${fd.get('email')}\n\nIdeas & questions / 想法与问题:\n${fd.get('message')}\n\nGenerated locally. Nothing has been sent or uploaded.\n简报仅保存在你的设备，未发送或上传。\n`;
      const url = URL.createObjectURL(new Blob(['\ufeff', data], { type: 'text/plain;charset=utf-8' }));
      const a = document.createElement('a'); a.href = url; a.download = 'SDL-collaboration-brief.txt'; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
      $('#formStatus').textContent = 'Brief downloaded. Your information stays on your device. / 简报已下载，信息仅保存在本机。'; tone(750, .2);
    });
  }
}

function closePanel() { modalInteraction.close(); if (dialog.open) dialog.close(); }
$('#closePanel').addEventListener('click', event => modalInteraction.activate('close', closePanel, event));
$('#nextPanel').addEventListener('click', event => modalInteraction.activate('next', () => showPanel(panels[(activePanel + 1) % panels.length].id), event));
dialog.addEventListener('cancel', () => modalInteraction.close());
dialog.addEventListener('close', () => {
  if (dialog.open) return;
  modalInteraction.close();
  homeInteraction.resetAfterModal();
  document.body.classList.remove('modal-open');
  lab.inert = boot.open;
  if (boot.open) return;
  robot?.resetAim();
  lastTag?.focus({ preventScroll: true });
  updateAim();
});
dialog.addEventListener('click', e => {
  if (e.target !== dialog) return;
  const r = $('#panelShell').getBoundingClientRect();
  if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) closePanel();
});

let aimedTag = null, aimFrame = 0;
function updateAim() {
  if (dialog.open || boot.open) return;
  const tag = homeInteraction.target;
  if (!tag) {
    robot?.resetAim();
    aimedTag = null;
    cancelAnimationFrame(aimFrame); aimFrame = 0;
    return;
  }
  const r = tag.querySelector('.tag-arrow').getBoundingClientRect(), c = $('#robotCanvas').getBoundingClientRect();
  robot?.aimAt((r.left + r.width / 2 - c.left) / c.width, (r.top + r.height / 2 - c.top) / c.height);
  if (aimedTag !== tag) tone(tag.dataset.side === 'left' ? 390 : 490, .06, .015);
  aimedTag = tag;
  // Track the real circle throughout hover scaling and responsive layout.
  if (!aimFrame) aimFrame = requestAnimationFrame(() => { aimFrame = 0; updateAim(); });
}
// The first HTML paint is covered; start the existing data clock after the hold.
const initialCover = document.getElementById('openingCover');
if (initialCover) await new Promise(resolve => setTimeout(resolve, 200));
showBoot();
// Paint the data stage before constructing the detailed mechanical model.
await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
initialCover?.remove();
try {
  const { createRobotScene } = await import('./robot.js?v=72');
  robot = await createRobotScene($('#robotCanvas'), { reducedMotion, intro: boot.open }); updateAim();
}
catch (error) { console.warn('3D scene unavailable:', error); $('.scene-fallback').hidden = false; }
finally { opening.robotReady(); }

// Home taps retain their target until the real fingertip reaches the circle.
// Mouse hover and keyboard activation keep their existing direct behavior.
export function createHomeTagInteraction({ root, tags, canInteract, getRobot, updateAim, open, reducedMotion = false, acceptFocus = () => true }) {
  let hovered = null, focused = null, touch = null, cancelledTag = null, activation = null;
  let needsFreshInput = false;
  let actionFrame = 0, actionTimer = 0, releaseTimer = 0;
  const listeners = [];
  const listen = (target, name, handler, options) => {
    target.addEventListener(name, handler, options);
    listeners.push(() => target.removeEventListener(name, handler, options));
  };
  function clearTouch() {
    cancelAnimationFrame(actionFrame); actionFrame = 0;
    clearTimeout(actionTimer); actionTimer = 0;
    clearTimeout(releaseTimer); releaseTimer = 0;
    activation = null; touch = null;
    for (const tag of tags) tag.classList.remove('is-touch-target');
    getRobot()?.endTouchReach?.();
  }
  function cancel() {
    clearTouch(); hovered = null; focused = null;
    updateAim();
  }
  function rejectTouch() {
    cancelledTag = touch?.tag || null;
    cancel();
  }
  function startTouch(tag, event) {
    clearTouch(); hovered = null; focused = null; cancelledTag = null;
    touch = { tag, pointerId: event.pointerId, x: event.clientX, y: event.clientY, started: performance.now() };
    tag.classList.add('is-touch-target');
    updateAim();
    getRobot()?.beginTouchReach?.({ duration: reducedMotion ? .08 : .48 });
  }
  function activate(tag, event) {
    if (!canInteract()) return;
    needsFreshInput = false;
    if (cancelledTag === tag && (event.pointerType === 'touch' || event.detail > 0)) return;
    const fromTouch = event.pointerType === 'touch' || (event.detail > 0 && touch?.tag === tag);
    if (!fromTouch || !getRobot()) { cancel(); open(tag); return; }
    if (activation?.tag === tag) return;
    if (touch?.tag !== tag) startTouch(tag, event);
    clearTimeout(releaseTimer); releaseTimer = 0;
    const queued = { tag };
    activation = queued;
    let settledAt = null;
    function finish() {
      if (activation !== queued) return;
      clearTouch(); hovered = null; focused = null;
      if (canInteract()) open(tag);
    }
    function waitForContact() {
      if (activation !== queued) return;
      if (!canInteract()) { cancel(); return; }
      const state = getRobot()?.getHomeAimState?.();
      const arrived = state?.progress === 1 && state.errorPixels < 1;
      if (arrived) {
        settledAt ??= performance.now();
        if (performance.now() - settledAt >= (reducedMotion ? 60 : 80)) { finish(); return; }
      } else settledAt = null;
      actionFrame = requestAnimationFrame(waitForContact);
    }
    actionFrame = requestAnimationFrame(waitForContact);
    // Slow frames still present exact contact, then a brief pause, before open.
    const remaining = Math.max(0, (reducedMotion ? 180 : 800) - (performance.now() - touch.started));
    actionTimer = setTimeout(() => {
      if (activation !== queued || !canInteract()) { cancel(); return; }
      updateAim();
      let completed = false;
      try { completed = getRobot()?.completeHomeAim?.(); } catch {}
      if (completed) {
        settledAt = performance.now();
        actionTimer = setTimeout(finish, reducedMotion ? 60 : 80);
      } else finish();
    }, remaining);
  }
  for (const tag of tags) {
    listen(tag, 'pointerenter', event => {
      if (!needsFreshInput && event.pointerType !== 'touch' && canInteract()) { hovered = tag; updateAim(); }
    });
    listen(tag, 'pointermove', event => {
      if (needsFreshInput && event.pointerType !== 'touch' && canInteract()) {
        needsFreshInput = false; hovered = tag; updateAim();
      }
    });
    listen(tag, 'pointerleave', event => {
      if (event.pointerType === 'touch') return;
      if (hovered === tag) hovered = null;
      updateAim();
    });
    listen(tag, 'focus', () => { if (!needsFreshInput && !touch && canInteract() && acceptFocus(tag)) { focused = tag; updateAim(); } });
    listen(tag, 'blur', () => { if (focused === tag) focused = null; updateAim(); });
    listen(tag, 'pointerdown', event => {
      if (!canInteract()) return;
      needsFreshInput = false;
      if (event.pointerType === 'touch' && event.isPrimary !== false && canInteract()) startTouch(tag, event);
      else if (event.pointerType !== 'touch') { hovered = tag; updateAim(); }
    });
    listen(tag, 'click', event => activate(tag, event));
  }
  listen(root, 'pointerdown', event => {
    cancelledTag = null;
    if (event.pointerType !== 'touch') { clearTouch(); updateAim(); return; }
    if (touch?.pointerId !== event.pointerId || !touch?.tag.contains(event.target)) cancel();
  });
  const moved = event => touch && touch.pointerId === event.pointerId && Math.hypot(event.clientX - touch.x, event.clientY - touch.y) > 12;
  listen(root, 'pointermove', event => { if (moved(event)) rejectTouch(); });
  listen(root, 'pointercancel', event => { if (touch?.pointerId === event.pointerId) rejectTouch(); });
  listen(root, 'pointerup', event => {
    if (touch?.pointerId !== event.pointerId || activation) return;
    if (moved(event)) { rejectTouch(); return; }
    releaseTimer = setTimeout(() => { cancel(); }, 400);
  });
  listen(root, 'contextmenu', () => { if (touch) rejectTouch(); });
  listen(root, 'keydown', event => { if (event.key === 'Tab') { needsFreshInput = false; cancel(); } });
  listen(window, 'scroll', () => { if (touch) rejectTouch(); }, { capture: true, passive: true });
  listen(window, 'resize', () => { if (touch) rejectTouch(); });
  return {
    get target() { return touch?.tag || hovered || focused; },
    activate,
    focus(tag) { focused = tag && canInteract() ? tag : null; updateAim(); },
    resetAfterModal() {
      // Native dialog focus/pointer restoration must not re-arm the old reach.
      // Keep DOM focus for keyboard access, then wait for an actual new input.
      needsFreshInput = true; cancel();
    },
    cancel,
    destroy() { cancel(); listeners.forEach(remove => remove()); },
  };
}

// The intro shares the homepage canvas: only its drawing progress changes.
// Its data stream and text leave together; the model never changes containers.
export function createOpeningSequence({ boot, lab, getRobot, reducedMotion = false, playTone = () => {}, titleGuides = null }) {
  const body = document.body, button = boot.querySelector('#enterButton');
  const data = boot.querySelector('#introData'), status = boot.querySelector('#introStatus');
  const count = boot.querySelector('#introCount'), phaseLabel = boot.querySelector('#introPhase');
  const progressLabel = boot.querySelector('#introProgress');
  const originalPadding = body.style.getPropertyValue('padding-right');
  const originalPaddingPriority = body.style.getPropertyPriority('padding-right');
  let running = false, resolved = false, phase = 'idle', generation = 0;
  let frame = 0, streamFrame = 0, exitTimer = 0, started = 0, drawingStarted = null;
  let streamCount = 0, progress = 0, progressPercent = -1, skipRequested = false, reservedWidth = 0;
  let streamRows = [], streamStep = 0, streamRowHeight = 18, streamHeight = 0;
  const streamInterval = 55;
  const vocabulary = ['RELATION', 'OBJECT', 'SIGNAL', 'VECTOR', 'NETWORK', 'FIELD', 'NODE', 'LINK'];
  const canvas = lab.querySelector?.('#robotCanvas');
  let enterFrame = 0, keyboardEnterFocus = false;
  function aimAtEnter() {
    const bounds = canvas?.getBoundingClientRect(), target = button.getBoundingClientRect();
    if (!bounds || bounds.width <= 0 || bounds.height <= 0) return;
    getRobot()?.aimAt?.((target.left + target.width / 2 - bounds.left) / bounds.width,
      (target.top + target.height / 2 - bounds.top) / bounds.height);
  }
  function updateEnterAim() {
    cancelAnimationFrame(enterFrame); enterFrame = 0;
    // Keep the same contact while the Enter control fades into the homepage.
    if (phase === 'leaving') return;
    if (!running || phase !== 'ready' || !boot.open || !enterInteraction.target) {
      getRobot()?.resetAim?.(); return;
    }
    aimAtEnter();
    enterFrame = requestAnimationFrame(() => { enterFrame = 0; updateEnterAim(); });
  }
  const enterInteraction = createHomeTagInteraction({
    root: boot, tags: [button], getRobot, updateAim: updateEnterAim, reducedMotion,
    canInteract: () => running && phase === 'ready' && boot.open,
    acceptFocus: () => keyboardEnterFocus,
    open: () => enter(),
  });
  const onEnterPointer = () => { keyboardEnterFocus = false; enterInteraction.focus(null); };

  function restorePadding() {
    if (originalPadding) body.style.setProperty('padding-right', originalPadding, originalPaddingPriority);
    else body.style.removeProperty('padding-right');
  }
  function reserveHomeWidth() {
    const leaving = body.classList.contains('intro-leaving');
    restorePadding();
    body.classList.remove('booting', 'intro-leaving');
    const homeWidth = lab.getBoundingClientRect().width;
    const homePadding = getComputedStyle(body).paddingRight || '0px';
    body.classList.add('booting');
    if (leaving) body.classList.add('intro-leaving');
    reservedWidth = Math.max(0, lab.getBoundingClientRect().width - homeWidth);
    if (reservedWidth > .5) body.style.setProperty('padding-right', `calc(${homePadding} + ${reservedWidth}px)`, originalPaddingPriority);
  }
  function setPhase(next, label) {
    phase = next; boot.dataset.introStage = next;
    if (phaseLabel) phaseLabel.textContent = label;
  }
  function setProgress(value) {
    progress = Math.min(1, Math.max(0, value));
    getRobot()?.setIntroProgress?.(progress);
    titleGuides?.setProgress(progress);
    const percent = Math.round(progress * 100);
    if (progressLabel && percent !== progressPercent) {
      progressPercent = percent;
      progressLabel.textContent = `${String(percent).padStart(2, '0')}%`;
    }
  }
  function measureData() {
    const compact = window.innerWidth <= 700 || window.innerHeight <= 560;
    streamRowHeight = Number.parseFloat(getComputedStyle(data).getPropertyValue?.('--intro-row-height')) || (compact ? 13 : window.innerWidth >= 1800 ? 21 : 18);
    streamHeight = data.clientHeight || data.getBoundingClientRect?.().height || Math.min(streamRowHeight * 17, window.innerHeight * (window.innerWidth <= 700 ? .12 : .36));
  }
  function renderData(now) {
    for (const [index, entry] of streamRows.entries()) {
      const y = reducedMotion ? index * streamRowHeight : streamHeight - (now - entry.born) / streamInterval * streamRowHeight;
      if (entry.row.style) entry.row.style.transform = `translate3d(0,${y.toFixed(3)}px,0)`;
    }
  }
  function appendData(born) {
    const row = document.createElement('div'); row.className = 'intro-data-row';
    const index = document.createElement('span'); index.className = 'intro-data-index';
    const value = document.createElement('span'); value.className = 'intro-data-value';
    const tag = document.createElement('span'); tag.className = 'intro-data-tag';
    streamCount++;
    if (streamCount % 4 === 0) row.classList.add('is-accent');
    if (streamCount % 5 === 0) row.classList.add('is-muted');
    const word = vocabulary[streamCount % vocabulary.length];
    index.textContent = String(streamCount).padStart(4, '0');
    value.textContent = `${word}_${String((streamCount * 37) % 997).padStart(3, '0')}  ${(Math.sin(streamCount * 1.73) * .5 + .5).toFixed(4)}`;
    tag.textContent = streamCount % 3 === 0 ? 'CONNECTED' : streamCount % 3 === 1 ? 'MAPPING' : 'RESOLVED';
    row.append(index, value, tag); data.append(row);
    streamRows.push({ row, born });
    while (streamRows.length > 18) streamRows.shift().row.remove();
    if (count) count.textContent = String(streamCount).padStart(6, '0');
  }
  function scrollData(now) {
    streamFrame = 0;
    if (!running || phase === 'leaving') return;
    const nextStep = Math.floor(Math.max(0, now - started) / streamInterval);
    // A background tab may miss many samples; retain only the visible tail.
    if (nextStep - streamStep > 18) {
      streamCount += nextStep - streamStep - 18;
      streamStep = nextStep - 18;
      streamRows = []; data.replaceChildren();
    }
    while (streamStep < nextStep) {
      streamStep++;
      appendData(started + streamStep * streamInterval);
    }
    renderData(now);
    streamFrame = requestAnimationFrame(scrollData);
  }
  function stopWork() {
    cancelAnimationFrame(enterFrame); enterFrame = 0;
    cancelAnimationFrame(frame); frame = 0;
    cancelAnimationFrame(streamFrame); streamFrame = 0;
    clearTimeout(exitTimer); exitTimer = 0;
  }
  function ready() {
    if (!running || phase === 'leaving' || phase === 'ready') return;
    cancelAnimationFrame(frame); frame = 0;
    setProgress(1); setPhase('ready', 'SYSTEM READY');
    getRobot()?.setIntroInteractive?.(true);
    status.textContent = 'CONNECTION ESTABLISHED';
    boot.classList.add('ready'); boot.setAttribute('aria-busy', 'false');
    button.disabled = false;
    keyboardEnterFocus = false;
    button.focus({ preventScroll: true });
  }
  function tick(now) {
    frame = 0;
    if (!running || phase === 'leaving' || phase === 'ready') return;
    if (resolved && (reducedMotion || skipRequested)) { ready(); return; }
    if (resolved && now - started >= 1100) {
      if (!getRobot()) { ready(); return; }
      if (drawingStarted === null) {
        drawingStarted = now; setPhase('drawing', 'TRACING SDL—01');
        status.textContent = 'CONNECTING SYSTEMS. FORMING IDEAS.';
      }
      setProgress((now - drawingStarted) / TITLE_SEQUENCE_MS);
      if (progress >= 1) { ready(); return; }
    }
    frame = requestAnimationFrame(tick);
  }
  function start() {
    generation++; stopWork(); running = true; skipRequested = false;
    document.documentElement?.classList.add('opening-active');
    drawingStarted = null; streamCount = 0; streamStep = 0; streamRows = []; started = performance.now();
    boot.classList.remove('closing', 'ready'); body.classList.remove('intro-leaving');
    reserveHomeWidth(); lab.inert = true;
    lab.setAttribute('tabindex', '-1'); boot.setAttribute('tabindex', '-1');
    boot.setAttribute('aria-busy', 'true'); button.disabled = true;
    data.replaceChildren(); setPhase('data', 'RECEIVING INPUT');
    keyboardEnterFocus = false; enterInteraction.cancel();
    getRobot()?.setIntroInteractive?.(false);
    status.textContent = 'COLLECTING SIGNALS. FINDING CONNECTIONS.';
    if (!boot.open) boot.show();
    getRobot()?.beginIntro?.(); setProgress(0);
    titleGuides?.refresh();
    measureData();
    const initialRows = reducedMotion ? 3 : 6;
    for (let i = 0; i < initialRows; i++) appendData(started - (initialRows - i - 1) * streamInterval);
    renderData(started);
    if (!reducedMotion) streamFrame = requestAnimationFrame(scrollData);
    boot.focus({ preventScroll: true });
    frame = requestAnimationFrame(tick);
  }
  function enter() {
    if (!running || phase !== 'ready' || !boot.open) return false;
    const token = ++generation;
    stopWork(); setPhase('leaving', 'WELCOME TO THE LAB');
    enterInteraction.cancel(); aimAtEnter();
    document.documentElement?.classList.remove('opening-active');
    boot.classList.add('closing'); body.classList.add('intro-leaving');
    playTone(430, .14, .03);
    exitTimer = setTimeout(() => {
      exitTimer = 0;
      if (!running || token !== generation) return;
      boot.close();
      body.classList.remove('booting', 'intro-leaving'); restorePadding();
      lab.inert = false; running = false; setPhase('home', 'SYSTEM ONLINE');
      enterInteraction.cancel(); getRobot()?.resetAim?.();
      getRobot()?.finishIntro?.(); getRobot()?.setActive?.(true);
      lab.focus({ preventScroll: true });
    }, reducedMotion ? 100 : 720);
    return true;
  }
  function skip() {
    if (!running || phase === 'leaving') return;
    if (phase === 'ready') { enter(); return; }
    skipRequested = true;
    if (resolved) ready();
  }
  function onKey(event) {
    if (!running || !boot.open) return;
    if (event.key === 'Enter') { event.preventDefault(); if (!event.repeat) enterInteraction.activate(button, event); }
    else if (event.key === 'Escape') { event.preventDefault(); if (!event.repeat) skip(); }
    else if (event.key === 'Tab') {
      event.preventDefault();
      if (button.disabled) boot.focus({ preventScroll: true });
      else { keyboardEnterFocus = true; button.focus({ preventScroll: true }); enterInteraction.focus(button); }
    }
  }
  const onCancel = event => { event.preventDefault(); skip(); };
  const onResize = () => {
    if (running && boot.open) {
      reserveHomeWidth(); getRobot()?.resize?.(); measureData(); renderData(performance.now());
      if (phase === 'leaving') aimAtEnter(); else updateEnterAim();
    }
  };
  button.addEventListener('pointerdown', onEnterPointer);
  boot.addEventListener('cancel', onCancel);
  document.addEventListener('keydown', onKey);
  window.addEventListener('resize', onResize);
  return {
    start, enter, skip,
    robotReady() {
      if (resolved) return;
      resolved = true;
      if (running && phase !== 'leaving' && phase !== 'ready') {
        getRobot()?.beginIntro?.(); setProgress(0);
        body.classList.remove('opening-loading');
        if (reducedMotion || skipRequested) ready();
      }
    },
    getState() { return { phase, progress, running, streamCount, rowCount: data.childElementCount, reservedWidth }; },
    destroy() {
      generation++; stopWork(); running = false;
      button.removeEventListener('pointerdown', onEnterPointer); boot.removeEventListener('cancel', onCancel);
      enterInteraction.destroy(); getRobot()?.setIntroInteractive?.(false);
      document.removeEventListener('keydown', onKey); window.removeEventListener('resize', onResize);
      if (boot.open) boot.close(); body.classList.remove('booting', 'intro-leaving');
      document.documentElement?.classList.remove('opening-active');
      restorePadding(); lab.inert = false; getRobot()?.finishIntro?.();
      titleGuides?.destroy();
    },
  };
}

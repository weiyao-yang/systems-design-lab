import { createRobotScene } from './robot.js?v=36';
import { panels } from './content.js?v=5';
import { createModalInteraction } from './modal-interaction.js?v=32';

const $ = s => document.querySelector(s);
const lab = $('#lab');
const boot = $('#bootDialog');
const dialog = $('#contentDialog');
const tags = [...document.querySelectorAll('.orbit-tag')];
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
let robot, soundOn = false, audio, activePanel = 0, typingToken = 0, lastTag;
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

function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }
function setProgress(n) { $('#bootPercent').textContent = `${String(n).padStart(2,'0')}%`; $('#bootProgress').style.width = n + '%'; }
async function typeOpening() {
  const token = ++typingToken;
  $('#typedEnglish').textContent = ''; $('#typedChinese').textContent = '';
  $('#bootLog').textContent = 'ESTABLISHING CONNECTION . . .'; setProgress(0);
  await sleep(reducedMotion ? 0 : 450);
  const lines = [['#typedEnglish', 'Systems Design Lab'], ['#typedChinese', '系统设计实验室']];
  let current = 0, total = 25;
  for (const [selector, line] of lines) {
    for (const c of line) {
      if (token !== typingToken) return;
      $(selector).textContent += c;
      setProgress(Math.round(++current / total * 100));
      if (!reducedMotion) await sleep(selector === '#typedEnglish' ? 63 : 105);
    }
    if (!reducedMotion) await sleep(170);
  }
  setProgress(100); $('#bootLog').textContent = 'CONNECTION ESTABLISHED. WELCOME TO THE LAB.';
  boot.classList.add('ready'); $('#enterButton').disabled = false;
}

function showBoot() {
  homeInteraction.cancel();
  if (dialog.open) dialog.close();
  modalInteraction.close();
  document.body.classList.remove('modal-open');
  document.body.classList.add('booting');
  lab.inert = true;
  boot.classList.remove('closing');
  boot.classList.remove('ready'); $('#enterButton').disabled = true;
  if (!boot.open) boot.showModal();
  robot?.resetAim(); typeOpening();
}

async function enterLab() {
  if (boot.classList.contains('closing')) return;
  ++typingToken;
  $('#typedEnglish').textContent = 'Systems Design Lab';
  $('#typedChinese').textContent = '系统设计实验室'; setProgress(100);
  tone(230, .18, .04); setTimeout(() => tone(620, .2), 100);
  boot.classList.add('closing');
  await sleep(reducedMotion ? 0 : 380);
  boot.close(); document.body.classList.remove('booting'); lab.inert = false;
  robot?.setActive(true); tags[0].focus({ preventScroll: true }); tags[0].blur();
}
$('#enterButton').addEventListener('click', enterLab);
boot.addEventListener('cancel', e => { e.preventDefault(); enterLab(); });
$('#reboot').addEventListener('click', showBoot);
$('#soundToggle').addEventListener('click', () => {
  soundOn = !soundOn; $('#soundToggle').setAttribute('aria-pressed', String(soundOn));
  $('#soundToggle').setAttribute('aria-label', soundOn ? 'Mute sound / 关闭音效' : 'Enable sound / 开启音效');
  $('#soundState').textContent = soundOn ? 'SOUND ON' : 'SOUND OFF'; tone(520, .12);
});

function showPanel(id) {
  const index = panels.findIndex(p => p.id === id);
  if (index < 0) return;
  homeInteraction.cancel();
  activePanel = index;
  const p = panels[index];
  $('#panelEyebrow').textContent = p.eyebrow;
  $('#panelContent').innerHTML = `<p class="panel-kicker">${p.kicker}</p><h2 id="panelTitle">${p.title}</h2><p class="panel-title-zh" lang="zh-CN">${p.titleZh}</p><p class="panel-intro">${p.intro}<small class="zh-copy" lang="zh-CN">${p.introZh}</small></p>${p.body}`;
  document.body.classList.add('modal-open'); lab.inert = true;
  if (!dialog.open) dialog.showModal();
  modalInteraction.open();
  dialog.scrollTop = 0; $('#panelContent').scrollTop = 0;
  tone(540, .12);
  if (p.id === 'prototypes') {
    $('#prototypePlay').addEventListener('click', () => {
      const running = $('#prototypeStage').classList.toggle('running');
      $('#prototypePlay').setAttribute('aria-pressed', String(running));
      $('#prototypePlay').innerHTML = running ? 'PAUSE EXPERIMENT Ⅱ<small class="zh-copy">暂停轨道实验</small>' : 'START EXPERIMENT ↗<small class="zh-copy">启动轨道实验</small>';
      $('#prototypeStatus').innerHTML = running ? 'CONNECTING<small class="zh-copy">关系流动中</small>' : 'READY<small class="zh-copy">等待输入</small>';
      tone(running ? 650 : 340, .12);
    });
  }
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
showBoot();
try { robot = await createRobotScene($('#robotCanvas'), { reducedMotion }); updateAim(); }
catch (error) { console.warn('3D scene unavailable:', error); $('.scene-fallback').hidden = false; }

// Home taps retain their target until the real fingertip reaches the circle.
// Mouse hover and keyboard activation keep their existing direct behavior.
export function createHomeTagInteraction({ root, tags, canInteract, getRobot, updateAim, open, reducedMotion = false }) {
  let hovered = null, focused = null, touch = null, cancelledTag = null, activation = null;
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
      if (event.pointerType !== 'touch' && canInteract()) { hovered = tag; updateAim(); }
    });
    listen(tag, 'pointerleave', event => {
      if (event.pointerType === 'touch') return;
      if (hovered === tag) hovered = null;
      updateAim();
    });
    listen(tag, 'focus', () => { if (!touch && canInteract()) { focused = tag; updateAim(); } });
    listen(tag, 'blur', () => { if (focused === tag) focused = null; updateAim(); });
    listen(tag, 'pointerdown', event => {
      if (event.pointerType === 'touch' && event.isPrimary !== false && canInteract()) startTouch(tag, event);
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
  listen(root, 'keydown', event => { if (event.key === 'Tab') cancel(); });
  listen(window, 'scroll', () => { if (touch) rejectTouch(); }, { capture: true, passive: true });
  listen(window, 'resize', () => { if (touch) rejectTouch(); });
  return {
    get target() { return touch?.tag || hovered || focused; },
    cancel,
    destroy() { cancel(); listeners.forEach(remove => remove()); },
  };
}

import { createRobotScene } from './robot.js?v=24';
import { panels } from './content.js?v=5';

const $ = s => document.querySelector(s);
const lab = $('#lab');
const boot = $('#bootDialog');
const dialog = $('#contentDialog');
const tags = [...document.querySelectorAll('.orbit-tag')];
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
let robot, soundOn = false, audio, activePanel = 0, typingToken = 0, lastTag;

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
  if (dialog.open) dialog.close();
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
  activePanel = index;
  const p = panels[index];
  $('#panelEyebrow').textContent = p.eyebrow;
  $('#panelContent').innerHTML = `<p class="panel-kicker">${p.kicker}</p><h2 id="panelTitle">${p.title}</h2><p class="panel-title-zh" lang="zh-CN">${p.titleZh}</p><p class="panel-intro">${p.intro}<small class="zh-copy" lang="zh-CN">${p.introZh}</small></p>${p.body}`;
  document.body.classList.add('modal-open'); lab.inert = true;
  if (!dialog.open) dialog.showModal();
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

function closePanel() { if (dialog.open) dialog.close(); }
$('#closePanel').addEventListener('click', closePanel);
$('#nextPanel').addEventListener('click', () => showPanel(panels[(activePanel + 1) % panels.length].id));
dialog.addEventListener('close', () => {
  document.body.classList.remove('modal-open'); lab.inert = false;
  robot?.resetAim();
  lastTag?.focus({ preventScroll: true });
  updateAim();
});
dialog.addEventListener('click', e => {
  if (e.target !== dialog) return;
  const r = dialog.getBoundingClientRect();
  if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) closePanel();
});

let hoveredTag = null, focusedTag = null, aimedTag = null, aimFrame = 0;
function updateAim() {
  if (dialog.open || boot.open) return;
  const tag = hoveredTag || focusedTag;
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
for (const tag of tags) {
  tag.addEventListener('pointerenter', () => { hoveredTag = tag; updateAim(); });
  tag.addEventListener('pointerleave', () => { if (hoveredTag === tag) hoveredTag = null; updateAim(); });
  tag.addEventListener('focus', () => { focusedTag = tag; updateAim(); });
  tag.addEventListener('blur', () => { if (focusedTag === tag) focusedTag = null; updateAim(); });
  tag.addEventListener('click', () => { lastTag = tag; showPanel(tag.dataset.panel); });
}

showBoot();
try { robot = await createRobotScene($('#robotCanvas'), { reducedMotion }); updateAim(); }
catch (error) { console.warn('3D scene unavailable:', error); $('.scene-fallback').hidden = false; }

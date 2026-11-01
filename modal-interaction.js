// Keep the existing robot in the dialog's top layer without intercepting input.
export function modalControlSpec(kind, panel, band, icon, viewport) {
  const x = icon.left + icon.width / 2, y = icon.top + icon.height / 2;
  return {
    kind,
    target: { x, y },
    panel: { left: panel.left, right: panel.right, top: panel.top, bottom: panel.bottom },
    gate: {
      left: Math.max(panel.left, x - (viewport.width <= 700 ? 24 : 35)),
      top: Math.max(panel.top, band.top + 2),
      bottom: Math.min(panel.bottom, band.bottom - 2),
    },
    viewport,
  };
}

export function createModalInteraction({ dialog, panel, scene, getRobot }) {
  const closeButton = dialog.querySelector('#closePanel');
  const nextButton = dialog.querySelector('#nextPanel');
  const controls = { close: closeButton, next: nextButton };
  const home = document.createComment('robot scene home');
  scene.before(home);
  let active = false, frame = 0, hovered = null, focused = null;
  let keyboard = false, lastKind = null, robotInModal = false;
  const listeners = [];
  const listen = (target, name, handler) => {
    target.addEventListener(name, handler);
    listeners.push(() => target.removeEventListener(name, handler));
  };
  const viewport = () => ({ width: window.innerWidth, height: window.innerHeight });
  const layout = () => ({ ...viewport(), panel: panel.getBoundingClientRect() });
  function specFor(kind) {
    const icon = kind === 'close' ? closeButton.querySelector('.close-icon') : nextButton.querySelector('span');
    const band = dialog.querySelector(kind === 'close' ? '.panel-top' : '.panel-bottom');
    return modalControlSpec(kind, panel.getBoundingClientRect(), band.getBoundingClientRect(), icon.getBoundingClientRect(), viewport());
  }
  function hideScene() {
    scene.style.opacity = '0';
    scene.removeAttribute('data-modal-phase');
    scene.removeAttribute('data-modal-layer');
  }
  function paint(state) {
    // A cleared WebGL frame and the dialog's depth occlusion own visibility.
    // Keep the canvas present throughout the route; never gate it on bounds.
    scene.style.removeProperty('clip-path');
    scene.style.opacity = robotInModal ? '1' : '0';
    scene.dataset.modalPhase = state?.phase || 'hidden';
    scene.dataset.modalLayer = state?.layer || 'behind';
  }
  function enterRobotMode(robot = getRobot()) {
    if (!robot || robotInModal) return;
    // setModalMode synchronously clears the previous home frame after resize.
    robot.setModalMode(true, layout());
    robotInModal = true;
    paint(robot.getModalState());
  }
  function syncTarget() {
    const robot = getRobot();
    enterRobotMode(robot);
    const kind = hovered || focused;
    if (robot) {
      const currentState = robot.getModalState();
      if (currentState?.kind && currentState.kind !== kind) robot.updateModalLayout?.(specFor(currentState.kind));
      if (kind) robot.aimAtModal(specFor(kind));
      else if (lastKind) robot.resetModalAim();
      paint(robot.getModalState());
    }
    for (const [name, button] of Object.entries(controls)) button.classList.toggle('is-robot-target', name === kind);
    lastKind = kind;
  }
  function update() {
    frame = 0;
    if (!active || !dialog.open) return;
    syncTarget();
    frame = requestAnimationFrame(update);
  }
  function refresh() {
    if (!active || !dialog.open) return;
    // Set the desired control in the input event, before the next render.
    syncTarget();
    if (!frame) frame = requestAnimationFrame(update);
  }
  function open() {
    if (active) { refresh(); return; }
    active = true;
    hovered = null; focused = null; lastKind = null;
    scene.classList.add('modal-scene');
    scene.setAttribute('aria-hidden', 'true');
    hideScene();
    dialog.append(scene);
    // Native showModal() initially focuses the close button. Begin at rest.
    panel.focus({ preventScroll: true });
    enterRobotMode();
    refresh();
  }
  function close() {
    if (!active && !robotInModal) return;
    active = false;
    cancelAnimationFrame(frame); frame = 0;
    hovered = null; focused = null; lastKind = null;
    const robot = getRobot();
    if (robotInModal) robot?.setModalMode(false);
    robotInModal = false;
    hideScene();
    scene.classList.remove('modal-scene');
    scene.removeAttribute('aria-hidden');
    scene.style.removeProperty('clip-path');
    scene.style.removeProperty('opacity');
    home.after(scene);
    for (const button of Object.values(controls)) button.classList.remove('is-robot-target');
    robot?.resize();
  }
  listen(dialog, 'keydown', event => { if (event.key === 'Tab') keyboard = true; });
  listen(dialog, 'pointerdown', () => { keyboard = false; focused = null; refresh(); });
  for (const [kind, button] of Object.entries(controls)) {
    listen(button, 'pointerenter', () => { if (active) { hovered = kind; refresh(); } });
    listen(button, 'pointerleave', () => { if (hovered === kind) hovered = null; refresh(); });
    listen(button, 'focus', () => {
      if (active && (keyboard || button.matches(':focus-visible'))) { focused = kind; refresh(); }
    });
    listen(button, 'blur', () => { if (focused === kind) focused = null; refresh(); });
  }
  listen(window, 'resize', () => { if (active) { getRobot()?.resize(); refresh(); } });
  listen(dialog.querySelector('.panel-content'), 'scroll', refresh);
  return {
    open, close, refresh,
    destroy() { close(); listeners.forEach(remove => remove()); home.remove(); },
  };
}

// Keep the existing robot in the dialog's top layer without intercepting input.
export function modalControlSpec(kind, panel, band, icon, viewport) {
  const x = icon.left + icon.width / 2, y = icon.top + icon.height / 2;
  return {
    kind,
    mobileNext: kind === 'next' && viewport.width <= 700,
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
  let prepared = false, background = null, savedPadding = null, savedScroll = null;
  let touch = null, cancelledKind = null, activation = null, activationFrame = 0, activationTimer = 0, releaseTimer = 0;
  const listeners = [];
  const listen = (target, name, handler) => {
    target.addEventListener(name, handler);
    listeners.push(() => target.removeEventListener(name, handler));
  };
  const viewport = () => ({ width: window.innerWidth, height: window.innerHeight });
  const layout = () => ({ ...viewport(), panel: panel.getBoundingClientRect() });
  function restoreHomeScroll() {
    if (savedScroll) window.scrollTo?.(savedScroll.x, savedScroll.y);
  }
  function refreshBackground() {
    if (!background) return;
    const rect = background.holder.getBoundingClientRect();
    const transform = getRobot()?.getHomeFrameTransform?.(background.frame, rect);
    if (transform) background.canvas.style.transform = `matrix(${transform.a},0,0,${transform.d},${transform.e},${transform.f})`;
  }
  function prepare() {
    if (prepared || active) return;
    prepared = true;
    savedScroll = {x: window.scrollX || 0, y: window.scrollY || 0};
    const robot = getRobot();
    if (robot?.captureHomeFrame) {
      const canvas = document.createElement('canvas');
      const frame = robot.captureHomeFrame(canvas);
      if (frame) {
        const holder = document.createElement('div');
        holder.className = 'scene modal-home-frame'; holder.setAttribute('aria-hidden', 'true');
        canvas.style.width = `${frame.width}px`; canvas.style.height = `${frame.height}px`;
        canvas.style.transformOrigin = '0 0';
        holder.append(canvas); scene.before(holder);
        background = {holder, canvas, frame};
        refreshBackground();
      }
    }
    // Hiding the page scrollbar must not shift the frozen scene or heading.
    const body = document.body;
    const pageWidth = document.documentElement?.getBoundingClientRect?.().width ?? document.documentElement?.clientWidth ?? window.innerWidth;
    const gap = Math.max(0, window.innerWidth - pageWidth);
    if (gap > .5 && body?.style?.getPropertyValue) {
      savedPadding = {value: body.style.getPropertyValue('padding-right'), priority: body.style.getPropertyPriority('padding-right')};
      body.style.setProperty('padding-right', `calc(${getComputedStyle(body).paddingRight || '0px'} + ${gap}px)`, savedPadding.priority);
    }
  }
  function specFor(kind) {
    const icon = kind === 'close' ? closeButton.querySelector('.close-icon') : nextButton.querySelector('span');
    const band = dialog.querySelector(kind === 'close' ? '.panel-top' : '.panel-bottom');
    const size = viewport();
    const spec = modalControlSpec(kind, panel.getBoundingClientRect(), band.getBoundingClientRect(), icon.getBoundingClientRect(), size);
    // A landscape phone keeps its compact reach while that touch target
    // withdraws, even if a later gesture has already selected the close icon.
    if (kind === 'next' && Math.min(size.width, size.height) <= 700) {
      spec.mobileNext ||= touch?.kind === kind || getRobot()?.getModalState()?.mobileNext === true;
    }
    return spec;
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
    const kind = touch?.kind || hovered || focused;
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
  function cancelTouch() {
    cancelAnimationFrame(activationFrame); activationFrame = 0;
    clearTimeout(activationTimer); activationTimer = 0;
    clearTimeout(releaseTimer); releaseTimer = 0;
    activation = null; touch = null;
  }
  function settlePanelEntrance() {
    // An early tap should aim at the final button position rather than refit
    // the whole robot against every moving frame of the entrance animation.
    for (const animation of panel.getAnimations?.() || []) {
      if (animation.animationName === 'panel-in' && animation.playState !== 'finished') animation.finish();
    }
  }
  function activate(kind, action, event) {
    if (!active || !dialog.open) return;
    if (cancelledKind === kind && (event?.pointerType === 'touch' || event?.detail > 0)) return;
    // Touch has no hover interval. Keep a single tap's target visible briefly
    // before navigation; mouse and keyboard clicks retain their direct action.
    const fromTouch = event?.pointerType === 'touch' || (event?.detail > 0 && touch?.kind === kind);
    if (!fromTouch || !getRobot()) { cancelTouch(); action(); return; }
    if (activation?.kind === kind) return;
    settlePanelEntrance();
    const pointer = touch;
    cancelTouch();
    touch = pointer || { kind };
    touch.kind = kind;
    hovered = null; focused = null;
    const queued = { kind };
    activation = queued;
    const mobileNext = kind === 'next' && specFor(kind).mobileNext;
    const contactDwell = mobileNext ? 40 : 45;
    let settledAt = null;
    function finish() {
      if (activation !== queued) return;
      cancelTouch();
      if (!active || !dialog.open) return;
      action(); refresh();
    }
    function waitForContact() {
      if (activation !== queued) return;
      const state = getRobot()?.getModalState();
      const atControl = state?.kind === kind && state.phase === 'hold' && state.visible;
      if (atControl) {
        settledAt ??= performance.now();
        if (performance.now() - settledAt >= contactDwell) { finish(); return; }
      } else settledAt = null;
      activationFrame = requestAnimationFrame(waitForContact);
    }
    refresh();
    // Reaching starts at pointerdown. Only a valid released click may request
    // the final physical press; a long hold stays at the precontact pose.
    if (mobileNext) getRobot()?.requestModalPress?.(specFor(kind));
    activationFrame = requestAnimationFrame(waitForContact);
    // A cold/slow frame still gets a real contact frame before navigation.
    activationTimer = setTimeout(() => {
      if (activation !== queued) return;
      let completed = false;
      try { completed = getRobot()?.completeModalAim?.(specFor(kind)); }
      catch { finish(); return; }
      if (completed) {
        settledAt = performance.now();
        activationTimer = setTimeout(finish, mobileNext ? 40 : 60);
      } else finish();
    }, 650);
  }
  function open() {
    if (active) { refresh(); return; }
    prepare();
    cancelTouch();
    cancelledKind = null;
    active = true;
    hovered = null; focused = null; lastKind = null;
    scene.classList.add('modal-scene');
    scene.setAttribute('aria-hidden', 'true');
    hideScene();
    dialog.append(scene);
    // Native showModal() initially focuses the close button. Begin at rest.
    panel.focus({ preventScroll: true });
    // Native dialog autofocus can scroll even a page with overflow:hidden.
    restoreHomeScroll();
    refreshBackground();
    enterRobotMode();
    refresh();
  }
  function close() {
    cancelTouch();
    cancelledKind = null;
    if (!active && !robotInModal && !prepared) return;
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
    document.body?.classList.remove('modal-open');
    if (savedPadding) {
      if (savedPadding.value) document.body.style.setProperty('padding-right', savedPadding.value, savedPadding.priority);
      else document.body.style.removeProperty('padding-right');
      savedPadding = null;
    }
    for (const button of Object.values(controls)) button.classList.remove('is-robot-target');
    robot?.resize();
    restoreHomeScroll();
    // Reveal the returned live canvas only after its home frame is painted.
    robot?.renderHomeFrame?.();
    if (background) { background.holder.remove(); background.canvas.width = background.canvas.height = 0; background = null; }
    prepared = false;
    savedScroll = null;
  }
  listen(dialog, 'keydown', event => {
    if (event.key === 'Tab') { cancelTouch(); keyboard = true; refresh(); }
  });
  listen(dialog, 'pointerdown', event => {
    keyboard = false; focused = null; cancelledKind = null;
    if (event.pointerType !== 'touch' || touch?.pointerId !== event.pointerId || !controls[touch?.kind]?.contains(event.target)) cancelTouch();
    refresh();
  });
  listen(dialog, 'pointermove', event => {
    if (!touch || touch.pointerId !== event.pointerId) return;
    const rect = controls[touch.kind].getBoundingClientRect();
    const moved = Math.hypot(event.clientX - touch.x, event.clientY - touch.y) > 12;
    const outside = event.clientX < rect.left - 12 || event.clientX > rect.right + 12 || event.clientY < rect.top - 12 || event.clientY > rect.bottom + 12;
    if (moved || outside) { cancelledKind = touch.kind; cancelTouch(); refresh(); }
  });
  listen(dialog, 'pointercancel', event => {
    if (touch?.pointerId === event.pointerId) { cancelledKind = touch.kind; cancelTouch(); refresh(); }
  });
  listen(dialog, 'pointerup', event => {
    if (touch?.pointerId !== event.pointerId || activation) return;
    // Native click follows pointerup; allow it to claim the held target.
    releaseTimer = setTimeout(() => { cancelTouch(); refresh(); }, 400);
  });
  listen(dialog, 'contextmenu', () => { cancelledKind = touch?.kind || null; cancelTouch(); refresh(); });
  for (const [kind, button] of Object.entries(controls)) {
    listen(button, 'pointerdown', event => {
      if (!active || event.pointerType !== 'touch' || event.isPrimary === false) return;
      cancelTouch();
      // Every new touch needs its own released click. Retire an earlier
      // compact press before re-aiming, including same-button double taps.
      if (kind === 'next') {
        const robot = getRobot();
        if (robot?.getModalState()?.mobileNext) robot.resetModalAim();
      }
      cancelledKind = null;
      settlePanelEntrance();
      touch = { kind, pointerId: event.pointerId, x: event.clientX, y: event.clientY };
      hovered = null; focused = null;
      refresh();
    });
    listen(button, 'pointerenter', event => {
      if (active && event.pointerType !== 'touch') { hovered = kind; refresh(); }
    });
    listen(button, 'pointerleave', event => {
      if (event.pointerType === 'touch') return;
      if (hovered === kind) hovered = null;
      refresh();
    });
    listen(button, 'focus', () => {
      if (active && !touch && (keyboard || button.matches(':focus-visible'))) { focused = kind; refresh(); }
    });
    listen(button, 'blur', () => { if (focused === kind) focused = null; refresh(); });
  }
  listen(window, 'resize', () => { if (active) { getRobot()?.resize(); refreshBackground(); refresh(); } });
  listen(dialog.querySelector('.panel-content'), 'scroll', refresh);
  return {
    prepare, open, close, refresh, activate,
    destroy() { close(); listeners.forEach(remove => remove()); home.remove(); },
  };
}

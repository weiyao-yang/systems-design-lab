// Explicit list keeps local tooling, Git metadata, and private configuration
// out of the public deployment. Runtime code remains directly editable.
export const websiteFiles = [
  'index.html',
  'assets/tic-tac-toe.svg',
  'styles.css',
  'app.js',
  'content.js',
  'robot.js',
  'modal-rig.js',
  'modal-interaction.js',
  'robot-drawing.js',
  'robot-internals.js',
  'three.module.js',
  'THREE-LICENSE.txt',
  '.nojekyll',
];

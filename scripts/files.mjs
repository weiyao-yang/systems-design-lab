// Explicit list keeps local tooling, Git metadata, and private configuration
// out of the public deployment. Runtime code remains directly editable.
export const websiteFiles = [
  'index.html',
  'styles.css',
  'app.js',
  'content.js',
  'robot.js',
  'three.module.js',
  'THREE-LICENSE.txt',
  '.nojekyll',
];

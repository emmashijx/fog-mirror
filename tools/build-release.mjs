import { cp, mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const root = fileURLToPath(new URL('../', import.meta.url));
const staging = await mkdtemp(join(root, '.release-build-'));
const assetNames = [
  'style.css',
  'tracking-worker.js',
  'vendor/LICENSE',
  'vendor/face_landmarker.task',
  'vendor/gesture_recognizer.task',
  'vendor/vision_bundle.mjs',
  'vendor/wasm',
];
const devSection = /^[\t ]*<!-- development:begin -->\r?\n[\s\S]*?^[\t ]*<!-- development:end -->\r?\n/gm;
const clearMirror = '<button class="button record" id="reset-interaction" type="button" disabled>Clear mirror</button>';

try {
  const template = await readFile(join(root, 'app/index.html'), 'utf8');
  const html = template.replace(devSection, '')
    .replace('<!-- release:clear-mirror -->', clearMirror)
    .replaceAll('?v=release-build', '');
  if (html.includes('<!-- development:') || !html.includes(clearMirror) ||
      /id="(?:recognition-mode|debug-overlay|fah-details)"/.test(html)) {
    throw new Error('Unexpected development controls in the release template.');
  }

  const result = await build({
    absWorkingDir: root,
    entryPoints: ['app/app.js', 'app/vision.js'],
    outdir: staging,
    bundle: true,
    format: 'esm',
    target: 'es2022',
    define: { 'import.meta.release': 'true' },
    minifySyntax: true,
    metafile: true,
    external: ['./vision.js', './vendor/*'],
  });
  const developmentModule = /\b(?:debug-overlay|fah-metrics|fah-tracker|legacy-gestures)\.js\b/;
  for (const { inputs } of Object.values(result.metafile.outputs)) {
    for (const [path, { bytesInOutput }] of Object.entries(inputs)) {
      if (bytesInOutput && developmentModule.test(path)) {
        throw new Error('Development module included in release: ' + path);
      }
    }
  }
  const vision = await readFile(join(staging, 'vision.js'), 'utf8');
  if (!vision.includes('gesture_recognizer.task') || vision.includes('hand_landmarker.task')) {
    throw new Error('The release must use Gesture Recognizer for hands.');
  }
  const application = await readFile(join(staging, 'app.js'), 'utf8');
  if (/\/api\/fah\/|debug-overlay|recognition-mode/.test(application)) {
    throw new Error('Development code left in the release bundle.');
  }

  await writeFile(join(staging, 'index.html'), html);
  await Promise.all(assetNames.map(name => cp(join(root, 'app', name), join(staging, name), {
    recursive: true,
  })));
  const output = join(root, 'dist');
  await rm(output, { recursive: true, force: true });
  await rename(staging, output);
  console.log('Fog Mirror release built in dist/');
} finally {
  await rm(staging, { recursive: true, force: true });
}

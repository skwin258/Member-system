import { spawnSync } from 'node:child_process';
import { cp, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const workspace = new URL('../../', import.meta.url);
const output = new URL('../raffle-web/public/arcade/', import.meta.url);

function build(directory, args) {
  const project = new URL(directory + '/', workspace);
  const vite = fileURLToPath(new URL('node_modules/vite/bin/vite.js', project));
  const run = spawnSync(process.execPath, [vite, 'build', '--configLoader', 'runner', ...args], {
    cwd: fileURLToPath(project), stdio: 'inherit', windowsHide: true,
  });
  if (run.error) throw run.error;
  if (run.status !== 0) throw new Error('Arcade build failed: ' + directory);
}

await mkdir(new URL('assets/', output), { recursive: true });
await cp(new URL('index.html', workspace), new URL('index.html', output));
for (const file of [
  'egypt-reaction-torch.glb', 'egypt-six-covers.png', 'fast-reaction.png',
  'golden-temple-claw.png', 'golden-temple-football.png', 'number-chase.js',
  'number-chase.png', 's-wallet.js', 'temple-background.jpg',
]) {
  await cp(new URL('assets/' + file, workspace), new URL('assets/' + file, output));
}

for (const [directory, subdirectory, options] of [
  ['claw-engine', 'claw', []],
  ['claw-engine', 'reaction', ['--config', 'vite.torch.config.js']],
  ['treasure-games', 'treasure', []],
]) {
  build(directory, [
    '--base', '/arcade/' + subdirectory + '/',
    '--outDir', fileURLToPath(new URL(subdirectory + '/', output)),
    '--emptyOutDir', ...options,
  ]);
}

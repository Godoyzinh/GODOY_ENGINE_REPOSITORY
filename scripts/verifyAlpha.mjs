import { spawnSync } from 'node:child_process';

const checks = [
  ['build', ['run', 'build']],
  ['production build smoke', ['run', 'smoke:production-build']],
  ['runtime config smoke', ['run', 'smoke:runtime-config']],
  ['WebGL fallback smoke', ['run', 'smoke:webgl']],
  ['AI director smoke', ['run', 'smoke:ai-director']],
  ['autonomous playtest smoke', ['run', 'smoke:autoplaytest']],
  ['settings smoke', ['run', 'smoke:settings']],
  ['camera/collision smoke', ['run', 'smoke:camera']],
  ['visual/game-feel smoke', ['run', 'smoke:visual']],
  ['inventory initialization smoke', ['run', 'smoke:inventory-init']],
  ['inventory smoke', ['run', 'smoke:inventory']],
  ['save migration smoke', ['run', 'smoke:save']],
  ['multiplayer smoke', ['run', 'smoke:multiplayer']],
];

for (const [label, args] of checks) {
  console.log(`\n[verify:alpha] ${label}`);

  const result = spawnNpm(args);

  if (result.error) {
    console.error(result.error.message);
  }

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

console.log('\n[verify:alpha] all checks passed');

function spawnNpm(args) {
  if (process.platform === 'win32') {
    return spawnSync('cmd.exe', ['/d', '/s', '/c', `npm.cmd ${args.join(' ')}`], {
      stdio: 'inherit',
      shell: false,
    });
  }

  return spawnSync('npm', args, {
    stdio: 'inherit',
    shell: false,
  });
}

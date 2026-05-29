import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

const distDirectory = path.resolve('dist');
const assetsDirectory = path.join(distDirectory, 'assets');
const indexPath = path.join(distDirectory, 'index.html');

assert.equal(existsSync(indexPath), true, 'dist/index.html should exist after production build');
assert.equal(existsSync(assetsDirectory), true, 'dist/assets should exist after production build');

const indexHtml = await readFile(indexPath, 'utf8');
const assetFiles = await readdir(assetsDirectory);
const javascriptFiles = assetFiles.filter((fileName) => fileName.endsWith('.js'));
const cssFiles = assetFiles.filter((fileName) => fileName.endsWith('.css'));

assert.match(indexHtml, /Godoy Engine/);
assert.match(indexHtml, /Public Alpha v0\.1\.0-alpha/);
assert.ok(javascriptFiles.length >= 1, 'production build should emit JavaScript assets');
assert.ok(cssFiles.length >= 1, 'production build should emit CSS assets');
assert.equal(hasLocalAbsolutePath(indexHtml), false, 'index.html must not contain local absolute paths');

for (const assetFile of assetFiles) {
  const content = await readFile(path.join(assetsDirectory, assetFile), 'utf8').catch(() => '');

  assert.equal(hasLocalAbsolutePath(content), false, `${assetFile} must not contain local absolute paths`);
  assert.equal(hasSecretLikeToken(content), false, `${assetFile} must not contain committed secret-like tokens`);
}

console.log('smoke:production-build ok');

function hasLocalAbsolutePath(content) {
  return /C:\\Users\\|\/Users\/|\/home\//.test(content);
}

function hasSecretLikeToken(content) {
  return /(ghp_|sk-[A-Za-z0-9]|api[_-]?key\s*[:=]\s*['"][^'"]{12,})/i.test(content);
}

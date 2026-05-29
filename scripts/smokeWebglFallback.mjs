import assert from 'node:assert/strict';
import { createBootFallbackMarkup } from '../src/ui/bootFallback.js';

const markup = createBootFallbackMarkup('GPU <missing> & blocked');

assert.match(markup, /WebGL could not start/);
assert.match(markup, /hardware acceleration/);
assert.match(markup, /GPU &lt;missing&gt; &amp; blocked/);
assert.equal(markup.includes('<missing>'), false);

console.log('smoke:webgl-fallback ok');

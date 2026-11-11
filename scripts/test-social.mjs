// Unit tests for the daily post caption (src/lib/social/compose.ts).
// The repo has no test runner, so the two pure modules are transpiled with the
// project's own TypeScript into a temp folder and checked with node:test.
// Run: npm test
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import ts from 'typescript';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..');
const out = mkdtempSync(path.join(tmpdir(), 'social-test-'));
for (const name of ['caption-bank', 'compose']) {
  const source = readFileSync(path.join(root, 'src/lib/social', `${name}.ts`), 'utf8');
  const js = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  writeFileSync(path.join(out, `${name}.js`), js);
}
const require = createRequire(path.join(out, 'x.js'));
const { composeCaption, chooseCaption, SKIPPED_TEMPLATES, TEMPLATE_REPEAT_WINDOW } = require('./compose.js');
const { CAPTION_BANK } = require('./caption-bank.js');

const shoe = { id: 'abc123', name: 'نايكي باندا فلين', price: 55000, category: 'shoes' };
const shirt = { id: 'shirt9', name: 'قميص كاروهات', price: 30000, category: 'clothing' };
const url = 'https://shop.mtozero.com/p/abc123';

const cases = [
  { label: 'new', kind: 'new', item: shoe, sizes: ['41', '42', '43'] },
  { label: 'last, one size', kind: 'last', item: shoe, sizes: ['42'] },
  { label: 'last, several sizes', kind: 'last', item: shirt, sizes: ['M', 'XL'] },
  { label: 'spotlight', kind: 'spotlight', item: shirt, sizes: ['M', 'L', 'XL'] },
];

for (const c of cases) {
  test(`${c.label}: no placeholders, true sizes and price, new template`, () => {
    const previous = chooseCaption({ kind: c.kind, item: c.item, sizes: c.sizes, productUrl: url, history: [], day: '2026-11-10' });
    const history = [{ templateId: previous.templateId, questionIndex: previous.questionIndex, hashtagIndex: previous.hashtagIndex, postedAtMs: 1 }];
    const { caption, meta } = composeCaption({ kind: c.kind, item: c.item, sizes: c.sizes, productUrl: url, history, day: '2026-11-11' });

    assert.ok(!caption.includes('{') && !caption.includes('}'), caption);
    assert.ok(caption.includes(c.item.price.toLocaleString('en-US')), 'price with thousands commas');
    if (c.sizes.length > 1) assert.ok(caption.includes(c.sizes.join('، ')) || !/\{sizes\}/.test(templateText(meta.templateId)), 'all in-stock sizes');
    else assert.ok(caption.includes(c.sizes[0]), 'the single size');
    assert.notEqual(meta.templateId, previous.templateId, 'differs from the previous post');
    assert.ok(!(meta.templateId in SKIPPED_TEMPLATES), 'never a skipped template');
    const prefix = c.kind === 'last' ? (c.sizes.length === 1 ? 'ls-' : 'lm-') : c.kind === 'new' ? 'new-' : 'sp-';
    assert.ok(meta.templateId.startsWith(prefix), `template group for ${c.label}`);
  });
}

test('same inputs on the same day give the same caption', () => {
  const input = { kind: 'spotlight', item: shoe, sizes: ['41'], productUrl: url, history: [], day: '2026-11-11' };
  assert.equal(composeCaption(input).caption, composeCaption(input).caption);
});

test('no template from the last six posts, no question from the last four', () => {
  const ids = CAPTION_BANK.templates.spotlight.map((t) => t.id);
  const history = ids.slice(0, TEMPLATE_REPEAT_WINDOW).map((templateId, i) => ({ templateId, questionIndex: i, hashtagIndex: 0, postedAtMs: 100 - i }));
  for (const day of ['2026-11-11', '2026-11-12', '2026-11-13', '2026-11-14']) {
    const { meta } = composeCaption({ kind: 'spotlight', item: shirt, sizes: ['M'], productUrl: url, history, day });
    assert.ok(!ids.slice(0, TEMPLATE_REPEAT_WINDOW).includes(meta.templateId), meta.templateId);
    if (meta.questionIndex >= 0) assert.ok(![0, 1, 2, 3].includes(meta.questionIndex), String(meta.questionIndex));
  }
});

function templateText(id) {
  return Object.values(CAPTION_BANK.templates).flat().find((t) => t.id === id).text;
}

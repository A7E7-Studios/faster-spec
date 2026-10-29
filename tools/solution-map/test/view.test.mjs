import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { adapt } from '../lib/adapt.mjs';
import { renderPage, parseLocation, pathFor, searchFeatures, triageText, featurePage, settle } from '../page/view.mjs';

const sample = () => JSON.parse(fs.readFileSync(new URL('./fixtures/overview-v3.json', import.meta.url), 'utf8'));
const ui = (o = {}) => ({ tab: 'waiting', group: 'domain', sel: null, q: '', ...o });

test('copy for triage names the feature, its changes and what to look at', () => {
  const vm = adapt(sample());
  const t = triageText(vm, 'editing/offline-edits');
  assert.match(t, /^Triage the feature "Offline edits" \(editing\/offline-edits\), now unreviewed, in /);
  assert.match(t, /example\/notes-app and example\/notes-api/);
  assert.match(t, /offline-banner-delay \(#41, a91c3e0\)/);
  assert.match(t, /What to look at: At the desk: open a note/);
  assert.match(triageText(vm, 'accounts/sign-in'), /No change names it/);
  const html = renderPage(vm, ui({ sel: 'editing/offline-edits' }));
  assert.match(html, /data-copy="editing\/offline-edits"/);
});

test('nothing waiting says so and points at untested scenarios', () => {
  const ov = sample();
  for (const c of ov.capabilities) c.review = 'approved';
  const vm = adapt(ov);
  assert.deepEqual(vm.waiting, []);
  const html = renderPage(vm, ui());
  assert.match(html, /Nothing waits for you/);
  assert.match(html, /2 of 11 scenarios have no test yet, in 2 features: Offline edits, Markdown import/);
});

test('an approved feature folds its behaviour away', () => {
  const vm = adapt(sample(), { webs: { app: 'https://github.com/example/notes-app' } });
  const html = featurePage(vm, 'importing/markdown-import', ui({ tab: 'explore' }));
  assert.match(html, /<h3 class="s-h2">Summary<\/h3>/);
  assert.match(html, /<details class="beh"><summary>Behaviour <span class="s-faint">1 requirement · 3 scenarios · 2 tested/);
  assert.doesNotMatch(html, /<details class="beh" open/);
  assert.match(html, /✓ test: tools\/importer\/markdown\/headings\.test\.ts/);
  assert.match(html, /untested/);
  assert.match(html, /ships in<\/span><span class="sys">Importer<\/span>/);
  assert.match(html, /tools\/importer\/markdown\//);
  assert.match(html, /Approved 12 Oct in #30/);
});

test('a page line that does not answer becomes a placeholder', () => {
  const ov = sample();
  const down = adapt(ov, { pages: 'http://localhost:5173', pageAnswers: { 'http://localhost:5173/notes/demo': false } });
  const html = renderPage(down, ui({ sel: 'editing/offline-edits' }));
  assert.match(html, /The page won’t open<\/b>Nothing answers at <span class="mono">http:\/\/localhost:5173\/notes\/demo/);
  assert.match(html, /The live pages don’t open: nothing answers at <span class="mono">http:\/\/localhost:5173<\/span>/);
  const up = renderPage(adapt(ov, { pages: 'http://localhost:5173', pageAnswers: { 'http://localhost:5173/notes/demo': true } }), ui({ sel: 'editing/offline-edits' }));
  assert.match(up, /<iframe class="frame" sandbox="allow-scripts allow-forms allow-same-origin" src="http:\/\/localhost:5173\/notes\/demo"/);
  assert.match(up, /<iframe class="frame" sandbox src="\/board\/app\/specs\/editing\/offline-edits\/looks\/offline-banner\.html\?section=banner"/);
  const nobase = renderPage(adapt(ov), ui({ sel: 'editing/offline-edits' }));
  assert.match(nobase, /the project names no address for its pages/);
});

test('search finds features by title, summary, requirement, scenario and system', () => {
  const vm = adapt(sample());
  const where = (q) => Object.fromEntries(searchFeatures(vm, q).map(([k, w]) => [k, w]));
  assert.deepEqual(where('tables'), { 'editing/tables': 'Title' });
  assert.equal(where('30 days')['accounts/sign-in'], 'Summary');
  assert.equal(where('headings and links')['importing/markdown-import'], 'Requirement');
  assert.equal(where('expired link')['sharing/share-links'], 'Scenario');
  assert.equal(where('folder of markdown')['importing/markdown-import'], 'Summary');
  assert.deepEqual(where('importer'), { 'importing/markdown-import': 'Requirement', 'importing/import-report': 'Requirement' });
  assert.equal(where('web app')['accounts/audit-log'], 'Ships in');
  const html = renderPage(vm, ui({ tab: 'search', q: 'tables' }));
  assert.match(html, /Results for “tables” <span class="n">1/);
  assert.match(html, /<mark>Tables<\/mark>/);
  assert.match(renderPage(vm, ui({ tab: 'search', q: 'zebra' })), /No feature matches “zebra”/);
});

test('every view has its own address', () => {
  const vm = adapt(sample());
  const states = [
    ui({ sel: 'sharing/share-links' }),
    ui({ tab: 'explore', sel: 'importing/import-report' }),
    ui({ tab: 'explore', group: 'system', sel: 'importing/import-report' }),
    ui({ tab: 'search', q: 'link', sel: 'sharing/share-links' }),
  ];
  const paths = states.map((s) => pathFor(s, vm));
  assert.deepEqual(paths, [
    '/waiting/sharing/share-links',
    '/explore/importing/import-report',
    '/explore/by-system/importer/importing/import-report',
    '/search/sharing/share-links?q=link',
  ]);
  for (let i = 0; i < states.length; i++) {
    const [p, s] = paths[i].split('?');
    assert.deepEqual(settle(vm, parseLocation(p, s ? '?' + s : '')), settle(vm, states[i]));
  }
  assert.deepEqual(parseLocation('/'), ui());
});

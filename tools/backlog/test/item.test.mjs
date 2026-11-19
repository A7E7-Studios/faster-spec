import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseItem, writeItem, newId, asciiFold, itemProblem, utcMinute, utcDate } from '../lib/item.mjs';

const ITEM = `---
title: Export a note as PDF
by: Pat Example
created: 2026-11-19
state: discussing
about:
  - editing/export
  - editing/offline-edits
change:
  - export-pdf
---

## What happens

Sharing a note sends a link only.

People without an account cannot open it.

## What should happen

Share offers "PDF", which saves the note as one file.

## Where

The share sheet on a note, at https://example.com/notes/share

## Notes

### Pat Example · 2026-11-19 14:05 UTC

First thought.

### Sam Example · 2026-11-20 09:30 UTC

A second one, with code:

\`\`\`
## not a heading in a fence
\`\`\`
`;

test('an item file reads into its fields and writes back unchanged', () => {
  const item = parseItem(ITEM, { id: 'export-a-note-as-pdf' });
  assert.deepEqual(item.problems, []);
  assert.equal(item.title, 'Export a note as PDF');
  assert.equal(item.by, 'Pat Example');
  assert.equal(item.created, '2026-11-19');
  assert.equal(item.state, 'discussing');
  assert.deepEqual(item.about, ['editing/export', 'editing/offline-edits']);
  assert.deepEqual(item.change, ['export-pdf']);
  assert.equal(item.happens, 'Sharing a note sends a link only.\n\nPeople without an account cannot open it.');
  assert.equal(item.where, 'The share sheet on a note, at https://example.com/notes/share');
  assert.equal(item.notes.length, 2);
  assert.deepEqual(item.notes[0], { by: 'Pat Example', at: '2026-11-19 14:05', text: 'First thought.' });
  assert.match(item.notes[1].text, /## not a heading in a fence/);
  assert.equal(writeItem(item), ITEM);
});

test('a note heading is the author, the time to the minute and UTC', () => {
  const item = parseItem(ITEM, { id: 'x' });
  item.notes.push({ by: 'Lee Example', at: utcMinute(new Date('2026-12-01T08:07:59Z')), text: 'Third.' });
  const text = writeItem(item);
  assert.ok(text.endsWith('### Lee Example · 2026-12-01 08:07 UTC\n\nThird.\n'));
  assert.equal(utcDate(new Date('2026-12-01T23:59:00-05:00')), '2026-12-02');
  const bad = ITEM.replace('### Pat Example · 2026-11-19 14:05 UTC', '### Pat Example, yesterday');
  assert.match(parseItem(bad, { id: 'x' }).problems[0].message, /note heading/);
  const late = ITEM.replace('14:05 UTC', '25:05 UTC');
  assert.match(parseItem(late, { id: 'x' }).problems[0].message, /note heading/);
});

test('empty sections and lists write as their headings and keys alone, and read back', () => {
  const item = { id: 'a', title: 'A', by: 'Pat Example', created: '2026-11-19', state: 'new', about: [], change: [], happens: '', should: '', where: '', notes: [] };
  const text = writeItem(item);
  assert.equal(text, '---\ntitle: A\nby: Pat Example\ncreated: 2026-11-19\nstate: new\nabout:\nchange:\n---\n\n## What happens\n\n## What should happen\n\n## Where\n\n## Notes\n');
  const back = parseItem(text, { id: 'a' });
  assert.deepEqual(back.problems, []);
  assert.deepEqual({ ...back, problems: undefined }, { ...item, problems: undefined });
});

test('a person\'s text cannot break the file: headings are escaped, fences closed', () => {
  const item = {
    id: 'a', title: '"Quoted" title', by: 'Pat Example', created: '2026-11-19', state: 'new', about: [], change: [],
    happens: '## Notes\nstill what happens', should: '```\nan open fence', where: '', notes: [{ by: 'Sam Example', at: '2026-11-19 10:00', text: '### Someone Else · 2026-11-19 11:00 UTC\nnot a note' }],
  };
  const text = writeItem(item);
  assert.match(text, /^\\## Notes$/m);
  assert.match(text, /^\\### Someone Else/m);
  const back = parseItem(text, { id: 'a' });
  assert.deepEqual(back.problems, []);
  assert.equal(back.title, '"Quoted" title');
  assert.equal(back.happens, '## Notes\nstill what happens');
  assert.equal(back.should, '```\nan open fence\n```');
  assert.equal(back.notes.length, 1);
  assert.equal(back.notes[0].text, '### Someone Else · 2026-11-19 11:00 UTC\nnot a note');
  assert.equal(writeItem(back), text);
});

test('a file that breaks the format reads with its problems', () => {
  const cases = [
    [ITEM.replace('state: discussing', 'state: done'), /state "done"/],
    [ITEM.replace('by: Pat Example\n', ''), /lacks "by"/],
    [ITEM.replace('created: 2026-11-19', 'created: 2026-02-30'), /not a date/],
    [ITEM.replace('title:', 'labels: x\ntitle:'), /unknown front matter key "labels"/],
    [ITEM.replace('  - editing/export\n', '  - Export\n'), /not a feature id/],
    [ITEM.replace('## Where', '## Links'), /not a section/],
    [ITEM.replace('## Where\n', '## What happens\n'), /appears twice/],
    [ITEM.replace('## What happens', '## Where').replace('## Where\n\nThe share', '## What happens\n\nThe share'), /out of order/],
    [ITEM.replace('\n## What happens', '# A title\n\n## What happens'), /text before/],
    [ITEM.replace('## Notes\n', '## Notes\n\nloose text\n'), /before the first note/],
    ['no front matter\n', /no front matter/],
  ];
  for (const [text, re] of cases) {
    const item = parseItem(text, { id: 'x' });
    assert.ok(item.problems.some((p) => re.test(p.message)), `${re}: ${JSON.stringify(item.problems)}`);
  }
  assert.match(parseItem(ITEM, { id: 'Not_An_Id' }).problems[0].message, /not a kebab-case id/);
});

test('writing refuses an item that breaks the format', () => {
  const item = parseItem(ITEM, { id: 'x' });
  assert.equal(itemProblem(item), null);
  assert.throws(() => writeItem({ ...item, state: 'in-progress' }), /state/);
  assert.throws(() => writeItem({ ...item, title: '  ' }), /title/);
  assert.throws(() => writeItem({ ...item, change: ['Not An Id'] }), /change id/);
});

test('an id is the title in kebab-case, ASCII-folded, at most 60 characters', () => {
  assert.equal(newId('Export a note as PDF'), 'export-a-note-as-pdf');
  assert.equal(newId('  Crème brûlée, smørrebrød, Æble & łódka: straße!  '), 'creme-brulee-smorrebrod-aeble-lodka-strasse');
  assert.equal(asciiFold('ÉÇÑ'), 'ecn');
  assert.equal(newId('日本語'), 'request');
  // Cut at 60 where a word ends there, else at the last word that fits.
  assert.equal(newId('Show every note that was edited offline while the device had no connection'), 'show-every-note-that-was-edited-offline-while-the-device-had');
  assert.equal(newId('Show every note that was edited offline while the device hadnt any connection'), 'show-every-note-that-was-edited-offline-while-the-device');
  assert.equal(newId('x'.repeat(80)), 'x'.repeat(60));
});

test('a taken id gets -2, -3, still within 60 characters', () => {
  assert.equal(newId('Export a note', ['export-a-note']), 'export-a-note-2');
  assert.equal(newId('Export a note', new Set(['export-a-note', 'export-a-note-2'])), 'export-a-note-3');
  const title = 'a'.repeat(60);
  const id = newId(title, [title]);
  assert.equal(id, `${'a'.repeat(58)}-2`);
  assert.equal(id.length, 60);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { blockGroups, blockHtml, cleanImage, cleanLink, sectionBlocks } from '../ui/studio-blocks.js';
import { renderPublic, sanitizeHtml } from '../studio-site.mjs';

const ids = blockGroups.flatMap(([, items]) => items.map(([id]) => id));

test('Every block survives saving, has one root element and no script or screen height', () => {
  assert.equal(new Set(ids).size, ids.length, 'ids are unique');
  for (const id of ids) {
    const html = blockHtml(id, { accent: '#a8432a', onAccent: '#ffffff' });
    const page = `<!doctype html>\n<html lang="pt-BR"><body><main>${html}</main></body></html>`;
    assert.equal(sanitizeHtml(page), page, `${id}: the sanitizer keeps it whole`);
    assert.doesNotMatch(html, /\d[sld]?vh\b|<script|\son[a-z]+=/i, id);
    const root = html.match(/^<([a-z0-9]+)/)[1];
    assert.equal(root === 'section', sectionBlocks.includes(id), `${id}: only section blocks are sections`);
    if (root !== 'img' && root !== 'hr') assert.ok(html.endsWith(`</${root}>`), `${id}: one root`);
  }
  assert.equal(blockHtml('nao-existe'), '');
});

test('Buttons follow the page: its own button class, or its accent colour escaped', () => {
  assert.equal(blockHtml('button', { buttonClass: 'btn' }), '<a class="btn" href="#">Novo botão</a>');
  assert.match(blockHtml('button', { accent: 'rgb(1, 2, 3)' }), /background:rgb\(1, 2, 3\)/);
  assert.doesNotMatch(blockHtml('button', { accent: '"><img src=x>' }), /"><img/);
});

test('Form blocks become real lead forms on the published page', () => {
  const html = renderPublic({ slug: 'index', html: `<!doctype html><body>${blockHtml('contact')}</body>` }, { base: '/s/w/p' });
  assert.match(html, /<form data-go-lead[^>]* action="\/s\/w\/p" method="post">/);
  for (const name of ['name', 'email', 'phone']) assert.match(html, new RegExp(`name="${name}"`));
});

test('Links and photos accept safe addresses only', () => {
  for (const ok of ['https://wa.me/5511999990000', 'mailto:a@b.co', 'tel:+55 11 99999-0000', 'page:contato', 'page:index#servicos', '#orcamento']) assert.equal(cleanLink(ok), ok);
  assert.equal(cleanLink('graao.com/planos'), 'https://graao.com/planos');
  for (const bad of ['javascript:alert(1)', 'data:text/html,x', 'JaVaScRiPt:x', 'https://a.co/"onclick=', 'texto solto', '']) assert.equal(cleanLink(bad), '', bad);
  assert.equal(cleanImage(' https://images.example.test/a.jpg '), 'https://images.example.test/a.jpg');
  for (const bad of ['http://a.co/a.jpg', 'data:image/png;base64,x', 'javascript:x', '']) assert.equal(cleanImage(bad), '', bad);
});

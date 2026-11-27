import test from 'node:test';
import assert from 'node:assert/strict';
import { codeFromText, hashCode, newCode, normalizePhone, phoneKey, verifyLink } from '../phone-verify.mjs';

test('Brasil sem o nono dígito vira o mesmo número', () => {
  assert.equal(normalizePhone('(31) 8123-4567'), '5531981234567');
  assert.equal(normalizePhone('+55 31 98123-4567'), '5531981234567');
  assert.equal(normalizePhone('5531981234567'), '5531981234567');
  assert.equal(normalizePhone('553181234567'), '5531981234567');
});

test('Fixo, curto ou estrangeiro curto é inválido; estrangeiro válido fica como veio', () => {
  assert.equal(normalizePhone('31 3333-4444'), '');
  assert.equal(normalizePhone('123'), '');
  assert.equal(normalizePhone(''), '');
  assert.equal(normalizePhone(undefined), '');
  assert.equal(normalizePhone('+351 912 345 678'), '351912345678');
});

test('A chave do celular é um hash estável que não mostra o número', () => {
  const key = phoneKey('5531981234567');
  assert.match(key, /^phone-[0-9a-f]{64}$/);
  assert.equal(key, phoneKey('5531981234567'));
  assert.notEqual(key, phoneKey('5531981234568'));
  assert.ok(!key.includes('5531981234567'));
});

test('O código sai do texto em qualquer caixa e com espaços', () => {
  assert.equal(codeFromText('confirmar GRAAO  ab3k9z'), 'AB3K9Z');
  assert.equal(codeFromText('Confirmar graao AB3K9Z obrigado'), 'AB3K9Z');
  assert.equal(codeFromText('oi'), '');
  assert.equal(codeFromText(null), '');
});

test('Código usa só o alfabeto sem ambiguidade e o hash não é o código', () => {
  const { code, hash } = newCode();
  assert.match(code, /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/);
  assert.equal(hash, hashCode(code));
  assert.notEqual(hash, code);
  assert.equal(hashCode('ab3k9z'), hashCode('AB3K9Z'));
});

test('O link abre o WhatsApp com a mensagem pronta', () => {
  assert.equal(verifyLink('5500000000000', 'AB3K9Z'), 'https://wa.me/5500000000000?text=Confirmar%20graao%20AB3K9Z');
});

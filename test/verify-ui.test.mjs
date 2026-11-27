import test from 'node:test';
import assert from 'node:assert/strict';
import { gateView, statusMessage, verifyView } from '../ui/verify.js';

test('A tela começa pedindo o celular, com o Brasil por padrão', () => {
  const html = verifyView({ step: 'form' });
  assert.match(html, /<input[^>]+type="tel"[^>]+name="phone"/);
  assert.match(html, /placeholder="\(11\) 91234-5678"/);
  assert.match(html, /Confirmar pelo WhatsApp/);
  assert.doesNotMatch(html, /<svg/);
});

test('Com o código, mostra o botão para o WhatsApp, o QR do mesmo link e o código', () => {
  const link = 'https://wa.me/5500000000000?text=Confirmar%20graao%20AB3K9Z';
  const html = verifyView({ step: 'waiting', link, code: 'AB3K9Z', phone: '(31) 98123-4567' });
  assert.match(html, new RegExp(`<a[^>]+href="${link.replace(/[?.]/g, '\\$&')}"[^>]+target="_blank"[^>]+rel="noopener"`));
  assert.match(html, /<svg[^>]+QR/);
  assert.match(html, /AB3K9Z/);
  assert.match(html, /Esperando a sua mensagem/);
  assert.match(html, /Usar outro número/);
});

test('O erro da rota aparece na tela, escapado', () => {
  const html = verifyView({ step: 'form', error: 'A confirmação pelo WhatsApp está temporariamente fechada. Tente de novo mais tarde.' });
  assert.match(html, /role="alert"[^>]*>A confirmação pelo WhatsApp está temporariamente fechada/);
  assert.doesNotMatch(verifyView({ step: 'form', error: '<b>x</b>' }), /<b>x<\/b>/);
});

test('Cada resposta da espera vira uma frase para a pessoa', () => {
  assert.equal(statusMessage({ status: 'waiting', reason: '' }), '');
  assert.match(statusMessage({ status: 'waiting', reason: 'lid' }), /celular deste número/);
  assert.match(statusMessage({ status: 'refused', reason: 'other-phone' }), /outro número/);
  assert.match(statusMessage({ status: 'refused', reason: 'phone-taken' }), /já tem uma conta/);
  assert.match(statusMessage({ status: 'expired', reason: '' }), /venceu/);
});

test('Convidado e agência bloqueada veem só o aviso, sem formulário', () => {
  const invited = gateView({ code: 'AGENCY_NOT_ACTIVE', error: 'A agência ainda não foi ativada pelo responsável.' });
  assert.match(invited, /A agência ainda não foi ativada pelo responsável\./);
  assert.doesNotMatch(invited, /name="phone"/);
  assert.match(gateView({ code: 'AGENCY_BLOCKED', error: 'A agência está bloqueada por falta de pagamento.' }), /bloqueada/);
  assert.match(gateView({ code: 'PHONE_REQUIRED', error: '' }), /name="phone"/);
});

test('O servidor entrega o código e o estilo da tela', async () => {
  const { staticFiles } = await import('../server.mjs');
  assert.match(staticFiles.get('/verify.js') || '', /javascript/);
  assert.match(staticFiles.get('/verify.css') || '', /css/);
});

test('Cadastro fechado mostra o aviso em vez da tela do celular', () => {
  const html = gateView({ code: 'SIGNUP_CLOSED', error: 'O cadastro de agências novas está temporariamente fechado. Tente de novo mais tarde.' });
  assert.match(html, /Cadastro fechado/);
  assert.match(html, /temporariamente fechado/);
  assert.doesNotMatch(html, /name="phone"/);
});

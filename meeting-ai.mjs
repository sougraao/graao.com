// Notes AI (6b.7): audio → transcript (OpenAI transcription) and transcript → structured meeting summary.
// Both go through the caller's metered connection, like the other AI writers.
import { openAIResponse } from './openai.mjs';

const fail = (message, status = 400) => Object.assign(new Error(message), { status });
export const transcribeModel = process.env.GRAAO_TRANSCRIBE_MODEL || 'gpt-4o-mini-transcribe';
export const audioTypes = ['audio/webm', 'audio/ogg', 'audio/mpeg', 'audio/mp3', 'audio/mp4', 'audio/m4a', 'audio/x-m4a', 'audio/wav', 'audio/x-wav', 'video/webm'];
export const audioLimit = 4_000_000;
const extension = mime => ({ 'audio/webm': 'webm', 'video/webm': 'webm', 'audio/ogg': 'ogg', 'audio/mpeg': 'mp3', 'audio/mp3': 'mp3', 'audio/mp4': 'mp4', 'audio/m4a': 'm4a', 'audio/x-m4a': 'm4a', 'audio/wav': 'wav', 'audio/x-wav': 'wav' })[mime] || 'webm';

export async function transcribeAudio(connection, { buffer, mime, language = 'pt' }) {
  if (!buffer?.length) throw fail('Envie um arquivo de áudio.');
  const started = Date.now();
  const form = new FormData();
  form.append('file', new Blob([buffer], { type: mime }), `reuniao.${extension(mime)}`);
  form.append('model', transcribeModel);
  form.append('language', language === 'es' ? 'es' : 'pt');
  form.append('response_format', 'json');
  const request = connection.request || fetch;
  const response = await request('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST', body: form, redirect: 'error', signal: AbortSignal.timeout(180000), headers: { Authorization: `Bearer ${connection.apiKey}` }
  }).catch(() => null);
  const problem = 'A IA não conseguiu transcrever o áudio. Tente de novo.';
  if (response?.status === 401) { await connection.onUsage?.({ model: transcribeModel, usage: {}, ms: Date.now() - started, error: 'key' }); throw fail('A OpenAI recusou a chave. Verifique a chave ou conecte uma nova.', 422); }
  if (response?.status === 429) throw fail('Verifique o saldo e os limites de uso do seu projeto na OpenAI.', 429);
  const result = response?.ok ? await response.json().catch(() => null) : null;
  await connection.onUsage?.({ model: transcribeModel, usage: result?.usage || {}, ms: Date.now() - started, ...(result ? {} : { error: problem }) });
  if (!result?.text) throw fail(problem, 502);
  return { text: String(result.text).slice(0, 60000) };
}

const object = properties => ({ type: 'object', properties, required: Object.keys(properties), additionalProperties: false });
const string = { type: 'string' };
const strings = { type: 'array', items: string };

export async function summarizeMeeting(connection, { title, participants, transcript, language = 'pt', today }) {
  const text = String(transcript || '').trim();
  if (text.length < 40) throw fail('A transcrição é curta demais para resumir.');
  const problem = 'A IA não concluiu o resumo. Tente de novo.';
  const lang = language === 'es' ? 'Latin American Spanish' : 'Brazilian Portuguese';
  const result = await openAIResponse({
    model: connection.model, max_output_tokens: 4000,
    instructions: `You take notes for a small business. Read the meeting or call transcript and write, in ${lang}:
- summary: 3 to 6 sentences on what was discussed and agreed.
- keyPoints: up to 8 short bullet points.
- decisions: the decisions actually made (empty if none).
- actionItems: concrete tasks with an owner when the transcript names one (otherwise empty) and a due date as YYYY-MM-DD only when a date is stated or clearly implied (today is ${today}); otherwise an empty string.
- nextSteps: one or two sentences.
- sentiment: the customer's overall mood: positive, neutral or negative.
- followUpEmail: a short, friendly follow-up e-mail to the customer recapping what was agreed and the next steps (subject at most 70 characters; body 60 to 160 words, plain text, greeting with {{contact.first_name}}).
Use only what the transcript says. Never invent prices, dates, names or commitments.`,
    input: `Reunião: ${title}\nParticipantes: ${participants || '(não informado)'}\n\nTranscrição:\n${text.slice(0, 60000)}`,
    text: { format: { type: 'json_schema', name: 'meeting_notes', strict: true, schema: object({
      summary: string, keyPoints: strings, decisions: strings,
      actionItems: { type: 'array', items: object({ text: string, owner: string, due: string }) },
      nextSteps: string, sentiment: { type: 'string', enum: ['positive', 'neutral', 'negative'] }, followUpEmail: object({ subject: string, body: string })
    }) } }
  }, { ...connection, timeout: 120000, problem });
  const content = result.output?.flatMap(item => item.content || []).find(item => item.type === 'output_text');
  if (result.status !== 'completed' || !content?.text) throw fail(problem, 502);
  try { return JSON.parse(content.text); } catch { throw fail(problem, 502); }
}

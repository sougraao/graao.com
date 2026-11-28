import { randomUUID } from 'node:crypto';
import { changeDashboard } from './dashboard-model.mjs';
import { validDesign } from './ui/studio-design.js';
import { formOpen, readAnswers, validFields, validTiers } from './ui/form-fields.js';
import { outcomeOf, validDestination, validRoutes } from './destinations.mjs';
import { changeReport } from './report-model.mjs';
import { defaultDashboard, opportunityStatuses, salesPipeline } from './ui/dashboard-data.js';
import { studioTemplates, studioThemes } from './ui/studio-data.js';
import { transactionDeleted, transactionFact } from './ledger-model.mjs';
import { optionalTaxId, sanitizeFiscal, taxIdKind } from './tax-id.mjs';
import { afterSave, beforeDelete, bulk, companyWorkflow, crmCollections, crmFields, customData } from './crm-model.mjs';
import { tagsChanged } from './contact-tags.mjs';
import { paymentLinkCheckout } from './payment-link.mjs';
import { inboxRule } from './ui/inbox-data.js';
import { linkVisitor, saveTracking, sitePageview, trackingCollections, trackingDefaults, trackingEvent, trackingOf } from './tracking.mjs';
import { adFormLead, leadFormCollections, newGoogleLeadKey } from './lead-forms.mjs';
import { applyScoring, changeScore, scoringCollections, scoringFields } from './scoring-model.mjs';
import { adCollections, adDefaults, adSettingsOf, attributionSnapshot, recordAttribution, saveAdSettings } from './ads-model.mjs';
import { socialBeforeDelete, socialCollections, socialCommand, socialFields, workflowPost } from './social-model.mjs';
import { chatBeforeDelete, chatCollections, chatCommand, chatFields } from './chat-model.mjs';
import { blogBeforeDelete, blogCollections, blogFields, blogView } from './blog-model.mjs';
import { expiredOrders, orderPaidLate, storeAfterSave, storeBeforeDelete, storeCheckout, storeCollections, storeFields } from './store-model.mjs';
import { webinarBeforeDelete, webinarCollections, webinarCommand, webinarFields } from './webinar-model.mjs';
import { qrCollections, qrFields, qrScan } from './qr-model.mjs';
import { mediaBeforeDelete, mediaCollections as driveCollections, mediaCommand, mediaCommandTypes, mediaFields as driveFields, mediaFile, mediaKind, storedFile } from './media-model.mjs';
import { courseFields } from './course-model.mjs';
import { communityCollections, communityFields } from './community.mjs';
import { communityEventBeforeDelete, communityEventCollections, communityEventCommand, communityEventFields } from './community-events.mjs';
import { eventPlanAfterSave, eventPlanCollections, eventPlanCommand, eventPlanFields } from './event-planner-model.mjs';
import { eventSendCollections, eventSendCommand, eventSendDefaults, eventSendsAfterSave, eventSendsBeforeDelete, eventSendSettingsOf } from './event-send-model.mjs';
import { communityCommand } from './community-config.mjs';
import { courseActivityCommand } from './course-learning.mjs';
import { courseOfferBeforeDelete, credentialCollections } from './course-credentials.mjs';
import { certificateBeforeDelete, certificateCollections, certificateFields, credentialCommand, issueFromTemplate } from './certificate-model.mjs';
import { ticketCollections, ticketCommand, ticketInbound, ticketWorkflow } from './ticket-model.mjs';
import { sequenceCollections, sequenceCommand, sequenceFields, sequenceInbound, sequenceWorkflow } from './sequence-model.mjs';
import { addPoints, loyaltyCollections, loyaltyCommand, loyaltyEvent, loyaltyFields } from './loyalty-model.mjs';
import { preferenceCommand, preferenceToken } from './preference-model.mjs';
import { trashCommand, trashContact } from './contact-trash.mjs';
import { connectorCommand } from './connector-model.mjs';
import { pushCommand, pushInbound } from './push-model.mjs';
import { dialerDefaults, phoneCommand, phoneDefaults } from './phone-model.mjs';
import { appointmentRecord, bookForContact, createBookingLink, noteOnAppointment, schedulingCollections, schedulingCommand, schedulingFields, upcomingSlots, zonedInstant } from './scheduling-model.mjs';
import { meetingCollections, meetingCommand, meetingFields } from './meeting-model.mjs';
import { seoCommand, seoDefaults, visibilityDefaults } from './seo-model.mjs';
import { walletCharge, walletDefaults } from './wallet-model.mjs';
import { labsDefaults, rejectDuplicateContact, toggleLab } from './labs-model.mjs';
import { onAiAlert } from './ai-model.mjs';
import { academyBeforeDelete } from './community-academy.mjs';
import { offerBeforeDelete, offerAccessCommand, offerCheckout, offerCollections, offerFields } from './offer-model.mjs';
import { pipelineCommand, stageColors } from './pipeline-model.mjs';
import { createEngine, workflowRecord } from './workflow-engine.mjs';
import { pranchetaFileRecord, createCanonicalTemplates, checkPranchetaSave, applyPranchetaSave } from './prancheta-model.mjs';
import { directories } from './ui/gbp-data.js';
import { brandCollections, brandFields } from './brand-model.mjs';
import { addAffiliateFromContact, affiliateCampaignChanges, affiliateWorkflow, affiliateClick, affiliateCollections, affiliateDefaults, affiliateFields, affiliateSettings, affiliateSignup, attributeContacts, issuePortalToken, recordPayout, reviewCommission, saveAffiliateSettings, settleAffiliates } from './affiliate-model.mjs';
import { acceptVideoChunk, finishVideoUpload, mediaCollections, mediaFields, startVideoUpload } from './reputation-media.mjs';
import { createReviewRequest, deliver as deliverReviewRequest, importGoogleReviews, openReviewRequest, reputationCollections, saveListing, reputationDefaults, reputationOf, saveReputation, sendReviewRequests, submitReview as submitWorkspaceReview } from './reputation-model.mjs';
import { documentAfterSave, documentBeforeDelete, documentCollections, documentCommand, documentFields, sendTemplateDocument } from './document-model.mjs';
import { catalogAfterSave, catalogBeforeDelete, catalogCollections, catalogCommand, catalogFields, submitReview, workflowInventory } from './catalog-model.mjs';
import { captureCart, checkoutBeforeDelete, checkoutCollections, checkoutCommand, checkoutConverted, checkoutFields, checkoutTick, productViewed, restoreCart } from './checkout-model.mjs';
import { invoiceAfterSave, paymentDefaults, savePaymentSettings, invoiceBeforeDelete, invoiceCollections, invoiceCommand, invoiceFields, invoiceTick, sendTemplateInvoice, startTemplateRecurring } from './invoice-model.mjs';
import { emailBeforeDelete, emailCollections, emailCommand, emailFields } from './email-campaign-model.mjs';
import { estimateAfterSave, estimateBeforeDelete, estimateCollections, estimateCommand, estimateFields, sendEstimateCopy } from './estimate-model.mjs';

export const defaults = {
  profile: { name: 'Demo Workspace', email: 'hello@example.test', phone: '', timezone: 'America/Sao_Paulo', currency: 'BRL' },
  onboarding: { kind: '', goal: '', done: false },
  pipelines:[{ id:salesPipeline, name:'Sales Pipeline' }],
  stages: [{ id: 'new', name: 'New Lead' }, { id: 'qualified', name: 'Qualified' }, { id: 'proposal', name: 'Proposal' }, { id: 'won', name: 'Won', visible:false }].map(stage => ({ ...stage, pipelineId:salesPipeline })),
  contacts: [], tasks: [], opportunities: [], messages: [], appointments: [], workflows: [], runs: [], invoices: [],
  workflowFolders: [], workflowLists: [], deletedWorkflows: [], contactTrash: [],
  campaigns: [], pages: [], forms: [], submissions: [], courses: [], files: [], reviews: [], agents: [], agentRuns: [], knowledgeBases: [], agentTemplatesCustom: [], integrations: [],
  manualActions: [], snippetFolders: [], snippets: [], triggerLinks: [], linkTickets: [], linkClicks: [],
  threads: [], teamMessages: [], inboxViews: [],
  dashboards:[defaultDashboard()], dashboardReports:[], customReports:[], studioProjects:[], pranchetaFiles:[],
  ...Object.fromEntries([...crmCollections, ...socialCollections, ...chatCollections, ...blogCollections, ...storeCollections, ...webinarCollections, ...qrCollections, ...communityCollections, ...communityEventCollections, ...eventPlanCollections, ...eventSendCollections, ...credentialCollections, ...certificateCollections, ...ticketCollections, ...sequenceCollections, ...loyaltyCollections, ...schedulingCollections, ...meetingCollections, ...offerCollections, ...driveCollections, ...documentCollections, ...estimateCollections, ...invoiceCollections, ...emailCollections, ...checkoutCollections, ...catalogCollections].map(key => [key, []])),
  eventSendSettings: eventSendDefaults(),
  paymentSettings: paymentDefaults(),
  fiscal: null, ledgerOutbox: [],
  ai: { limit: 0, alertAt: 0.8, ledger: [] },
  adSettings: adDefaults(), adCampaigns: [], adStats: [], attributionEvents: [],
  tracking: trackingDefaults(), trackingEvents: [], adFormLeads: [], calls: [], phone: phoneDefaults(), dialer: dialerDefaults(), aiVideoJobs: [], aiVideos: [], scoringRules: [],
  brandBoards: [], affiliateSettings: affiliateDefaults(), affiliateCampaigns: [], affiliates: [], affiliateCommissions: [], affiliatePayouts: [],
  wallet: walletDefaults(), labs: labsDefaults(), seo: seoDefaults(), seoAudits: [], visibility: visibilityDefaults(), visibilityRuns: [],
  reputation: reputationDefaults(), listings: {}, reviewRequests: [], reviewWidgets: [], videoCollectors: [], videoTestimonials: [], videoUploads: [],
  conversationSla: { enabled: false, mode: 'common', common: { soon: 3, overdue: 5 }, channels: {}, automation: 'none', workflows: [], startedAt: '' }
};
export const blank = name => ({ ...structuredClone(defaults), profile: { ...defaults.profile, ...(name ? { name } : {}) } });
export function hydrateWorkspace(state) {
  const fresh = blank();
  state.customReports ??= [];
  state.paymentSettings ??= paymentDefaults();
  state.ai ??= { limit: 0, alertAt: 0.8, ledger: [] };
  state.ai.ledger ??= [];
  state.fiscal ??= null;
  state.ledgerOutbox ??= [];
  reputationOf(state);
  state.listings ??= {};
  state.wallet ??= walletDefaults(); state.labs ??= labsDefaults(); state.seo ??= seoDefaults(); state.seoAudits ??= []; state.visibility ??= visibilityDefaults(); state.visibilityRuns ??= [];
  eventSendSettingsOf(state);
  affiliateSettings(state);
  adSettingsOf(state);
  trackingOf(state);
  state.profile.currency = defaults.profile.currency;
  const additions = ['threads','teamMessages','inboxViews','agents','agentRuns','knowledgeBases','agentTemplatesCustom','reviewRequests',...mediaCollections,...driveCollections,...affiliateCollections,...adCollections,...trackingCollections,...leadFormCollections,'calls','aiVideoJobs','aiVideos',...scoringCollections,...brandCollections,'manualActions','snippetFolders','snippets','triggerLinks','linkTickets','linkClicks','pipelines','dashboards','dashboardReports','studioProjects','pranchetaFiles','workflowFolders','workflowLists','deletedWorkflows',...crmCollections,...socialCollections,...chatCollections,...blogCollections,...storeCollections,...webinarCollections,...qrCollections,...communityCollections,...communityEventCollections,...eventPlanCollections, ...eventSendCollections,...credentialCollections,...certificateCollections,...ticketCollections,...sequenceCollections,...loyaltyCollections,...schedulingCollections,...meetingCollections,...offerCollections,...documentCollections,...estimateCollections,...invoiceCollections,...emailCollections,...checkoutCollections,...catalogCollections];
  for (const key of additions) state[key] ??= fresh[key];
  for (const stage of state.stages) {
    stage.pipelineId ||= salesPipeline;
    if (stage.id === 'won') stage.visible ??= false;
  }
  const pipelineByStage = new Map(state.stages.map(stage => [stage.id,stage.pipelineId]));
  for (const deal of state.opportunities) {
    deal.pipelineId ||= pipelineByStage.get(deal.stage) || salesPipeline;
    deal.statusChangedAt ||= deal.created;
  }
  state.conversationSla = { ...fresh.conversationSla, ...state.conversationSla };
  return state;
}
export const uid = () => randomUUID();
export const now = () => new Date().toISOString();
const fail = (message, status = 400) => { throw Object.assign(new Error(message), { status }); };
const str = (value, limit = 240) => typeof value === 'string' ? value.trim().slice(0, limit) : '';
const req = (value, label, limit) => str(value, limit) || fail(`${label} is required.`);
const one = (value, options, label) => options.includes(value) ? value : fail(`Choose a valid ${label}.`);
const amount = value => {
  if (value === '' || value == null || !Number.isFinite(Number(value)) || Number(value) < 0 || Number(value) > 1e9) fail('Enter a valid amount.');
  return Math.round(Number(value) * 100) / 100;
};
const date = value => { const d = new Date(req(value, 'Date')); if (!Number.isFinite(+d)) fail('Enter a valid date.'); return d.toISOString(); };
const email = value => { const v = str(value).toLowerCase(); if (v && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) fail('Enter a valid email address.'); return v; };
const percent = value => {
  if (value === '' || value == null) return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0 || n > 100) fail('Probability must be between 0 and 100.');
  return Math.round(n * 100) / 100;
};
const tags = value => [...new Set((Array.isArray(value) ? value : str(value).split(',')).map(a => str(a, 48)).filter(Boolean))].slice(0, 20);
export const triggers = ['Contact created', 'Form submitted', 'Opportunity stage changed', 'Appointment booked', 'Trigger link clicked', 'Customer replied'];
const messageChannels = ['Note', 'Email', 'SMS', 'WhatsApp', 'Live chat', 'Instagram', 'Facebook'];
// Channels whose inbound messages start an SLA timer (every conversation channel except internal notes).
const slaChannels = messageChannels.filter(channel => channel !== 'Note');
export const find = (state, key, id) => state[key].find(a => a.id === id);
const webAddress = value => { const v = str(value, 600); if (v && !/^https?:\/\/[^\s/]+\.[^\s]+$/i.test(v)) fail('Use um endereço que comece com https://'); return v; };
const when = (value, label) => { if (!value) return ''; const t = Date.parse(value); if (Number.isNaN(t)) fail(`Use uma data válida em ${label}.`); return new Date(t).toISOString(); };
// Forms: the builder sends fields and settings; older callers send only name, description and askPhone.
function formRecord(s, d) {
  const prior = d.id ? find(s,'forms',d.id) : null;
  const kind = d.kind !== undefined ? one(d.kind, ['form','survey','quiz'], 'tipo') : prior?.kind || 'form';
  const row = { name: req(d.name,'Form name'), description: str(d.description,1500), askPhone: Boolean(d.askPhone), active: Boolean(d.active), kind };
  if (d.fields !== undefined) row.fields = validFields(d.fields, s.customFields || [], kind);
  if (d.oneAtATime !== undefined) row.oneAtATime = kind !== 'form' && Boolean(d.oneAtATime);
  if (d.tiers !== undefined && kind === 'quiz') row.tiers = validTiers(d.tiers);
  if (d.button !== undefined) row.button = str(d.button, 60) || 'Enviar';
  if (d.accent !== undefined) row.accent = /^#[0-9a-f]{6}$/i.test(d.accent || '') ? d.accent.toLowerCase() : '#155eef';
  if (d.showTitle !== undefined) row.showTitle = Boolean(d.showTitle);
  if (d.addTags !== undefined) row.addTags = tags(d.addTags);
  if (d.onSubmit !== undefined) {
    row.onSubmit = validDestination(s, d.onSubmit?.action === 'default' ? { ...d.onSubmit, action: 'message' } : d.onSubmit, 'Ao enviar');
  }
  if (d.routes !== undefined) row.routes = validRoutes(s, d.routes, { fields: row.fields || prior?.fields || [], kind, tiers: row.tiers || prior?.tiers || [] });
  if (d.schedule !== undefined) {
    const start = when(d.schedule?.start, 'início'), end = when(d.schedule?.end, 'fim');
    if (start && end && end <= start) fail('O fim do período precisa ser depois do início.');
    row.schedule = { start, end, closedMessage: str(d.schedule?.closedMessage, 300) };
  }
  return row;
}
const digits = value => String(value || '').replace(/\D/g, '');
const exists = (state, key, value, label, optional = false) => (!value && optional) ? '' : find(state, key, value)?.id ?? fail(`Choose a valid ${label}.`);
function add(state, key, data) {
  const row = { id: uid(), created: now(), ...data }; state[key].push(row);
  if (key === 'messages' && row.direction === 'Outbound' && ['Email', 'WhatsApp'].includes(row.channel) && ['human', 'workflow', 'event'].includes(row.origin)) walletCharge(state, row.channel === 'Email' ? 'email' : 'whatsapp', 1, row.created);
  if (key === 'transactions') transactionFact(state, null, row);
  return row;
}
const contactId = (s,v,optional = false) => exists(s, 'contacts', v, 'contact', optional);
const fields = {
  contacts: (s, d) => ({ name: req(d.name, 'Name'), email: email(d.email), phone: str(d.phone, 48), company: str(d.company), tags: tags(d.tags), notes: str(d.notes, 5000), custom: customData(s, 'Contact', d), ...(d.dnd !== undefined ? { dnd: Boolean(d.dnd) } : {}), ...(d.taxId !== undefined ? { taxId: optionalTaxId(d.taxId) } : {}) }),
  tasks: (s, d) => ({ title: req(d.title, 'Title'), contactId: contactId(s,d.contactId,true), due: d.due ? date(d.due) : '', done: Boolean(d.done), owner:str(d.owner,80), notes:str(d.notes,2500) }),
  opportunities: (s, d) => {
    const stage = find(s,'stages',d.stage);
    if (!stage) fail('Choose a valid stage.');
    return { title:req(d.title,'Name'), contactId:contactId(s,d.contactId), stage:stage.id, pipelineId:stage.pipelineId,
      value:amount(d.value ?? 0), status:one(d.status || 'Open',opportunityStatuses,'status'), source:str(d.source,80), owner:str(d.owner,80),
      closeDate:d.closeDate ? date(d.closeDate).slice(0,10) : '', probability:percent(d.probability), custom:customData(s,'Opportunity',d),
      company:str(d.company,160), tags:tags(d.tags), followers:tags(d.followers),
      lostReason:d.status === 'Lost' ? str(d.lostReason,250) : '' };
  },
  ...crmFields,
  ...socialFields,
  ...scoringFields,
  ...chatFields,
  ...blogFields,
  ...storeFields,
  ...webinarFields,
  ...qrFields,
  pranchetaFiles: pranchetaFileRecord,
  appointments: (s, d) => appointmentRecord(s, d, { date, contactId, req }),
  ...schedulingFields,
  ...meetingFields,
  workflows: (s, d) => {
    const record = workflowRecord(s, d);
    return { ...record, folderId: exists(s, 'workflowFolders', record.folderId, 'folder', true) };
  },
  workflowFolders: (s, d) => ({ name: req(d.name, 'Nome da pasta', 100) }),
  workflowLists: (s, d) => ({ name: req(d.name, 'Nome da lista', 100), query: str(d.query, 200),
    status: one(d.status || 'all', ['all', 'draft', 'published'], 'status'),
    folderId: exists(s, 'workflowFolders', d.folderId, 'folder', true) }),
  invoices: (s,d) => ({ title: req(d.title,'Invoice name'), contactId: contactId(s,d.contactId), value: amount(d.value), due: date(d.due), status: one(d.status || 'Draft',['Draft','Open','Paid','Void'],'status') }),
  campaigns: (s,d) => ({ name: req(d.name,'Campaign name'), channel: one(d.channel,['Email','Social'],'channel'), body: req(d.body,'Content',5000), date: d.date ? date(d.date) : '', status: one(d.status || 'Draft',['Draft','Planned','Archived'],'status') }),
  pages: (s,d) => ({ name: req(d.name,'Page name'), headline: req(d.headline,'Headline'), body: str(d.body,5000), button: str(d.button,80), formId: exists(s,'forms',d.formId,'form',true), kind: one(d.kind,['Website','Funnel'],'page type'), active: Boolean(d.active) }),
  forms: (s,d) => formRecord(s,d),
  ...courseFields,
  ...communityFields,
  ...communityEventFields,
  ...eventPlanFields,
  ...certificateFields,
  ...sequenceFields,
  ...loyaltyFields,
  ...offerFields,
  ...documentFields,
  ...estimateFields,
  ...invoiceFields,
  ...emailFields,
  ...checkoutFields,
  ...catalogFields,
  reviews: (s,d) => ({ author: req(d.author,'Author'), score: one(Number(d.score),[1,2,3,4,5],'rating'), text: req(d.text,'Review',2500), reply: str(d.reply,2500) }),
  ...mediaFields,
  ...affiliateFields,
  ...brandFields,
  ...driveFields,
  agents: (s,d) => ({ name: req(d.name,'Agent name'), role: one(d.role,['Support','Sales','Scheduling'],'role'), instructions: str(d.instructions,5000), active: Boolean(d.active) }),
  snippetFolders: (s,d) => ({ name: req(d.name, 'Folder name', 100) }),
  snippets: (s,d) => {
    const type = one(d.type, ['Text', 'Email'], 'snippet type');
    return {
      name: req(d.name, 'Snippet name', 100), type,
      subject: type === 'Email' ? req(d.subject, 'Subject', 240) : '',
      body: req(d.body, 'Message', 5000), folderId: exists(s, 'snippetFolders', d.folderId, 'folder', true)
    };
  },
  triggerLinks: (s,d) => ({ name: req(d.name, 'Link name', 100), url: linkDestination(d.url) }),
  inboxViews: (s,d) => {
    if (!Array.isArray(d.rules) || !d.rules.length || d.rules.length > 10) fail('A view needs between 1 and 10 conditions.');
    const rules = d.rules.map(rule => inboxRule(rule) || fail('Choose a valid view condition.'));
    return { name: req(d.name, 'View name', 60), match: one(d.match || 'and', ['and','or'], 'match'), rules };
  },
  studioProjects: (s,d) => {
    const blocks = d.blocks === undefined ? [] : d.blocks;
    if (!Array.isArray(blocks) || blocks.length > 12) fail('A project can have up to 12 sections.');
    const name = req(d.name,'Project name',80);
    return { name, headline:str(d.headline,140) || name, summary:str(d.summary,1500),
      brief:req(d.brief,'Brief',4000), theme:one(d.theme,studioThemes,'theme'), template:one(d.template,studioTemplates.map(item => item[0]),'template'),
      blocks:blocks.map(block => ({ title:req(block?.title,'Section title',100),body:str(block?.body,2200) })),
      reference:str(d.reference,500), design:d.design ? validDesign(d.design) : find(s,'studioProjects',d.id)?.design || null, kind:one(d.kind || find(s,'studioProjects',d.id)?.kind || 'website',['website','funnel'],'site type') };
  }
};
// Metadata mirrored from the project's site row: page list, publication and the form that receives its leads.
function studioMeta(s, id, d) {
  const project = find(s,'studioProjects',id);
  if (!project) fail('Project not found.',404);
  if (d.name !== undefined) project.name = req(d.name,'Project name',80);
  if (d.kind !== undefined) project.kind = one(d.kind,['website','funnel'],'site type');
  if (Array.isArray(d.pages)) project.pages = d.pages.slice(0,8).map(p => ({ id:str(p?.id,40), name:str(p?.name,60), slug:str(p?.slug,48) }));
  if (d.publishedAt !== undefined) project.publishedAt = d.publishedAt ? date(d.publishedAt) : '';
  if (d.formId !== undefined) project.formId = exists(s,'forms',d.formId,'form',true);
  if (d.rev !== undefined) project.rev = Number.isInteger(d.rev) ? d.rev : project.rev;
  if (d.publishedRev !== undefined) project.publishedRev = Number.isInteger(d.publishedRev) ? d.publishedRev : 0;
  project.updated = now();
  return id;
}
function linkDestination(value) {
  const input = req(value, 'Link URL', 2000);
  try {
    const target = new URL(input);
    if (['https:', 'http:'].includes(target.protocol) && !target.username && !target.password) return target.href;
  } catch { /* Report the field error below. */ }
  fail('Enter an HTTP or HTTPS URL without credentials.');
}

// Workflows run on workflow-engine.mjs. The old event names are still accepted here.
let engineWorkspace = 'demo';
const queue = (s, item) => { s.workflowOutbox ??= []; s.workflowOutbox.push({ id: uid(), created: now(), ...item }); if (s.workflowOutbox.length > 500) s.workflowOutbox.splice(0, s.workflowOutbox.length - 500); };
const engine = createEngine({ add, now,
  // The contact's preference page, for the e-mail footer and "Pedir consentimento".
  preferencePath: contact => `/preferencias/${engineWorkspace}/${preferenceToken(contact)}`,
  // "Pedir avaliação" in a workflow: a personal review link, the message in Conversations and the delivery.
  makeAffiliate: (state, contact, campaignId) => addAffiliateFromContact(state, contact, campaignId, { emit: (st, event, ctx) => engine.emit(st, event, ctx) }),
  // Atualizar afiliado, campanhas, atribuir lead e venda manual: the Affiliate Manager's workflow actions.
  affiliateAction: (state, contact, action, config, depth = 0) => affiliateWorkflow(state, contact, action, config, { emit: (st, event, ctx) => engine.emit(st, event, { ...ctx, depth: depth + 1 }) }),
  requestReview: (state, contact, channel, run) => {
    const made = createReviewRequest(state, engineWorkspace, contact, channel, { source: 'workflow', runId: run.id });
    return deliverReviewRequest(state, made, contact, channel, reputationOf(state), { add, outbox: queue, runId: run.id, workflowId: run.workflowId });
  },
  sendDocument: (state, contact, config, depth = 0) =>
  sendTemplateDocument(state, engineWorkspace, contact, config, (st, event, ctx) => run(st, event, { ...ctx, depth: depth + 1 })),
  sendEstimate: (state, contact, config, depth = 0) => sendEstimateCopy(state, engineWorkspace, contact, config, (st, event, ctx) => run(st, event, { ...ctx, depth: depth + 1 })),
  sendInvoice: (state, contact, config, depth = 0) => sendTemplateInvoice(state, engineWorkspace, contact, config, (st, event, ctx) => run(st, event, { ...ctx, depth: depth + 1 })),
  updateInventory: state => (config) => workflowInventory(state, config),
  createSocialPost: (state, config, text) => workflowPost(state, config, text, { add }),
  // "Dar ou tirar pontos de fidelidade" in a workflow.
  loyaltyAction: (state, contact, points, reason, depth = 0) => addPoints(state, contact.id, points, reason, { add, run: (st, event, ctx) => engine.emit(st, event, { ...ctx, depth: depth + 1 }), source: 'workflow' }),
  // "Inscrever na sequência" / "Tirar da sequência" in a workflow.
  sequenceAction: (state, contact, action, sequenceId) => sequenceWorkflow(state, contact, action, sequenceId),
  // "Criar ticket" / "Mudar situação do ticket" in a workflow.
  ticketAction: (state, contact, action, config, depth = 0) => ticketWorkflow(state, contact, action, config, { add, run: (st, event, ctx) => engine.emit(st, event, { ...ctx, depth: depth + 1 }) }),
  // "Emitir certificado/badge": one credential from a template for the workflow's contact.
  issueCredential: (state, contact, templateId, subject, kind, depth = 0) => {
    const template = (state.certificateTemplates || []).find(row => row.id === templateId && row.kind === kind);
    if (!template) return null;
    return issueFromTemplate(state, template, contact, subject, { add, run: (st, event, ctx) => engine.emit(st, event, { ...ctx, depth: depth + 1 }), source: 'workflow' });
  },
  // Lead scoring: every event passes the scoring rules; workflows adjust the score through the same path.
  // Every event: a customer message reaches their ticket, then the lead scoring rules run.
  onEvent: (state, type, ctx, { matches }) => {
    ticketInbound(state, type, ctx, { add, run: (st, event, c) => engine.emit(st, event, { ...c, depth: (ctx.depth || 0) + 1 }) });
    sequenceInbound(state, type, ctx);
    loyaltyEvent(state, type, ctx, { add, run: (st, event, c) => engine.emit(st, event, { ...c, depth: (ctx.depth || 0) + 1 }) });
    applyScoring(state, type, ctx, { matches, emit: (st, event, c) => engine.emit(st, event, c) });
    pushInbound(state, type, ctx);
  },
  // "Excluir contato" and "Remover oportunidade" go through the same deletion as the screens (contacts to the trash).
  removeRecord: (state, key, recordId) => remove(state, key, recordId),
  // Agenda: one-time booking link, a note on the next appointment and booking the first free time (same save as the screens).
  bookingLink: (state, contact, config) => createBookingLink(state, engineWorkspace, contact, config),
  // Grupo Empresa: create/associate, update and clear the contact's company through the same save as the screens.
  companyAction: (state, contact, type, config) => companyWorkflow(state, contact, type, config, { save: (key, data, id) => executeCommand(state, { type: 'save', key, id, data }, { workspace: engineWorkspace }) }),
  appointmentNote: (state, contact, config) => noteOnAppointment(state, contact, config),
  freeSlots: (state, serviceId) => upcomingSlots(state, serviceId),
  dialerAdd: (state, contact) => phoneCommand(state, 'dialer-queue-add', { contactIds: [contact.id], by: 'workflow' }, { add, run, now, engine }) > 0,
  zonedTime: (day, time, zone) => zonedInstant(day, time, zone),
  bookAppointment: (state, contact, config) => bookForContact(state, contact, config, { save: (key, data) => executeCommand(state, { type: 'save', key, data }, { workspace: engineWorkspace }) }),
  adjustScore: (state, contact, delta, reason, depth = 0) => changeScore(state, contact, delta, reason, { emit: (st, event, c) => engine.emit(st, event, c), depth }),
  startRecurring: (state, contact, config, depth = 0) => startTemplateRecurring(state, contact, config, (st, event, ctx) => run(st, event, { ...ctx, depth: depth + 1 })) });
const legacyEvents = { 'Contact created': 'contact_created', 'Form submitted': 'form_submitted', 'Opportunity stage changed': 'pipeline_stage_changed',
  'Appointment booked': 'appointment_booked', 'Trigger link clicked': 'trigger_link_clicked', 'Customer replied': 'customer_replied' };
function run(state, event, context = {}) {
  const type = legacyEvents[event] || event;
  const ctx = { ...context, contactId: context.contactId || '' };
  if (type === 'pipeline_stage_changed') ctx.stageId = context.stageId || context.stage;
  if (type === 'appointment_booked') { engine.emit(state, type, { contactId: ctx.contactId }); return; }
  engine.emit(state, type, ctx);
  // 'Contact created' vem de quem criou o contato direto (formulário, chat, loja, importação…): as tags com que ele nasceu contam como adicionadas.
  if (event === 'Contact created') { const contact = find(state, 'contacts', ctx.contactId); if (contact) tagsChanged(state, contact, [], run); }
  if (type === 'form_submitted') {
    const form = find(state, 'forms', ctx.formId);
    if (form?.kind === 'survey') engine.emit(state, 'survey_submitted', ctx);
    if (form?.kind === 'quiz') engine.emit(state, 'quiz_submitted', ctx);
  }
}
/** Workflow events from outside a command (the social scheduler, for one). */
export const emitWorkflow = (state, event, ctx = {}) => run(state, event, ctx);
/**
 * Prospects the agency sends from Prospecting into this subaccount: one contact each (reused when an
 * earlier import, the e-mail or the phone matches), tagged "New Prospect Received", an optional
 * opportunity in the first stage, and the "Prospect recebido" trigger the first time a prospect arrives.
 */
export function receiveProspects(state, prospects, { opportunity: withOpportunity = false } = {}) {
  state.prospectImports ??= {};
  const stage = state.stages[0];
  const digits = value => String(value || '').replace(/\D/g, '');
  return prospects.map(row => {
    const previous = state.prospectImports[row.id];
    const phone = row.contactPhone || row.phone || '';
    const email = String(row.email || '').toLowerCase();
    const dedupPhone = digits(phone);
    const reused = state.contacts.find(contact => contact.id === previous?.contact || (email && contact.email === email) ||
      (dedupPhone.length >= 7 && digits(contact.phone) === dedupPhone));
    const notes = [row.website, row.address, [row.city, row.region, row.country].filter(Boolean).join(', ')].filter(Boolean).join('\n');
    const contact = reused?.id || execute(state, { type: 'save', key: 'contacts', data: { name: row.owner || row.name, email, phone, company: row.name,
      notes, tags: ['New Prospect Received'] } });
    if (reused && !reused.tags.includes('New Prospect Received')) { const before = [...reused.tags]; reused.tags.push('New Prospect Received'); tagsChanged(state, reused, before, run); }
    let opportunity = state.opportunities.some(item => item.id === previous?.opportunity && item.contactId === contact) ? previous.opportunity : '';
    if (withOpportunity && !opportunity && stage) opportunity = execute(state, { type: 'save', key: 'opportunities', data: { title: row.name,
      contactId: contact, stage: stage.id, value: 0, status: 'Open', source: 'Prospecting' } });
    state.prospectImports[row.id] = { contact, opportunity };
    if (!previous) run(state, 'prospect_received', { contactId: contact, prospectId: row.id, opportunityId: opportunity,
      isNew: reused ? 'no' : 'yes', withOpportunity: opportunity ? 'yes' : 'no',
      company: row.name || '', website: row.website || '', city: row.city || '', category: row.category || '' });
    return { id: row.id, contact, opportunity };
  });
}
// The AI ledger lives in ai-model.mjs; its threshold crossings reach the workflows through here.
onAiAlert((state, ctx) => run(state, 'ai_usage_alert', ctx));
const enroll = (state, workflow, event, contactId = '') => engine.enroll(state, workflow, { contactId, depth: 1 }, event);
const finishManualAction = (state, id, data) => engine.finishManual(state, id, data, one, str);

function saveSla(state, data) {
  function target(settings) {
    const soon = Number(settings?.soon);
    const overdue = Number(settings?.overdue);
    if (![soon, overdue].every(n => Number.isInteger(n) && n >= 1 && n <= 10080) || overdue <= soon) {
      fail('Use response targets between 1 and 10,080 minutes. Overdue must be greater than due soon.');
    }
    return { soon, overdue };
  }
  const current = state.conversationSla;
  const enabled = Boolean(data.enabled);
  const mode = one(data.mode, ['common', 'channel'], 'SLA mode');
  const automation = one(data.automation, ['none', 'all', 'selected'], 'automation rule');
  const workflows = automation === 'selected' && Array.isArray(data.workflows)
    ? [...new Set(data.workflows.map(id => exists(state, 'workflows', id, 'workflow')))] : [];
  if (automation === 'selected' && !workflows.length) fail('Select at least one workflow.');
  state.conversationSla = {
    enabled, mode, automation, workflows,
    common: mode === 'common' ? target(data.common) : current.common,
    channels: mode === 'channel' ? Object.fromEntries(slaChannels.map(channel => [channel, target(data.channels?.[channel] || data.common)])) : current.channels,
    startedAt: enabled ? current.enabled && current.startedAt ? current.startedAt : now() : current.startedAt
  };
  return enabled;
}
export function metrics(s) {
  const open = s.opportunities.filter(v=>v.status==='Open'), won = s.opportunities.filter(v=>v.status==='Won');
  return { contacts:s.contacts.length, open:open.length, openValue:open.reduce((n,r)=>n+r.value,0), won:won.length, wonValue:won.reduce((n,r)=>n+r.value,0), appointments:s.appointments.filter(a=>a.status!=='Canceled').length, invoicesPaid:s.invoices.filter(i=>i.status==='Paid'&&i.payment?.status!=='REFUNDED').reduce((n,r)=>n+r.value,0), unread:s.messages.filter(m=>!m.read).length, reviews:s.reviews.length, average:s.reviews.length ? s.reviews.reduce((n,r)=>n+r.score,0)/s.reviews.length : 0 };
}
// Every command: contacts created by a referred visitor are attributed to the affiliate, then paid
// invoices become commissions (see affiliate-model.mjs).
export function execute(s, command, options = {}) {
  const before = options.affiliate ? new Set(s.contacts.map(row => row.id)) : null;
  // Public commands carry the visitor's first and last touch (an empty object for a direct visit).
  const sources = options.attribution ? attributionSnapshot(s) : null;
  const result = executeCommand(s, command, options);
  const emit = (st, event, ctx) => engine.emit(st, event, ctx);
  if (before) attributeContacts(s, before, options.affiliate, { emit });
  if (sources) recordAttribution(s, sources, options.attribution, { emit });
  settleAffiliates(s, { emit });
  return result;
}

function executeCommand(s, command, { workspace = 'demo', trackClick = true } = {}) {
  const { type, key, id, data:d = {} } = command;
  engineWorkspace = workspace;
  if (!d || typeof d!=='object' || Array.isArray(d)) fail('Invalid record data.');
  if (type === 'link-click') {
    const ticket = find(s, 'linkTickets', id);
    const link = find(s, 'triggerLinks', ticket?.linkId || id);
    if (!link) fail('Trigger link not found.', 404);
    if (!trackClick) return link.url;
    const firstClick = ticket && !ticket.clickedAt;
    add(s, 'linkClicks', { linkId: link.id, contactId: ticket?.contactId || '' });
    if (firstClick) {
      ticket.clickedAt = now();
      run(s, 'Trigger link clicked', { linkId: link.id, contactId: ticket.contactId });
    }
    return link.url;
  }
  if (type === 'workflow-enroll') {
    const workflow = find(s, 'workflows', id);
    if (!workflow?.active) fail('Publique o fluxo antes de inscrever contatos.', 409);
    return enroll(s, workflow, 'Inscrição manual', contactId(s, d.contactId))
      || fail('Este contato já foi inscrito neste fluxo.', 409);
  }
  // Server-internal (not accepted from /api/action): the per-minute tick, inbound webhooks and the delivery queue.
  if (type === 'workflow-test') {
    if (!d.workflow || typeof d.workflow !== 'object') fail('Envie o fluxo para testar.');
    return engine.test(s, d.workflow, contactId(s, d.contactId));
  }
  if (type === 'workflow-tick') return engine.tick(s, d.at ? Date.parse(d.at) : Date.now());
  if (type === 'payment-settings') return savePaymentSettings(s, d);
  if (type === 'invoice-tick') return invoiceTick(s, d.at ? Date.parse(d.at) : Date.now(), { workspace, run });
  if (type === 'workflow-hook') return engine.inbound(s, str(d.workflowId, 40), str(d.triggerId, 40), d.payload && typeof d.payload === 'object' ? d.payload : {});
  if (type === 'workflow-outbox-take') { const items = s.workflowOutbox || []; s.workflowOutbox = []; return items; }
  if (type === 'ad-settings') { saveAdSettings(s, d); return 'ok'; }
  if (type === 'tracking-settings') { saveTracking(s, d); return 'ok'; }
  // Server-internal: the GA4 API secret itself stays sealed on the server; the sub-account only knows it is set.
  if (type === 'tracking-ga4-secret') { trackingOf(s).ga4SecretSet = Boolean(d.set); return 'ok'; }
  if (type === 'tracking-google-lead-key') return newGoogleLeadKey(s);
  // Server only: a lead from a Google Ads lead form webhook or from Meta Lead Ads.
  if (type === 'ad-form-lead') return adFormLead(s, d, { add, run, now });
  // Telefonia (2.4): numbers, calls and the IVR (phone-model.mjs). Only phone-number-save comes from the browser.
  // T.2 Conectores: connections (sealed by the server), webhook and polling events. Server only.
  if (type.startsWith('connector-')) { const out = connectorCommand(s, type, d, { add, run, now }); if (out !== undefined) return out; }
  // Notificações push: the devices of the team (app mobile) and of contacts (portal). Server only.
  if (type.startsWith('push-')) { const out = pushCommand(s, type, d, { now }); if (out !== undefined) return out; }
  // Voice AI: the agent booked a free time the caller chose (same save as the screens).
  if (type === 'voice-book') {
    const call = (s.calls || []).find(row => row.id === d.callId);
    const contact = call && s.contacts.find(row => row.id === call.contactId);
    if (!call?.voice?.serviceId || !contact) return { error: 'sem serviço para marcar' };
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(d.day)) || !/^\d{2}:\d{2}$/.test(String(d.time))) return { error: 'horário inválido' };
    const at = zonedInstant(String(d.day), String(d.time), s.profile?.timezone || 'America/Sao_Paulo');
    const made = bookForContact(s, contact, { serviceId: call.voice.serviceId, start: new Date(at).toISOString() }, { save: (key, data) => executeCommand(s, { type: 'save', key, data }, { workspace }) });
    return made.error ? { error: made.error } : { id: made.id };
  }
  if (type.startsWith('phone-') || type.startsWith('ivr-') || type.startsWith('dialer-') || type === 'voice-turn') { const out = phoneCommand(s, type, d, { add, run, now, engine }); if (out !== undefined) return out; }
  // Server only: an e-mail that arrived at the sub-account's inbound address (Resend). It is the same as a
  // contact's message in Conversas (Cliente respondeu) and also fires "E-mail recebido". Never twice.
  if (type === 'email-inbound') {
    const externalId = str(d.id, 200);
    if (externalId && s.messages.some(row => row.externalId === externalId)) return '';
    const email = str(d.email, 254).toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail('E-mail inválido.');
    let contact = s.contacts.find(row => (row.email || '').toLowerCase() === email);
    if (!contact) {
      contact = add(s, 'contacts', { name: str(d.name, 120) || email, email, phone: '', tags: ['E-mail'], company: '', notes: '', custom: {} });
      run(s, 'Contact created', { contactId: contact.id });
    }
    const subject = str(d.subject, 240), body = str(d.body, 5000) || '(e-mail sem texto)';
    const msgId = executeCommand(s, { type: 'message', data: { contactId: contact.id, channel: 'Email', direction: 'Inbound', body, subject } }, { workspace });
    const row = find(s, 'messages', msgId);
    if (row && externalId) row.externalId = externalId;
    run(s, 'email_received', { contactId: contact.id, subject, from: email, body });
    return msgId;
  }
  // Server only: a file a client sends from the client portal. It goes to Arquivos (linked to the contact), leaves a
  // note in Conversas and fires "Arquivo enviado no portal do cliente". The 300 most recent portal files are kept.
  if (type === 'portal-file') {
    const data = mediaFile(d.data);
    const email = str(d.email, 160).toLowerCase();
    let contact = (d.contactId && find(s, 'contacts', d.contactId)) || (email && s.contacts.find(row => (row.email || '').toLowerCase() === email));
    if (!contact) {
      if (!email) fail('Contato não encontrado.', 404);
      contact = add(s, 'contacts', { name: str(d.name, 120) || email, email, phone: '', tags: ['Portal'], company: '', notes: '', custom: {} });
      run(s, 'Contact created', { contactId: contact.id });
    }
    const file = add(s, 'files', { name: str(d.fileName, 120) || 'arquivo', data, folder: '', source: 'portal', contactId: contact.id });
    const sent = s.files.filter(row => row.source === 'portal');
    for (const old of sent.slice(0, Math.max(0, sent.length - 300))) s.files = s.files.filter(row => row.id !== old.id);
    add(s, 'messages', { contactId: contact.id, body: `Arquivo enviado pelo portal: ${file.name}`, channel: 'Note', direction: 'Inbound', read: false, starred: false, origin: 'portal', fileId: file.id });
    run(s, 'portal_file_uploaded', { contactId: contact.id, fileId: file.id, name: file.name, kind: mediaKind(data) });
    return file.id;
  }
  // Server only: "Gerar imagem com IA" keeps the image as a public file (it is made to be sent); the oldest
  // generated images beyond 100 are removed.
  if (type === 'ai-media-file') {
    const file = add(s, 'files', { name: str(d.name, 120) || 'imagem-ia.webp', data: String(d.data || ''), folder: '', public: true, source: 'ai' });
    const generated = s.files.filter(row => row.source === 'ai');
    for (const old of generated.slice(0, Math.max(0, generated.length - 100))) s.files = s.files.filter(row => row.id !== old.id);
    return file.id;
  }
  // Server only: "Gerar vídeo com IA" — the OpenAI job while it runs, then the finished video (its bytes live in
  // media-<workspace>-<video>-<n> rows, like video testimonials).
  if (type === 'ai-video-job') {
    (s.aiVideoJobs ||= []).push({ jobId: str(d.jobId, 120), runId: str(d.runId, 60), stepId: str(d.stepId, 60), workflowId: str(d.workflowId, 60), variable: str(d.variable, 40), prompt: str(d.prompt, 500), started: now() });
    return d.jobId;
  }
  if (type === 'ai-video-done') {
    s.aiVideoJobs = (s.aiVideoJobs || []).filter(row => row.jobId !== d.jobId);
    if (!d.chunks && !d.r2Key) return '';
    const video = add(s, 'aiVideos', { id: str(d.id, 60), mime: 'video/mp4', ...(d.r2Key && { r2Key: str(d.r2Key, 200) }), chunks: Number(d.chunks) || 0, bytes: Number(d.bytes) || 0, prompt: str(d.prompt, 500), workflowId: str(d.workflowId, 60) });
    if (s.aiVideos.length > 50) s.aiVideos.splice(0, s.aiVideos.length - 50);
    return video.id;
  }
  // Server only: a WhatsApp message that came from a "Click to WhatsApp" ad (Evolution API webhook).
  if (type === 'whatsapp-ad-click') {
    const contact = find(s, 'contacts', d.contactId);
    if (!contact) return '';
    const touch = { source: 'facebook', medium: 'whatsapp_ad', campaign: str(d.title, 120), content: str(d.id, 80), term: '', utmId: '', gclid: '', fbclid: str(d.clickId, 120),
      referrer: '', landing: '', at: now(), channel: 'meta_ads' };
    contact.attribution = contact.attribution?.first ? { ...contact.attribution, last: touch } : { first: touch, last: touch };
    run(s, 'whatsapp_ad_click', { contactId: contact.id, adId: str(d.id, 80), title: str(d.title, 200), url: str(d.url, 500), body: str(d.body, 1000) });
    return contact.id;
  }
  if (type === 'tracking-event') return trackingEvent(s, d, { add, run, now });
  if (type === 'site-pageview') return sitePageview(s, d, { run, now });
  if (type === 'affiliate-settings') return saveAffiliateSettings(s, d);
  if (type === 'affiliate-portal-link') return issuePortalToken(s, str(id, 40));
  if (type === 'affiliate-signup') return affiliateSignup(s, d, { emit: (st, event, ctx) => engine.emit(st, event, ctx) });
  if (type === 'affiliate-click') return affiliateClick(s, d);
  if (type === 'commission-review') return reviewCommission(s, str(id, 40), d);
  if (type === 'affiliate-payout') return recordPayout(s, d, { add });
  if (type === 'reputation-settings') return saveReputation(s, d);
  if (type === 'gbp-reviews-import') return importGoogleReviews(s, d, { add, emit: (st, event, ctx) => engine.emit(st, event, ctx) });
  if (type === 'listing-save') return saveListing(s, d, directories);
  if (type === 'review-visibility') { const review = find(s, 'reviews', id) || fail('Avaliação não encontrada.', 404); review.hidden = d.hidden === true; review.updated = now(); return review.id; }
  if (type === 'video-start') return startVideoUpload(s, str(id, 40), d);
  if (type === 'video-chunk') return acceptVideoChunk(s, str(id, 40), d);
  if (type === 'video-finish') return finishVideoUpload(s, str(id, 40), d, { emit: (st, event, ctx) => engine.emit(st, event, ctx) });
  if (type === 'review-request') return sendReviewRequests(s, workspace, d, { add, outbox: queue });
  if (type === 'review-open') return Boolean(openReviewRequest(s, str(d.tokenHash, 64)));
  if (type === 'review-submit') return submitWorkspaceReview(s, { ...d, tokenHash: str(d.tokenHash, 64) }, { add, emit: (st, event, ctx) => engine.emit(st, event, ctx) });
  if (type === 'workflow-ai-result') return (Array.isArray(d.results) ? d.results.slice(0, 200) : []).filter(item => engine.aiResult(s, item)).length;
  if (type === 'workflow-outbox-result') {
    for (const item of Array.isArray(d.results) ? d.results.slice(0, 500) : []) {
      const target = find(s, 'runs', item?.runId);
      if (target) target.results.push(`${({ push: 'Notificação', phone: 'Telefonia', whatsapp: 'WhatsApp', email: 'E-mail', app: 'App', access: 'Acesso', copy: 'Cópia', meta: 'Meta', google: 'Google Ads', ga4: 'Google Analytics' })[item.kind] || 'Webhook'}: ${str(item.text, 120)}`);
      if (item?.failed && item.messageId) engine.messageFailed(s, { messageId: str(item.messageId, 40), reason: str(item.failed, 40) }, 1);
      const doc = item?.docId ? find(s, 'documents', item.docId) : item?.estimateId ? find(s, 'estimates', item.estimateId) : item?.invoiceId ? find(s, 'invoices', item.invoiceId) : item?.checkoutId ? (s.abandonedCheckouts || []).find(row => row.id === item.checkoutId) : item?.giftCardId ? (s.giftCards || []).find(row => row.id === item.giftCardId) : null;
      if (doc) (doc.audit ||= []).push({ at: now(), event: 'delivered', detail: str(item.text, 200) });
    }
    return true;
  }
  if (type === 'workflow-restore') {
    const workflow = find(s, 'deletedWorkflows', id);
    if (!workflow) fail('Fluxo excluído não encontrado.', 404);
    const { deletedAt, ...draft } = workflow;
    s.workflows.push({ ...draft, active: false, updated: now() });
    s.deletedWorkflows = s.deletedWorkflows.filter(row => row.id !== id);
    return id;
  }
  if (type === 'workflow-move') {
    const workflow = find(s, 'workflows', id);
    if (!workflow) fail('Fluxo não encontrado.', 404);
    workflow.folderId = exists(s, 'workflowFolders', d.folderId, 'folder', true);
    workflow.updated = now();
    return id;
  }
  if (['dashboard-create','dashboard-save','dashboard-restore','dashboard-report','dashboard-default','dashboard-timezone','dashboard-delete'].includes(type)) {
    return changeDashboard(s,{ ...command,data:d },uid,now());
  }
  if (['report-create','report-save','report-delete','report-share','report-schedule','report-sent'].includes(type)) return changeReport(s,{ ...command,data:d },uid,now());
  if (typeof type === 'string' && type.startsWith('social-')) {
    if (type === 'social-interaction-trigger') {
      const channel = d.network === 'facebook' ? 'Facebook' : 'Instagram';
      // A direct message from Meta's webhook carries the sender's page-scoped id: that id, not the name, finds the contact.
      const metaKey = /^\d{3,64}$/.test(String(d.senderId || '')) && /^\d{3,64}$/.test(String(d.accountId || '')) ? `${d.network === 'facebook' ? 'facebook' : 'instagram'}:${d.accountId}` : '';
      const mid = str(d.mid, 200);
      if (mid && s.messages.some(row => row.externalId === mid)) return { ok: true, duplicate: true, contactId: '', msgId: '' };
      let contact = d.contactId ? find(s, 'contacts', d.contactId) : null;
      if (!contact && metaKey) {
        contact = s.contacts.find(c => c.metaIds?.[metaKey] === String(d.senderId));
        if (!contact) {
          contact = add(s, 'contacts', { name: str(d.authorName, 120) || `Contato do ${channel}`, tags: [channel], source: channel });
          run(s, 'Contact created', { contactId: contact.id });
        }
      }
      if (contact && metaKey && contact.metaIds?.[metaKey] !== String(d.senderId)) contact.metaIds = { ...(contact.metaIds || {}), [metaKey]: String(d.senderId) };
      if (!contact && (d.authorName || d.handle)) {
        const query = (d.handle || d.authorName).toLowerCase().replace(/^@/, '');
        contact = s.contacts.find(c => (c.name || '').toLowerCase() === query || (c.company || '').toLowerCase() === query);
        if (!contact) {
          contact = add(s, 'contacts', {
            name: d.authorName || (d.handle ? `@${d.handle.replace(/^@/, '')}` : 'Seguidor Social'),
            tags: [channel],
            source: channel
          });
        }
      }
      let msgId = '';
      if (contact && d.body) {
        msgId = add(s, 'messages', {
          contactId: contact.id,
          body: str(d.body, 5000),
          channel,
          direction: 'Inbound',
          read: false,
          starred: false,
          origin: 'human',
          ...(mid ? { externalId: mid } : {})
        }).id;
        run(s, 'Customer replied', { contactId: contact.id, channel, body: d.body });
      }
      const event = d.kind === 'comment' ? 'social_comment_received' : 'social_dm_received';
      run(s, event, { ...d, contactId: contact?.id || d.contactId || '' });
      return { ok: true, contactId: contact?.id || '', msgId };
    }
    return socialCommand(s, { ...command, data:d }, { add, now });
  }
  if (type === 'chat-start' || type === 'chat-send') return chatCommand(s, { ...command, data:d }, { add, now, run });
  if (type === 'blog-view') return blogView(s, id);
  if (type === 'offer-checkout') return offerCheckout(s, id, d, { add, run });
  if (type === 'payment-link-checkout') return paymentLinkCheckout(s, id, d, { add, run });
  if (type === 'offer-access') return offerAccessCommand(s, d, { run });
  if (typeof type === 'string' && /^event-(message|send|groups)-/.test(type)) return eventSendCommand(s, { ...command, data: d }, { add, zone: s.profile?.timezone || 'America/Sao_Paulo', emit: (event, ctx) => run(s, event, ctx), instant: (day, time) => zonedInstant(day, time, s.profile?.timezone || 'America/Sao_Paulo') });
  if (typeof type === 'string' && type.startsWith('event-plan-')) { const out = eventPlanCommand(s, { ...command, data:d }, { add, now, save: (key, data, itemId = '') => executeCommand(s, { type: 'save', key, id: itemId, data }, { workspace }), createSocial: data => executeCommand(s, { type: 'social-post', data }, { workspace }), emit: (event, ctx) => run(s, event, ctx), calendarInstant: (day, time) => zonedInstant(day, time, s.profile?.timezone || 'America/Sao_Paulo') }); if (out !== undefined) return out; }
  if (typeof type === 'string' && type.startsWith('community-event-')) return communityEventCommand(s, { ...command, data:d }, { add, run, now });
  if (['community-plan-invoice', 'community-welcome', 'community-newsletter', 'community-activity', 'portal-login'].includes(type)) return communityCommand(s, { ...command, data:d }, { add, run, now });
  if (type === 'course-activity') return courseActivityCommand(s, { ...command, data:d }, { add, run });
  if (type === 'credential-issue' || type === 'credential-revoke') return credentialCommand(s, { ...command, data:d }, { add, run });
  if (['contact-restore', 'contact-trash-purge', 'contact-trash-empty'].includes(type)) return trashCommand(s, { ...command, data:d });
  if (['seo-settings', 'seo-audit', 'visibility-settings', 'visibility-run'].includes(type)) return seoCommand(s, { ...command, data:d }, { now });
  if (['meeting-transcript', 'meeting-summary', 'meeting-tasks', 'meeting-note'].includes(type)) return meetingCommand(s, { ...command, data:d }, { add, run, now });
  if (['scheduling-settings', 'scheduling-book', 'field-status'].includes(type)) return schedulingCommand(s, { ...command, data:d }, { save: (key, data) => executeCommand(s, { type:'save', key, data }, { workspace }), run, now });
  if (type === 'labs-toggle') return toggleLab(s, { key: str(d.key, 60), on: d.on });
  if (typeof type === 'string' && type.startsWith('preferences-')) return preferenceCommand(s, { ...command, data:d }, { run, now });
  if (typeof type === 'string' && type.startsWith('loyalty-')) return loyaltyCommand(s, { ...command, data:d }, { add, run, actor: str(command.actor, 80) });
  if (type === 'sequence-enroll' || type === 'sequence-remove') return sequenceCommand(s, { ...command, data:d });
  if (typeof type === 'string' && type.startsWith('ticket-')) return ticketCommand(s, { ...command, data:d }, { add, run, actor: str(command.actor, 80) });
  if (typeof type === 'string' && type.startsWith('document-')) return documentCommand(s, { ...command, data:d }, { workspace, run });
  if (typeof type === 'string' && type.startsWith('estimate-')) return estimateCommand(s, { ...command, data:d }, { workspace, run });
  if (typeof type === 'string' && type.startsWith('email-')) return emailCommand(s, { ...command, data:d }, { run, add });
  if (typeof type === 'string' && type.startsWith('invoice-')) return invoiceCommand(s, { ...command, data:d }, { workspace, run });
  if (type === 'store-checkout') { const orderId = storeCheckout(s, { ...command, data:d }, { add, run }); checkoutConverted(s, d.session, find(s, 'orders', orderId), run); return orderId; }
  if (type === 'store-cart') return captureCart(s, id, d, { run });
  if (type === 'store-view') return productViewed(s, id, d, { run });
  if (type === 'store-review') return submitReview(s, id, d, run);
  if (typeof type === 'string' && type.startsWith('catalog-')) return catalogCommand(s, { ...command, data:d }, { workspace });
  if (type === 'store-cart-restore') return restoreCart(s, id, str(d.tokenHash, 64));
  if (type === 'checkout-tick') return checkoutTick(s, d.at ? Date.parse(d.at) : Date.now(), { workspace, run, add });
  // Só do servidor (cron e webhook): não estão em authorization.mjs, então /api/action recusa.
  if (type === 'store-orders-expire') {
    const due = expiredOrders(s, d.at ? Date.parse(d.at) : Date.now());
    for (const orderId of due) {
      const order = find(s, 'orders', orderId);
      executeCommand(s, { type: 'save', key: 'orders', id: orderId, data: { id: orderId, status: 'Cancelled', note: order.note, tracking: order.tracking } }, { workspace });
      find(s, 'orders', orderId).expiredAt = new Date().toISOString();
    }
    return due.length;
  }
  if (type === 'store-order-paid-late') return orderPaidLate(s, id, run);
  if (typeof type === 'string' && type.startsWith('checkout-')) return checkoutCommand(s, { ...command, data:d }, { workspace });
  if (['webinar-register','webinar-attend','webinar-reminders'].includes(type)) return webinarCommand(s, { ...command, data:d }, { add, run, now });
  if (type === 'qr-scan') return qrScan(s, id, d);
  if (mediaCommandTypes.includes(type)) return mediaCommand(s, type, d, remove);
  // Server-only (not in the client command list): records written after the bytes landed in R2.
  if (type === 'media-stored') return storedFile(s, d, workspace);
  if (type === 'video-stored') {
    const row = s.videoTestimonials.find(item => item.id === d.id);
    if (!row || typeof d.r2Key !== 'string' || d.r2Key !== `ws/${workspace}/videos/${row.id}`) return '';
    row.r2Key = d.r2Key;
    row.chunks = 0;
    return row.id;
  }
  if (type === 'studio-meta') return studioMeta(s, id, d);
  if (type === 'studio-visit' || type === 'studio-star') {
    const project = find(s,'studioProjects',id);
    if (!project) fail('Project not found.',404);
    if (type === 'studio-visit') project.viewedAt=now();
    else project.starred=Boolean(d.starred);
    return id;
  }
  if (type === 'prancheta-save') {
    const existing = id ? s.pranchetaFiles.find(item => item.id === id) : null;
    checkPranchetaSave(existing, d, fail);
    if (existing) return applyPranchetaSave(existing, s, d, now).id;
    const record = pranchetaFileRecord(s, d);
    const at = now();
    const created = add(s, 'pranchetaFiles', { ...record, id: id || uid(), created: at, updated: at });
    return created.id;
  }
  if (type === 'prancheta-delete') {
    const existing = find(s, 'pranchetaFiles', id);
    if (!existing) fail('Design não encontrado.', 404);
    s.pranchetaFiles = s.pranchetaFiles.filter(item => item.id !== id);
    return id;
  }
  if (type === 'prancheta-duplicate') {
    const existing = find(s, 'pranchetaFiles', id);
    if (!existing) fail('Design não encontrado.', 404);
    const copy = structuredClone(existing);
    copy.id = uid();
    copy.name = `${existing.name} (Cópia)`.slice(0, 150);
    copy.created = now();
    copy.updated = now();
    s.pranchetaFiles.unshift(copy);
    return copy.id;
  }
  if (type === 'prancheta-export-media') {
    const existing = id ? find(s, 'pranchetaFiles', id) : null;
    const dataUri = d.data || existing?.thumbnail;
    if (!dataUri || typeof dataUri !== 'string') fail('Imagem inválida para exportação.');
    const fileName = str(d.name || existing?.name || 'Arte Prancheta', 120);
    const savedFile = add(s, 'files', {
      name: `${fileName.replace(/\.png$/i, '')}.png`,
      data: dataUri,
      size: Math.round(dataUri.length * 0.75),
      type: 'image/png'
    });
    return savedFile.id;
  }
  if (type === 'prancheta-to-social') {
    const existing = id ? find(s, 'pranchetaFiles', id) : null;
    const dataUri = d.data || existing?.thumbnail;
    if (!dataUri || typeof dataUri !== 'string') fail('Imagem inválida para o post.');
    const fileName = str(d.name || existing?.name || 'Arte Prancheta', 120);
    const file = add(s, 'files', {
      name: `${fileName.replace(/\.png$/i, '')}.png`,
      data: dataUri,
      size: Math.round(dataUri.length * 0.75),
      type: 'image/png'
    });
    // A draft in the Social Planner's own shape, ready to pick accounts and schedule.
    const post = add(s, 'socialPosts', {
      type: 'post', summary: str(d.body || existing?.name || 'Arte criada na Prancheta graao', 2000), overrides: {}, accountIds: [],
      media: [{ fileId: file.id, name: file.name, type: 'image' }], link: '', firstComment: '', location: '', userTags: '', categoryId: '', tags: [],
      needsApproval: false, source: 'post', scheduleDate: '', recurrence: null, status: 'draft', approval: '', results: [], createdBy: 'Prancheta', error: ''
    });
    return { fileId: file.id, postId: post.id };
  }
  if (type === 'prancheta-template') {
    const templates = createCanonicalTemplates();
    const tpl = templates.find(t => t.id === d.templateId) || templates[0];
    const created = add(s, 'pranchetaFiles', {
      name: tpl.name,
      format: tpl.format,
      width: tpl.width,
      height: tpl.height,
      pages: structuredClone(tpl.pages),
      thumbnail: '',
      tags: ['Template', tpl.format],
      created: now(),
      updated: now()
    });
    return created.id;
  }
  if (type === 'pipeline') {
    const name = req(d.name,'Pipeline name',80);
    const previous = id && find(s,'pipelines',id);
    if (id && !previous) fail('Pipeline not found.',404);
    if (previous) { previous.name = name; return previous.id; }
    if (s.pipelines.length >= 30) fail('A workspace can have up to 30 pipelines.');
    const pipeline = add(s,'pipelines',{ name });
    for (const label of ['New Lead','Qualified','Proposal']) add(s,'stages',{ name:label, pipelineId:pipeline.id });
    return pipeline.id;
  }
  if (type === 'import') {
    if (!Array.isArray(d.rows) || !d.rows.length || d.rows.length>500) fail('Import between 1 and 500 contacts at a time.');
    let added=0;
    for (const input of d.rows) {
      if (!input || typeof input!=='object') fail('Invalid contact in import.');
      // An invalid document does not hold back the contact: it comes in without it.
      const row=fields.contacts(s,input.taxId !== undefined && !taxIdKind(input.taxId) ? { ...input, taxId:'' } : input);
      if (row.email && s.contacts.some(c=>c.email===row.email)) continue;
      const contact=add(s,'contacts',row); run(s,'Contact created',{contactId:contact.id}); added++;
    }
    add(s,'imports',{ source:'CSV', file:str(d.file,120), user:str(command.actor,120), found:d.rows.length, added, skipped:d.rows.length-added, status:'Completed' });
    if (s.imports.length > 100) s.imports.splice(0, s.imports.length - 100);
    return added;
  }
  if (type === 'opportunity-import') {
    if (!Array.isArray(d.rows) || !d.rows.length || d.rows.length > 500) fail('Importe de 1 a 500 oportunidades por arquivo.');
    const defaultPipeline = exists(s,'pipelines',d.pipelineId,'pipeline');
    const choices = (records, value, label) => {
      const key = str(value).toLowerCase();
      const direct = records.find(row => row.id === key);
      if (direct) return direct;
      const matches = records.filter(row => row.name.toLowerCase() === key);
      if (matches.length !== 1) fail(`Selecione um(a) ${label} com nome ou ID único.`);
      return matches[0];
    };
    const rows = d.rows.map((input,index) => {
      try {
        if (!input || typeof input !== 'object') fail('Linha inválida.');
        const address = email(input.email);
        const found = address ? s.contacts.filter(contact => contact.email?.toLowerCase() === address) : [];
        const contact = find(s,'contacts',input.contactid) || (found.length === 1 ? found[0] : null);
        if (!contact) fail('Informe o e-mail único ou o ID de um contato existente.');
        const pipeline = input.pipeline ? choices(s.pipelines,input.pipeline,'pipeline').id : defaultPipeline;
        const stages = s.stages.filter(stage => stage.pipelineId === pipeline);
        const stage = input.stage ? choices(stages,input.stage,'etapa') : stages[0];
        const status = input.status ? opportunityStatuses.find(value => value.toLowerCase() === str(input.status).toLowerCase()) : 'Open';
        if (!status) fail('Use Open, Won, Lost ou Abandoned no status.');
        const value = str(input.value).replace(',', '.') || 0;
        return fields.opportunities(s,{...input,contactId:contact.id,stage:stage?.id,status,value,
          closeDate:input.closedate,lostReason:input.lostreason});
      } catch (error) {
        fail(`Linha ${index + 2}: ${error.message}`);
      }
    });
    const created = now();
    for (const details of rows) add(s,'opportunities',{ ...details, slips:0, statusChangedAt:created });
    add(s,'imports',{ object:'opportunities', source:'CSV', file:str(d.file,120), user:str(command.actor,120),
      found:rows.length, added:rows.length, skipped:0, status:'Completed' });
    if (s.imports.length > 100) s.imports.splice(0,s.imports.length - 100);
    return rows.length;
  }
  if (type === 'opportunity-move') {
    const record = find(s,'opportunities',id);
    if (!record) fail('Oportunidade não encontrada.',404);
    const stage = find(s,'stages',d.stage);
    if (!stage) fail('Selecione uma etapa válida.');
    if (record.stage !== stage.id) {
      const at = now(); // um só instante: updated e stageChangedAt iguais
      Object.assign(record,{ stage:stage.id, pipelineId:stage.pipelineId, updated:at, stageChangedAt:at });
      run(s,'Opportunity stage changed',record);
    }
    return id;
  }
  if (type === 'save') {
    if (!Object.hasOwn(fields,key)) fail('Unknown record type.');
    const prior = id ? find(s,key,id) : null;
    if (id && !prior) fail('Record not found.',404);
    if (key==='files' && !prior && s.files.length>=60) fail('The local drive holds up to 60 files.');
    if (key==='studioProjects' && !prior && s.studioProjects.length>=60) fail('A workspace can have up to 60 Studio projects.');
    const details = fields[key](s, key === 'workflows' ? { ...prior, ...d, id } : { ...d, id });
    if (key === 'contacts') rejectDuplicateContact(s, { ...prior, ...details }, prior);
    const row = prior ? { ...prior, ...details, updated: now() } : add(s,key,details);
    // Datas de mudança da oportunidade: o mesmo instante da gravação (updated, ou created se o registro é novo).
    const savedAt = prior ? row.updated : row.created;
    if (key==='agents' && prior) {
      row.revision = uid();
      if (prior.published) row.active = true;
    }
    if (key === 'opportunities') {
      row.statusChangedAt = !prior || row.status !== prior.status ? savedAt : prior.statusChangedAt || prior.created;
      row.stageChangedAt = !prior || row.stage !== prior.stage ? savedAt : prior.stageChangedAt || prior.created;
    }
    if (key === 'studioProjects' && !prior) row.viewedAt = row.created;
    if (['bulkActions','imports'].includes(key)) fail('Unknown record type.');
    if (key === 'transactions' && prior) transactionFact(s, prior, row);
    afterSave(s, key, prior, row, add);
    storeAfterSave(s, key, prior, row, add);
    catalogAfterSave(s, key, prior, row, workspace);
    documentAfterSave(s, key, prior, row, run);
    estimateAfterSave(s, key, prior, row, run);
    invoiceAfterSave(s, key, prior, row, workspace);
    if (prior) s[key] = s[key].map(r=>r.id===id ? row : r);
    engine.recordChange(s, key, prior, row);
    if (key === 'eventPlans') {
      eventSendsAfterSave(s, prior, row, { instant: (day, time) => zonedInstant(day, time, s.profile?.timezone || 'America/Sao_Paulo') });
      eventPlanAfterSave(prior, row, (event, ctx) => run(s, event, ctx));
    }
    if (key === 'affiliates') affiliateCampaignChanges(s, prior, row, { emit: (st, event, ctx) => engine.emit(st, event, ctx) });
    return row.id;
  }
  if (type === 'delete') {
    if (!Object.hasOwn(fields,key) || !find(s,key,id)) fail('Record not found.',404);
    return remove(s, key, id);
  }
  if (type === 'bulk') {
    return bulk(s, d, { add, remove, actor: command.actor, tags, stageOf: stageId => find(s,'stages',stageId),
      tagged: (row, before) => tagsChanged(s, row, before, run),
      moved: row => run(s,'Opportunity stage changed',row) });
  }
  return other(s, command, type, key, id, d, workspace);
}

// Deletes one record and everything that only made sense with it. Shared by single and bulk deletes.
function remove(s, key, id) {
    if (key === 'transactions') transactionDeleted(s, find(s, key, id));
    beforeDelete(s, key, id);
    socialBeforeDelete(s, key, id);
    chatBeforeDelete(s, key, id);
    blogBeforeDelete(s, key, id);
    storeBeforeDelete(s, key, id);
    if (key === 'resources') for (const service of s.services || []) service.resourceIds = (service.resourceIds || []).filter(r => r !== id);
    webinarBeforeDelete(s, key, id);
    mediaBeforeDelete(s, key, id);
    offerBeforeDelete(s, key, id);
    academyBeforeDelete(s, key, id);
    communityEventBeforeDelete(s, key, id);
    courseOfferBeforeDelete(s, key, id);
    certificateBeforeDelete(s, key, id);
    documentBeforeDelete(s, key, id);
    estimateBeforeDelete(s, key, id);
    invoiceBeforeDelete(s, key, id);
    emailBeforeDelete(s, key, id);
    eventSendsBeforeDelete(s, key, id);
    checkoutBeforeDelete(s, key, id);
    catalogBeforeDelete(s, key, id);
    if (key==='contacts') {
      trashContact(s, id);
      for (const related of ['tasks','opportunities','messages','appointments','invoices','threads']) s[related] = s[related].filter(r=>r.contactId!==id);
      for (const row of s.submissions.filter(r=>r.contactId===id)) { row.contactId=''; row.name=''; row.email=''; }
      for (const pending of s.manualActions.filter(item => item.contactId === id)) {
        pending.contactId = '';
        if (pending.status === 'Pending') pending.status = 'Canceled';
      }
      for (const execution of s.runs.filter(item => item.contactId === id)) {
        execution.contactId = '';
        if (execution.status === 'Waiting') {
          execution.status = 'Canceled';
          execution.results.push('Contact deleted.');
        }
      }
      s.linkTickets = s.linkTickets.filter(ticket => ticket.contactId !== id);
      for (const click of s.linkClicks.filter(click => click.contactId === id)) click.contactId = '';
    }
    if (key==='forms') s.pages.forEach(p=>{ if (p.formId===id) p.formId=''; });
    for (const [collection, reference] of [['forms', 'formId'], ['triggerLinks', 'linkId']]) {
      if (key !== collection) continue;
      for (const workflow of [...s.workflows, ...s.deletedWorkflows]) {
        if (workflow[reference] === id) workflow.active = false;
      }
    }
    if (key === 'snippetFolders') s.snippets.forEach(snippet => { if (snippet.folderId === id) snippet.folderId = ''; });
    if (key === 'triggerLinks') {
      s.linkTickets = s.linkTickets.filter(ticket => ticket.linkId !== id);
      s.linkClicks = s.linkClicks.filter(click => click.linkId !== id);
    }
    if (key === 'workflowFolders') {
      for (const row of [...s.workflows, ...s.deletedWorkflows, ...s.workflowLists]) {
        if (row.folderId === id) row.folderId = '';
      }
    }
    if (key === 'workflows') {
      s.deletedWorkflows.push({ ...find(s, key, id), active: false, deletedAt: now() });
      const sla = s.conversationSla;
      sla.workflows = sla.workflows.filter(item => item !== id);
      if (sla.automation === 'selected' && !sla.workflows.length) sla.automation = 'none';
    }
    s[key] = s[key].filter(r=>r.id!==id);
    return id;
}

function other(s, command, type, key, id, d, workspace) {
  if (type === 'message') {
    const c = contactId(s, d.contactId);
    const channel = one(d.channel, messageChannels, 'channel');
    const direction = one(d.direction, ['Outbound','Inbound'], 'direction');
    let body = req(d.body, 'Message', 5000);
    if (direction === 'Outbound') {
      // Each trigger link becomes a per-contact ticket. The server passes its public origin so the link
      // also works outside the app (WhatsApp, e-mail); without it the path stays relative.
      const tickets = new Map();
      let base = '';
      try { const url = new URL(String(d.origin || '')); if (['https:', 'http:'].includes(url.protocol)) base = url.origin; } catch { base = ''; }
      body = body.replace(/\{\{trigger_link\.([a-f0-9-]{36})\}\}/g, (_, linkId) => {
        exists(s, 'triggerLinks', linkId, 'trigger link');
        if (!tickets.has(linkId)) tickets.set(linkId, add(s, 'linkTickets', { linkId, contactId: c, channel }).id);
        return `${base}/r/${workspace}/${tickets.get(linkId)}`;
      });
    }
    const msgId = add(s, 'messages', { contactId: c, body, subject: channel === 'Email' ? str(d.subject, 240) : '',
      channel, direction, read: direction !== 'Inbound', starred: false, origin: 'human' }).id;
    if (direction === 'Inbound') run(s, 'Customer replied', { contactId: c, channel, body });
    if (channel === 'Note') run(s, 'note_added', { contactId: c, body });
    else if (direction === 'Outbound') run(s, 'user_replied', { contactId: c, channel, body, user: str(command.actor, 80) });
    return msgId;
  }
  // Server-internal (not accepted from /api/action): "Copiar contato" from another sub-account of the agency.
  // An existing contact (same e-mail or phone) only gets its empty fields filled and the tags added.
  if (type === 'contact-copy-in') {
    const email = str(d.email, 160).toLowerCase(), phone = str(d.phone, 48), name = str(d.name, 120), company = str(d.company, 120);
    const digits = value => String(value || '').replace(/\D/g, '');
    // The same phone with or without the country code (+55): one ends with the other, 10+ digits in common.
    const samePhone = (a, b) => { const [short, long] = [digits(a), digits(b)].sort((x, y) => x.length - y.length); return short.length >= 10 && long.endsWith(short); };
    const incoming = tags(d.tags);
    const existing = s.contacts.find(row => (email && String(row.email || '').toLowerCase() === email) || samePhone(row.phone, phone));
    if (existing) {
      execute(s, { type: 'save', key: 'contacts', id: existing.id, data: { ...existing, name: existing.name || name, email: existing.email || email,
        phone: existing.phone || phone, company: existing.company || company, tags: [...new Set([...(existing.tags || []), ...incoming])] } });
      return { id: existing.id, created: false };
    }
    if (!email && !phone && !name) fail('O contato não tem dados para copiar.');
    const id = execute(s, { type: 'save', key: 'contacts', data: { name: name || email || phone, email, phone, company, tags: incoming, custom: {},
      notes: d.from ? `Copiado da subconta ${str(d.from, 120)}` : '' } });
    return { id, created: true };
  }
  // Server-internal (not accepted from /api/action): a message from the team that the provider did not deliver.
  if (type === 'message-failed') return engine.messageFailed(s, { messageId: str(d.messageId, 40), reason: str(d.reason, 40) });
  if (type === 'manual-action') return finishManualAction(s, id, d);
  if (type === 'conversation-sla') return saveSla(s, d);
  if (type === 'dismiss-sla') {
    const message = find(s, 'messages', id);
    if (!s.conversationSla.enabled || message?.direction !== 'Inbound' || !slaChannels.includes(message.channel)) fail('SLA timer not found.', 404);
    message.slaDismissedAt ??= now();
    return id;
  }
  if (type === 'thread') {
    const ids = Array.isArray(d.contactIds) ? d.contactIds : [d.contactId];
    if (!ids.length || ids.length > 200) fail('Choose between 1 and 200 conversations.');
    const me = str(command.actor, 80) || 'Owner';
    for (const c of new Set(ids.map(value => contactId(s, value)))) {
      const rows=s.messages.filter(r=>r.contactId===c);
      if (Object.hasOwn(d,'read')) rows.forEach(r=>{r.read=Boolean(d.read);});
      if (Object.hasOwn(d,'starred')) rows.forEach(r=>{r.starred=Boolean(d.starred);});
      if (!Object.hasOwn(d,'assignee') && !Object.hasOwn(d,'follow')) continue;
      let meta = s.threads.find(r => r.contactId === c);
      if (!meta) meta = add(s, 'threads', { contactId: c, assignee: '', followers: [] });
      if (Object.hasOwn(d,'assignee')) meta.assignee = str(d.assignee, 80);
      if (Object.hasOwn(d,'follow')) meta.followers = d.follow ? [...new Set([...meta.followers, me])] : meta.followers.filter(name => name !== me);
      meta.updated = now();
    }
    return ids.length === 1 ? ids[0] : ids.length;
  }
  if (type === 'team-message') {
    const row = add(s, 'teamMessages', { author: str(command.actor, 80) || 'Owner', body: req(d.body, 'Message', 2000) });
    if (s.teamMessages.length > 500) s.teamMessages.splice(0, s.teamMessages.length - 500);
    return row.id;
  }
  if (type === 'submit') {
    const form = find(s,'forms',id);
    if (!form?.active) fail('Form not found.',404);
    if (!formOpen(form)) fail(form.schedule?.closedMessage || 'Este formulário não está recebendo respostas agora.',403);
    const read = readAnswers(form, d, s.customFields || []);
    if (!read.ok) fail(Object.entries(read.errors).map(([key, text]) => key === '_form' ? text : `${form.fields?.find(f => f.key === key)?.label || key}: ${text}`)[0]);
    // O campo livre dos sites publicados (mensagem, assunto, interesse) não faz parte do formulário da subconta.
    const message = str(d._message,2000);
    if (message) read.answers.push({ key:'message', label:'Mensagem', value:message });
    const outcome = outcomeOf(form, read);
    const info = read.contact, addTags = tags([...(form.addTags || []), ...(read.result?.tierDetail?.tag ? [read.result.tierDetail.tag] : []), ...outcome.tags]);
    let c = (info.email && s.contacts.find(r=>r.email===info.email)) || (info.phone && s.contacts.find(r=>digits(r.phone) && digits(r.phone)===digits(info.phone)));
    if (!c) {
      c=add(s,'contacts',{ name:info.name || 'Contato do formulário', email:info.email, phone:info.phone, tags:addTags, company:info.company, notes:'', custom:customData(s,'Contact',{ custom:read.custom }) });
      run(s,'Contact created',{contactId:c.id});
    } else {
      if (!c.phone && info.phone) c.phone = info.phone;
      if (!c.email && info.email) c.email = info.email;
      if (!c.company && info.company) c.company = info.company;
      if (Object.keys(read.custom).length) c.custom = customData(s,'Contact',{ custom:{ ...(c.custom || {}), ...read.custom } });
      if (addTags.length) { const before = c.tags || []; c.tags = tags([...before, ...addTags]); tagsChanged(s, c, before, run); }
      c.updated = now();
    }
    const submission=add(s,'submissions',{ formId:id, contactId:c.id, name:info.name || c.name, email:info.email, phone:info.phone, answers:read.answers, source:str(d._source,40) || 'Link', ...(form.routes?.length ? { qualified:outcome.qualified } : {}), ...(read.result ? { result:{ score:read.result.score, max:read.result.max, percent:read.result.percent, tier:read.result.tier, categories:read.result.categories } } : {}) });
    if (s.submissions.length > 5000) s.submissions.splice(0, s.submissions.length - 5000);
    linkVisitor(s, d._vid, c.id);
    // Quem vai para a agenda (ou para uma página que a mostra) chega com o que digitou, nunca com os dados guardados.
    if (outcome.qualified && ['booking','page'].includes(outcome.dest.action) && s.scheduling?.enabled)
      createBookingLink(s, '', c, { serviceId:outcome.dest.serviceId || '', days:2, person:{ name:info.name === info.email || info.name === info.phone ? '' : info.name, email:info.email, phone:info.phone }, submissionId:submission.id });
    run(s,'Form submitted',{contactId:c.id,formId:id,tier:read.result?.tier || '',qualified:outcome.qualified ? 'yes' : 'no'});
    return submission.id;
  }
  if (type === 'form-view') {
    const form = find(s,'forms',id);
    if (!form?.active) fail('Form not found.',404);
    const day = now().slice(0,10), byDay = { ...(form.viewsByDay || {}) };
    byDay[day] = (byDay[day] || 0) + 1;
    form.viewsByDay = Object.fromEntries(Object.entries(byDay).sort(([a],[b]) => a.localeCompare(b)).slice(-120));
    form.views = (form.views || 0) + 1;
    return form.views;
  }
  if (type === 'onboarding') {
    const kind=one(d.kind,['small','agency','saas','other'],'business type');
    const goal=d.goal ? one(d.goal,['contacts','opportunities','calendars','sites','automation'],'goal') : '';
    if (d.done && !goal) fail('Choose a goal.');
    s.onboarding={kind,goal,done:Boolean(d.done)}; return kind;
  }
  if (type === 'profile') {
    const timezone=req(d.timezone,'Time zone');
    try { new Intl.DateTimeFormat('en',{timeZone:timezone}); } catch { fail('Use an IANA time zone, for example America/Sao_Paulo.'); }
    s.profile={name:req(d.name,'Workspace name'),email:email(d.email),phone:str(d.phone,48),timezone,currency:defaults.profile.currency}; return s.profile.name;
  }
  if (type === 'fiscal') { s.fiscal = sanitizeFiscal(d); return s.fiscal.taxId; }
  if (type === 'stage') {
    const previous = id && find(s,'stages',id);
    if (id && !previous) fail('Stage not found.',404);
    const name = req(d.name,'Stage name',50), probability = percent(d.probability);
    const color = stageColors.includes(d.color) ? d.color : '';
    if (previous) { Object.assign(previous,{ name, visible:d.visible !== false, probability, ...('color' in d ? { color } : {}) }); return previous.id; }
    const pipelineId = exists(s,'pipelines',d.pipelineId || salesPipeline,'pipeline');
    return add(s,'stages',{ name, pipelineId, visible:d.visible !== false, probability, color }).id;
  }
  const piped = pipelineCommand(s, type, id, d, { add, uid, now });
  if (piped !== undefined) return piped;
  fail('Unknown operation.');
}
export function seed() {
  const s=blank();
  const ana=add(s,'contacts',{name:'Ana Martins',email:'ana@example.test',phone:'+55 11 5555-0101',company:'Studio Norte',tags:['Lead'],notes:'Interested in the onboarding package.'});
  const rafa=add(s,'contacts',{name:'Rafa Lima',email:'rafa@example.test',phone:'',company:'Ateliê Azul',tags:['Client'],notes:''});
  const lia=add(s,'contacts',{name:'Lia Costa',email:'lia@example.test',phone:'',company:'Casa Porto',tags:['Referral'],notes:''});
  add(s,'opportunities',{title:'Studio Norte · CRM setup',contactId:ana.id,stage:'new',value:1800,status:'Open'});
  add(s,'opportunities',{title:'Casa Porto · Growth plan',contactId:lia.id,stage:'proposal',value:3200,status:'Open'});
  add(s,'opportunities',{title:'Ateliê Azul · Starter plan',contactId:rafa.id,stage:'won',value:1250,status:'Won'});
  add(s,'messages',{contactId:ana.id,body:'Hi! I’d like to learn how the onboarding works.',direction:'Inbound',channel:'Note',read:false,starred:false});
  add(s,'messages',{contactId:rafa.id,body:'Welcome aboard, Rafa! Your project is ready to start.',direction:'Outbound',channel:'Note',read:true,starred:false});
  add(s,'tasks',{title:'Follow up on the growth proposal',contactId:lia.id,due:'',done:false});
  return s;
}

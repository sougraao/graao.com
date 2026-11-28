import { createSocialRoutes } from './routes/social.mjs';
import { createPortalRoutes } from './routes/portal.mjs';
import { createPranchetaRoutes } from './routes/prancheta.mjs';
import { createActionRoutes, createCommandRunner } from './routes/action.mjs';
import { createPlatformRoutes } from './routes/platform.mjs';
import { createPlatformMonitor } from './platform-monitor.mjs';
import { createAdsRoutes } from './routes/ads.mjs';
import { createBillingRoutes } from './routes/billing.mjs';
import { createEmailRoutes } from './routes/email.mjs';
import { createMcpRoutes } from './routes/mcp.mjs';
import { createMetaRoutes } from './routes/meta.mjs';
import { createGbpRoutes, createGoogleRoutes } from './routes/google.mjs';
import { createAgentRoutes } from './routes/agents.mjs';
import { createStudioRoutes } from './routes/studio.mjs';
import { createStoreApiRoutes, createStorePageRoutes } from './routes/stores.mjs';
import { createDocumentRoutes } from './routes/documents.mjs';
import { createReputationRoutes } from './routes/reputation.mjs';
import { createSiteRoutes } from './routes/sites.mjs';
import { createWebinarRoutes } from './routes/webinars.mjs';
import { createQrRoutes } from './routes/qr.mjs';
import { createAffiliateRoutes } from './routes/affiliates.mjs';
import { createOfferApiRoutes, createOfferPageRoutes } from './routes/offers.mjs';
import { createPaymentLinkRoutes } from './routes/payment-links.mjs';
import { hostingDomains, isPlatformHost, requestHost, requireFreeDomain, whiteLabelAgency, whiteLabelHost } from './white-label.mjs';
import { createBookingRoutes } from './routes/booking.mjs';
import { createPreferenceRoutes } from './routes/preferences.mjs';
import { createAgencyAppRoutes } from './routes/agency-apps.mjs';
import { createCertificateRoutes } from './routes/certificates.mjs';
import { createShareRoutes } from './routes/shares.mjs';
import { createBlogRoutes } from './routes/blog.mjs';
import { createChatRoutes } from './routes/chat.mjs';
import { createFormRoutes } from './routes/forms.mjs';
import { createWorkflowHookRoutes } from './routes/workflow-hooks.mjs';
import { createCountdownRoutes } from './routes/countdowns.mjs';
import { createEmailTrackingRoutes } from './routes/email-tracking.mjs';
import { createLinkRoutes } from './routes/links.mjs';
import { createInboxRoutes } from './routes/inbox.mjs';
import { createWhatsappRoutes, createWhatsappWebhookRoutes } from './routes/whatsapp.mjs';
import { createAskRoutes } from './routes/ask.mjs';
import { createVerifyRoutes } from './routes/verify.mjs';
import { createBrandAIRoutes, createContentAIRoutes, createConversationAIRoutes } from './routes/content-ai.mjs';
import { createSeoRoutes } from './routes/seo.mjs';
import { createAbacatePayRoutes, createAbacatePayWorkspaceRoutes, createWalletRoutes } from './routes/payments.mjs';
import { createDriveRoutes, createPublicMediaRoutes, createVideoRoutes } from './routes/media.mjs';
import { createTrackingRoutes } from './routes/tracking.mjs';
import { createProspectPublicRoutes } from './routes/prospect-public.mjs';
import { createPublicApiRoutes } from './routes/public-api.mjs';
import { createAccountRoutes, createWhiteLabelRoutes } from './routes/account.mjs';
import { createAgencyRoutes } from './routes/agency.mjs';
import { createGhlImportRoutes, GHL_IMPORT_PUBLIC } from './routes/ghl-import.mjs';
import { jobView } from './ghl-import-model.mjs';
import { createFaviconRoutes, createPageRoutes } from './routes/pages.mjs';
import { createWorkspaceRoutes } from './routes/workspace.mjs';
import { createConnectorHookRoutes, createConnectorRoutes } from './routes/connectors.mjs';
import { createPhoneRoutes, createTwilioWebhookRoutes } from './routes/phone.mjs';
import { createAuthRoutes } from './routes/auth.mjs';
import { createPushRoutes } from './routes/push.mjs';
import { NEXT_ROUTE } from './routes/next-route.mjs';
import { createServer } from 'node:http';
import { checkEmailAddress } from './email-verify.mjs';
import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { blank, seed, uid, execute, emitWorkflow, receiveProspects } from './model.mjs';
import { createSqliteStore, supabaseFromEnv } from './storage.mjs';
import { accountProfile, authFromEnv } from './auth.mjs';
import { generatePage, revisePage, suggestSeo } from './studio-ai.mjs';
import { validDesign } from './ui/studio-design.js';
import { designAgent, replyAsAgent } from './agent-ai.mjs';
import { createOpenAI, openAIModel } from './openai.mjs';
import { agentWorkflowRequest, recordAgentRun } from './agent-model.mjs';
import { agencyAiUsage, checkAiBudget, setAiAccess, setAiLimit, usageMeter } from './ai-model.mjs';
import { setLabsOffer } from './labs-model.mjs';
import { writeConversationReply, writeConversationSummary } from './conversation-ai.mjs';
import { transformText, writeBrandVoice, writeEmail, writeReviewReply } from './content-ai.mjs';
import { brandVoicePrompt, defaultBoard } from './ui/brand-data.js';
import { runWorkflowAI } from './workflow-ai.mjs';
import { mediaRowId } from './reputation-media.mjs';
import { loadSetupSites, removeSetupSites, saveSetupSites } from './setup-sites-store.mjs';
import { addPage, chatEntry, designedPage, deletePage, duplicatePage, findPage, movePage, resetStats, setSeo, setSlug, newSiteDoc, pageFromStructure, publish, renamePage, restoreVersion, savePage, siteRowId } from './studio-site.mjs';
import { AGENCY_ID, agencyOverview, applySnapshot, blankAgency, executeAgency, extractSnapshot, hash, hydrateAgency, previewSnapshot, userAccess, canReactivate, inTrash, trashList, trashExpired } from './agency-model.mjs';
import { createAccountPurge, PURGE_GIVE_UP_MS, PURGE_RETRY_MS } from './account-purge.mjs';
import { agencyAccess, publicBilling } from './agency-billing-model.mjs';
import { MARKETPLACE_DOC_ID, emptyMarketplace, findMarketplaceSetup, hydrateMarketplace, publicMarketplaceList, publishToMarketplace, recordMarketplaceInstall, templateGallery, unpublishFromMarketplace } from './setup-marketplace.mjs';
import { runProspectingAction } from './prospecting-model.mjs';
import { collectProspectAudit, fetchPage, marketingAuditVars } from './prospect-audit.mjs';
import { r2FromEnv } from './r2-storage.mjs';
import { mapsEmbedKey, placeSummaries, placesConfigured, placesSearch } from './prospecting-places.mjs';
import { isGooglePlace } from './ui/prospect-report.js';
import { osmLookup, osmSearch } from './prospecting-osm.mjs';
import { adsConfigured, changeMetaAudience, freshAdsSecret, sendMetaEvents, sendGa4Event, syncAds, uploadGoogleConversion } from './ads-providers.mjs';
import { expiredOrders } from './store-model.mjs';
import { hasPixels, injectPixels, widenCsp } from './tracking.mjs';
import { createTrackingLog } from './tracking-events.mjs';
import { scopedReads } from './read-scope.mjs';
import { createLedgerFlush, isAgencyRow, watchLedger } from './ledger-flush.mjs';
import { localScheduler, startupLines } from './local-scheduler.mjs';
import { AUDIT_IN_DOCUMENT, createAuditLog } from './agency-audit.mjs';
import { adSettingsOf, storeAdSync } from './ads-model.mjs';
import { cleanTouch, touchFromVisit } from './ui/ads-data.js';
import { freshSecret, googleConfigured, googleError, googleReports, listLocations, locationDetails } from './google-integrations.mjs';
import { gbpChecklist } from './ui/gbp-data.js';
import { AsyncLocalStorage } from 'node:async_hooks';

// Per request: the affiliate referral cookies a public visitor carries (one per workspace).
const requestScope = new AsyncLocalStorage();
// Per request: where the visitor came from, per workspace (first and last touch; see ui/ads-data.js).
const TOUCH_COOKIE_PREFIX = 'graao_at_';
const REFERRAL_COOKIE_PREFIX = 'graao_af_';
const touchCookie = workspace => `${TOUCH_COOKIE_PREFIX}${workspace.replace(/[^\w-]/g, '')}`;
function touchesOf(req) {
  const out = {};
  for (const part of String(req.headers.cookie || '').split(';')) {
    const [name, value = ''] = part.trim().split('=');
    if (!name?.startsWith(TOUCH_COOKIE_PREFIX)) continue;
    try { const v = JSON.parse(Buffer.from(decodeURIComponent(value), 'base64url').toString('utf8')); out[name.slice(TOUCH_COOKIE_PREFIX.length)] = { first: cleanTouch(v.f), last: cleanTouch(v.l) }; } catch { /* a broken cookie is ignored */ }
  }
  return out;
}
function referralsOf(req) {
  const refs = {};
  for (const part of String(req.headers.cookie || '').split(';')) {
    const [name, value = ''] = part.trim().split('=');
    if (!name?.startsWith(REFERRAL_COOKIE_PREFIX)) continue;
    const [affiliateId, campaignId, at] = decodeURIComponent(value).split('.');
    if (/^[0-9a-f-]{36}$/.test(affiliateId || '') && /^[0-9a-f-]{36}$/.test(campaignId || '') && /^\d{13}$/.test(at || '')) refs[name.slice(REFERRAL_COOKIE_PREFIX.length)] = { affiliateId, campaignId, at: Number(at) };
  }
  return refs;
}
// Visitor-facing requests (pages, forms, store, chat, webinar, offers). App screens never attribute.
const publicRequest = path => !path.startsWith('/api/') || /^\/api\/(store|chat|webinar|offer|avaliar|depoimento)\//.test(path);
import { folded, prospectSearchText } from './ui/prospecting-data.js';
import { snapshotAssets } from './ui/agency-data.js';
import { effectiveAccess, hasModule, requireAgencyCommand, requireCapability, requireModule, requireRecordEffects, requireSetupModules, workspaceView } from './authorization.mjs';
import { attachAccounts, claimDue, evergreenDue, feedPosts, parseFeed, settle } from './social-model.mjs';
import { authUrl, publish as socialPublish, seal, unseal } from './social-providers.mjs';
import { quickReplies, sendMetaCommentReply, sendMetaMessage, subscribeMetaPage } from './meta-messaging.mjs';
import { generateImage, startVideo, videoContent, videoStatus } from './openai-media.mjs';
import { inboundAddress } from './email-inbound.mjs';
import { createPhoneHandler } from './phone-server.mjs';
import { CHUNK_BYTES } from './reputation-media.mjs';
import { network } from './ui/social-data.js';
import { writeCaption } from './social-ai.mjs';
import { reportMailer } from './report-share.mjs';
import { documentMailer, documentMessage } from './document-mail.mjs';
import { campaignMailer } from './email-campaign-send.mjs';
import { agencySender, emailDomains, normalizeLocalPart, workspaceSender } from './email-domain.mjs';
import { abandonedOf } from './checkout-model.mjs';
import { reportsDue } from './report-model.mjs';
import { brandGroupData } from './ui/brand-group-data.js';
import { createAskHandler } from './graao-chat.mjs';
import { createWahaHandler } from './waha.mjs';
import { createMessageMedia } from './message-media.mjs';
import { createWhatsAppHandler } from './whatsapp.mjs';
import { createWhatsAppGuard } from './whatsapp-guard.mjs';
import { createAbacatePayHandler } from './abacatepay.mjs';
import { makeClientPortal } from './client-portal.mjs';
import { makeCommunity } from './community.mjs';
import { fillWelcome } from './community-config.mjs';
import { leaveCsp, leavePage } from './destinations.mjs';
import { summarizeMeeting, transcribeAudio } from './meeting-ai.mjs';
import { askAssistant } from './seo-ai.mjs';
import { closeUsage, pricingFor, usageToClose, setPricing, walletAdjust } from './wallet-model.mjs';
import { sendPush } from './web-push.mjs';
import { pushTargets } from './push-model.mjs';
import { pollConnector, runConnectorAction } from './connectors.mjs';
import { pollJobs } from './connector-model.mjs';
import { unseal as unsealSecret } from './social-providers.mjs';
import { postSeo, writePost } from './blog-ai.mjs';
import { deliverCustomWebhook, deliverWebhook, publicTarget } from './workflow-delivery.mjs';
import { extractAssets, saveAssets } from './asset-store.mjs';
import { inBackground } from './background.mjs';
import { createEventSender } from './event-sender.mjs';
import { eventSendDue } from './event-send-model.mjs';
import { runInBatches } from './cron-batch.mjs';
import { createGraaoAI } from './ai-gateway/gateway.mjs';
import { createAiGatewayRoutes } from './routes/ai-gateway.mjs';

const root = dirname(fileURLToPath(import.meta.url));
// A versão no rodapé é o commit publicado: na Vercel vem da variável do deploy; na máquina, do git; sem nenhum, "local".
let cachedBuild = '';
export function buildId(env = process.env, readGit = () => execFileSync('git', ['rev-parse', '--short=7', 'HEAD'], { cwd: root, stdio: ['ignore', 'pipe', 'ignore'], timeout: 3000 }).toString()) {
  if (env === process.env && cachedBuild) return cachedBuild;
  let id = String(env.VERCEL_GIT_COMMIT_SHA || '').trim().slice(0, 7);
  if (!id) { try { id = String(readGit()).trim().slice(0, 7); } catch { id = ''; } }
  id = /^[0-9a-f]{7}$/i.test(id) ? id.toLowerCase() : 'local';
  if (env === process.env) cachedBuild = id;
  return id;
}
export const staticFiles = new Map([
  ['/launchpad.js','text/javascript; charset=utf-8'], ['/launchpad-data.js','text/javascript; charset=utf-8'], ['/launchpad.css','text/css; charset=utf-8'],
  ['/app.js','text/javascript; charset=utf-8'], ['/icons.js','text/javascript; charset=utf-8'],
  ['/screens.js','text/javascript; charset=utf-8'], ['/conversations.js','text/javascript; charset=utf-8'], ['/conversation-analytics.js','text/javascript; charset=utf-8'], ['/conversation-sla.js','text/javascript; charset=utf-8'],
  ['/dashboard.js','text/javascript; charset=utf-8'], ['/dashboard-data.js','text/javascript; charset=utf-8'],
  ['/dashboard-controls.js','text/javascript; charset=utf-8'], ['/dashboard-metrics.js','text/javascript; charset=utf-8'], ['/dashboard.css','text/css; charset=utf-8'],
  ['/reports.js','text/javascript; charset=utf-8'], ['/report-data.js','text/javascript; charset=utf-8'], ['/reports.css','text/css; charset=utf-8'],
  ['/studio.js','text/javascript; charset=utf-8'], ['/sites.js','text/javascript; charset=utf-8'], ['/forms.js','text/javascript; charset=utf-8'], ['/form-fields.js','text/javascript; charset=utf-8'], ['/forms.css','text/css; charset=utf-8'], ['/blogs.js','text/javascript; charset=utf-8'], ['/stores.js','text/javascript; charset=utf-8'], ['/webinars.js','text/javascript; charset=utf-8'], ['/webinar-data.js','text/javascript; charset=utf-8'], ['/qr.js','text/javascript; charset=utf-8'], ['/verify.js','text/javascript; charset=utf-8'], ['/verify.css','text/css; charset=utf-8'], ['/qr-codes.js','text/javascript; charset=utf-8'], ['/sites-analytics.js','text/javascript; charset=utf-8'], ['/marketing-sites.css','text/css; charset=utf-8'], ['/stores.css','text/css; charset=utf-8'], ['/store-data.js','text/javascript; charset=utf-8'], ['/blogs.css','text/css; charset=utf-8'], ['/blog-data.js','text/javascript; charset=utf-8'], ['/chat-widgets.js','text/javascript; charset=utf-8'], ['/chat-widgets.css','text/css; charset=utf-8'], ['/chat-widget-data.js','text/javascript; charset=utf-8'], ['/studio-builder.js','text/javascript; charset=utf-8'], ['/studio-design.js','text/javascript; charset=utf-8'], ['/studio-builder.css','text/css; charset=utf-8'], ['/sites.css','text/css; charset=utf-8'], ['/studio-data.js','text/javascript; charset=utf-8'], ['/studio-blocks.js','text/javascript; charset=utf-8'], ['/site-template-data.js','text/javascript; charset=utf-8'], ['/studio.css','text/css; charset=utf-8'],
  ['/design-workspace.js','text/javascript; charset=utf-8'], ['/design-workspace.css','text/css; charset=utf-8'],
  ['/automation.js','text/javascript; charset=utf-8'], ['/automation.css','text/css; charset=utf-8'], ['/expressions.js','text/javascript; charset=utf-8'], ['/workflow-data.js','text/javascript; charset=utf-8'], ['/workflow-builder.js','text/javascript; charset=utf-8'],
  ['/client-portal.js','text/javascript; charset=utf-8'], ['/media.js','text/javascript; charset=utf-8'], ['/media.css','text/css; charset=utf-8'], ['/scheduling.js','text/javascript; charset=utf-8'], ['/meetings.js','text/javascript; charset=utf-8'], ['/seo.js','text/javascript; charset=utf-8'], ['/wallet.js','text/javascript; charset=utf-8'], ['/wallet.css','text/css; charset=utf-8'], ['/labs.js','text/javascript; charset=utf-8'], ['/conversation-ai.js','text/javascript; charset=utf-8'], ['/labs-data.js','text/javascript; charset=utf-8'], ['/labs.css','text/css; charset=utf-8'], ['/seo.css','text/css; charset=utf-8'], ['/scheduling.css','text/css; charset=utf-8'], ['/portal-page.js','text/javascript; charset=utf-8'], ['/portal-community.js','text/javascript; charset=utf-8'], ['/portal-community-feed.js','text/javascript; charset=utf-8'], ['/portal-community-academy.js','text/javascript; charset=utf-8'], ['/portal-community.css','text/css; charset=utf-8'], ['/portal-smooth-scroll.js','text/javascript; charset=utf-8'],['/portal-loyalty.js','text/javascript; charset=utf-8'], ['/portal-course-extra.js','text/javascript; charset=utf-8'], ['/phone-input.js','text/javascript; charset=utf-8'], ['/locales/es.js','text/javascript; charset=utf-8'], ['/client-portal.css','text/css; charset=utf-8'], ['/courses.js','text/javascript; charset=utf-8'], ['/courses.css','text/css; charset=utf-8'], ['/communities.js','text/javascript; charset=utf-8'], ['/community-events.js','text/javascript; charset=utf-8'], ['/community-data.js','text/javascript; charset=utf-8'], ['/community-admin.js','text/javascript; charset=utf-8'], ['/course-builder-extra.js','text/javascript; charset=utf-8'], ['/certificates.js','text/javascript; charset=utf-8'], ['/tickets.js','text/javascript; charset=utf-8'], ['/sequences.js','text/javascript; charset=utf-8'], ['/loyalty.js','text/javascript; charset=utf-8'], ['/preferences.js','text/javascript; charset=utf-8'], ['/contact-trash.js','text/javascript; charset=utf-8'], ['/ticket-data.js','text/javascript; charset=utf-8'], ['/agency-desktop.js','text/javascript; charset=utf-8'], ['/certificate-data.js','text/javascript; charset=utf-8'],['/offers.js','text/javascript; charset=utf-8'], ['/documents.js','text/javascript; charset=utf-8'], ['/document-render.js','text/javascript; charset=utf-8'], ['/document-sign.js','text/javascript; charset=utf-8'], ['/document-sign.css','text/css; charset=utf-8'], ['/estimate-render.js','text/javascript; charset=utf-8'], ['/estimate-view.js','text/javascript; charset=utf-8'], ['/estimates.js','text/javascript; charset=utf-8'], ['/estimates.css','text/css; charset=utf-8'], ['/invoices.js','text/javascript; charset=utf-8'], ['/invoices.css','text/css; charset=utf-8'], ['/invoice-data.js','text/javascript; charset=utf-8'], ['/fiscal.js','text/javascript; charset=utf-8'], ['/tax-id.js','text/javascript; charset=utf-8'], ['/ledger.js','text/javascript; charset=utf-8'], ['/invoice-render.js','text/javascript; charset=utf-8'], ['/invoice-view.js','text/javascript; charset=utf-8'], ['/payment-settings.js','text/javascript; charset=utf-8'], ['/email-services.js','text/javascript; charset=utf-8'], ['/phone-settings.js','text/javascript; charset=utf-8'], ['/call-report.js','text/javascript; charset=utf-8'], ['/dialer.js','text/javascript; charset=utf-8'], ['/mobile-shell.js','text/javascript; charset=utf-8'], ['/agency-mobile.js','text/javascript; charset=utf-8'], ['/connectors.js','text/javascript; charset=utf-8'], ['/connectors-data.js','text/javascript; charset=utf-8'], ['/email-blocks.js','text/javascript; charset=utf-8'], ['/email-marketing.js','text/javascript; charset=utf-8'], ['/countdown-data.js','text/javascript; charset=utf-8'], ['/countdowns.js','text/javascript; charset=utf-8'], ['/checkout-data.js','text/javascript; charset=utf-8'], ['/catalog.js','text/javascript; charset=utf-8'], ['/orders.js','text/javascript; charset=utf-8'], ['/line-items.js','text/javascript; charset=utf-8'], ['/document-data.js','text/javascript; charset=utf-8'], ['/documents.css','text/css; charset=utf-8'], ['/communities.css','text/css; charset=utf-8'],
  ['/agents.js','text/javascript; charset=utf-8'], ['/agents-data.js','text/javascript; charset=utf-8'], ['/ai-data.js','text/javascript; charset=utf-8'], ['/content-ai.js','text/javascript; charset=utf-8'], ['/content-ai-data.js','text/javascript; charset=utf-8'], ['/content-ai.css','text/css; charset=utf-8'], ['/reputation.js','text/javascript; charset=utf-8'], ['/gbp-data.js','text/javascript; charset=utf-8'], ['/affiliates.js','text/javascript; charset=utf-8'], ['/ads.js','text/javascript; charset=utf-8'], ['/ads-data.js','text/javascript; charset=utf-8'], ['/ads.css','text/css; charset=utf-8'], ['/affiliates.css','text/css; charset=utf-8'], ['/brand-data.js','text/javascript; charset=utf-8'], ['/brand.js','text/javascript; charset=utf-8'], ['/brand.css','text/css; charset=utf-8'], ['/tracking.js','text/javascript; charset=utf-8'], ['/tracking.css','text/css; charset=utf-8'], ['/scoring-data.js','text/javascript; charset=utf-8'],['/destination-field.js','text/javascript; charset=utf-8'],['/reputation.css','text/css; charset=utf-8'], ['/agent-hub.js','text/javascript; charset=utf-8'], ['/agents.css','text/css; charset=utf-8'],
  ['/agency.js','text/javascript; charset=utf-8'], ['/agency-data.js','text/javascript; charset=utf-8'], ['/platform.js','text/javascript; charset=utf-8'], ['/ai-gateway.js','text/javascript; charset=utf-8'], ['/ghl-import-view.js','text/javascript; charset=utf-8'], ['/platform-format.js','text/javascript; charset=utf-8'], ['/setup-art.js','text/javascript; charset=utf-8'], ['/agency.css','text/css; charset=utf-8'],
  ['/deck-model.js','text/javascript; charset=utf-8'], ['/deck-render.js','text/javascript; charset=utf-8'], ['/deck-editor.js','text/javascript; charset=utf-8'], ['/deck.css','text/css; charset=utf-8'],
  ['/presentations.js','text/javascript; charset=utf-8'], ['/presentation-data.js','text/javascript; charset=utf-8'], ['/presentations.css','text/css; charset=utf-8'],
  ['/graao-chat.js','text/javascript; charset=utf-8'], ['/graao-chat.css','text/css; charset=utf-8'],
  ['/beautiful-ui.js','text/javascript; charset=utf-8'], ['/beautiful-ui.css','text/css; charset=utf-8'],
  ['/beautiful-ui-more.js','text/javascript; charset=utf-8'], ['/beautiful-ui.html','text/html; charset=utf-8'], ['/bui-mounts.js','text/javascript; charset=utf-8'],
  ['/highlight.js','text/javascript; charset=utf-8'], ['/toast.js','text/javascript; charset=utf-8'], ['/toast.css','text/css; charset=utf-8'], ['/rodape.js','text/javascript; charset=utf-8'], ['/rodape.css','text/css; charset=utf-8'], ['/ask.js','text/javascript; charset=utf-8'], ['/ask.css','text/css; charset=utf-8'], ['/accounts.js','text/javascript; charset=utf-8'], ['/accounts.css','text/css; charset=utf-8'], ['/account-guard.js','text/javascript; charset=utf-8'], ['/scope.css','text/css; charset=utf-8'],
  ['/vendor/marked.js','text/javascript; charset=utf-8'], ['/vendor/purify.js','text/javascript; charset=utf-8'],
  ['/color-picker.js','text/javascript; charset=utf-8'],
  ['/prospecting.js','text/javascript; charset=utf-8'], ['/prospecting-data.js','text/javascript; charset=utf-8'],
  ['/prospect-report.js','text/javascript; charset=utf-8'], ['/prospecting.css','text/css; charset=utf-8'],
  ['/crm.js','text/javascript; charset=utf-8'], ['/crm-data.js','text/javascript; charset=utf-8'],
  ['/opportunity-data.js','text/javascript; charset=utf-8'], ['/opportunity-filters.js','text/javascript; charset=utf-8'], ['/opportunities.js','text/javascript; charset=utf-8'], ['/opportunities.css','text/css; charset=utf-8'],
  ['/social.js','text/javascript; charset=utf-8'], ['/social-data.js','text/javascript; charset=utf-8'], ['/social.css','text/css; charset=utf-8'], ['/event-planner.js','text/javascript; charset=utf-8'], ['/event-planner-data.js','text/javascript; charset=utf-8'], ['/event-copy-editor.js','text/javascript; charset=utf-8'], ['/event-message-parts.js','text/javascript; charset=utf-8'], ['/event-sends.js','text/javascript; charset=utf-8'], ['/event-timeline.js','text/javascript; charset=utf-8'], ['/event-planner.css','text/css; charset=utf-8'],
  ['/social-connect.js','text/javascript; charset=utf-8'], ['/mcp.js','text/javascript; charset=utf-8'], ['/mcp-autorizar.js','text/javascript; charset=utf-8'], ['/mcp.css','text/css; charset=utf-8'], ['/social-approve.js','text/javascript; charset=utf-8'], ['/brand-group-data.js','text/javascript; charset=utf-8'], ['/brand-groups.css','text/css; charset=utf-8'],
  ['/prancheta.js','text/javascript; charset=utf-8'], ['/prancheta.css','text/css; charset=utf-8'],
  ['/prancheta-editor.html','text/html; charset=utf-8'], ['/vendor/prancheta-editor.js','text/javascript; charset=utf-8'], ['/vendor/prancheta-editor.css','text/css; charset=utf-8'],
  ['/mobile-app-view.js','text/javascript; charset=utf-8'], ['/mobile-home-data.js','text/javascript; charset=utf-8'], ['/mobile-app.css','text/css; charset=utf-8'], ['/mobile-creator.css','text/css; charset=utf-8'],
  ['/style.css','text/css; charset=utf-8'], ['/button-system.css','text/css; charset=utf-8'], ['/page-layout.css','text/css; charset=utf-8'], ['/tokens.css','text/css; charset=utf-8'], ['/liquid-glass.css','text/css; charset=utf-8'], ['/index.html','text/html; charset=utf-8'], ['/login.html','text/html; charset=utf-8'], ['/home.css','text/css; charset=utf-8'], ['/home.js','text/javascript; charset=utf-8'],
  ['/graao.css','text/css; charset=utf-8'], ['/lucide-animated.css','text/css; charset=utf-8'], ['/inbox.css','text/css; charset=utf-8'], ['/inbox.js','text/javascript; charset=utf-8'], ['/inbox-data.js','text/javascript; charset=utf-8'], ['/message-media.js','text/javascript; charset=utf-8'], ['/inbox-live.js','text/javascript; charset=utf-8'], ['/graao-dark.css','text/css; charset=utf-8'], ['/graao.js','text/javascript; charset=utf-8'], ['/sidebar.js','text/javascript; charset=utf-8'],
  ['/topbar.js','text/javascript; charset=utf-8'], ['/i18n.js','text/javascript; charset=utf-8'],
  ['/fonts/plus-jakarta-sans.woff2','font/woff2'], ['/favicon.svg','image/svg+xml'],
  ['/privacidade.html','text/html; charset=utf-8'], ['/skull_flame_animated.svg','image/svg+xml'], ['/graao-gato.svg','image/svg+xml'], ['/gato.js','text/javascript; charset=utf-8'],
  ['/login.css','text/css; charset=utf-8'], ['/login.js','text/javascript; charset=utf-8'],
]);
// Estáticos que só abrem com sessão (como o app): sem login, 303 para /login. O smoke pós-deploy usa a mesma lista.
export const sessionOnlyFiles = new Set(['/prancheta-editor.html']);
// Ilustrações dos templates de setup (ui/setup-art/*.svg), uma por segmento.
for (const file of readdirSync(resolve(root, 'ui', 'setup-art'))) if (/^[a-z0-9-]+\.svg$/.test(file)) staticFiles.set(`/setup-art/${file}`, 'image/svg+xml');
const host = '127.0.0.1';
const defaultPort = Number(process.env.GO_PORT || 4317);
// Editor da Prancheta: abre num iframe da própria graao e baixa o MediaPipe (remoção de fundo) por CDN.
const pranchetaEditorCsp = () => csp
  .replace("frame-ancestors 'none'", "frame-ancestors 'self'")
  .replace("script-src 'self'", "script-src 'self' 'wasm-unsafe-eval'")
  .replace("connect-src 'self'", "connect-src 'self' https://cdn.jsdelivr.net https://unpkg.com https://storage.googleapis.com https://fonts.googleapis.com https://fonts.gstatic.com");
const csp = "default-src 'self'; script-src 'self' 'unsafe-inline' https://accounts.google.com https://cdnjs.cloudflare.com https://unpkg.com https://cdn.jsdelivr.net; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdn.jsdelivr.net https://accounts.google.com; font-src 'self' https://fonts.gstatic.com data:; img-src 'self' data: https:; media-src 'self' data: https:; connect-src 'self' https://accounts.google.com https://*.r2.cloudflarestorage.com; frame-src 'self' https: https://accounts.google.com; base-uri 'none'; object-src 'none'; frame-ancestors 'none'; form-action 'self'";
const error = (message,status) => Object.assign(new Error(message),{status});
const spaceId = /^[0-9a-f-]{36}$|^demo$/;
const privateSpace = /^user-[0-9a-f-]{36}$/;
// Why a WhatsApp message was not delivered, as the "Falha no envio de mensagem" trigger names it.
// documentMail.email answers with a sentence: "e-mail enviado…" when Resend accepted it, anything else is a failure.
const mailSent = outcome => typeof outcome === 'string' ? /^e-mail enviado/.test(outcome) : Boolean(outcome);
const deliveryFailure = reason => ({ 'not-connected': 'not_connected', 'invalid-phone': 'invalid_phone', 'account-suspended': 'suspended', 'server-down': 'server_down', unconfirmed: 'unconfirmed', 'wrong-recipient': 'wrong_recipient' })[reason] || 'provider_error';
const personalId = session => `user-${session.id}`;
const workspaceSegment = '(demo|(?:user-)?[0-9a-f-]{36})';
const portalPage = new RegExp(`^/portal/${workspaceSegment}/?$`);
const portalApi = new RegExp(`^/api/client-portal/${workspaceSegment}/(admin|home|exchange|logout|course|progress|community-admin|community|offer-grant|loyalty|admin-enter|files|push)(?:/([0-9a-f-]{36}))?$`);
const storePath = new RegExp(`^/loja/${workspaceSegment}/([0-9a-f-]{36})(?:/(carrinho)|/p/([a-z0-9-]{1,80}))?/?$`);
const storeApi = new RegExp(`^/api/store/${workspaceSegment}/([0-9a-f-]{36})/(quote|checkout|cart|restore|review|view)$`);
const socialFilePath = new RegExp(`^/m/${workspaceSegment}/([0-9a-f-]{36})$`);
const socialInvitePath = new RegExp(`^/social-connect/${workspaceSegment}/?$`);
const socialApprovePath = new RegExp(`^/aprovar/${workspaceSegment}/?$`);
// Pages a visitor lands on (sites, forms, offers, store, blog, webinars, QR codes and links): they remember the visit's source.
// The tracking script (/t/<workspace>.js), the pixels loader (/t/<workspace>/pixels.js) and events (/t/<workspace>/e).
const trackingPath = new RegExp(`^/t/${workspaceSegment}(\\.js|/pixels\\.js|/e)$`);
const landingPath = new RegExp(`^/(s|form|oferta|loja|b|w|q|r)/${workspaceSegment}(?:/|$)`);
// O código de confirmação (hash) nunca sai do servidor; o celular só com os 4 últimos dígitos.
function safeBilling({ verify: _verify, phone, ...billing } = {}) {
  return { ...billing, phone: phone ? publicBilling({ phone }, new Date()).phone : '' };
}
function publicAgency(agency, who) {
  // The audit log has its own endpoint (GET /api/agency/audit).
  const { audit: _audit, ledgerOutbox: _outbox, mcpGrants: _grants, ...shared } = agency;
  const view = { ...shared,
    snapshots: agency.snapshots.map(({ studioSites: _studioSites, ...rest }) => rest),
    ghlImports: (agency.ghlImports || []).map(jobView),
    apiKeys: agency.apiKeys.map(({ hash: _hash, ...rest }) => rest),
    privateIntegrations: agency.privateIntegrations.map(({ hash: _hash, ...rest }) => rest),
    billing: safeBilling(agency.billing)
  };
  if (!who.settings) {
    const empty = blankAgency();
    for (const key of ['profile', 'users', 'billing', 'fiscal', 'apiKeys', 'privateIntegrations', 'emailServices', 'systemEmails', 'compliance']) {
      if (Object.hasOwn(empty, key)) view[key] = empty[key];
    }
    view.accounts = Object.fromEntries(Object.entries(agency.accounts).map(([id, { statusHistory, ignoredWebhooks, suspendedReason, suspendedBy, billing, ...meta }]) => [id, meta]));
  }
  if (who.modules !== null || !who.settings) view.snapshots = view.snapshots.map(({ assets, shareCode, ...snap }) => snap);
  // Setups imported with asset protection show only how many records each type has, never the records.
  view.snapshots = view.snapshots.map(({ assets, ...snap }) => snap.protected || !assets ? snap : { ...snap, assets });
  return view;
}
const stamp = () => new Date().toISOString();
// What a snapshot load or preview asked for: the records picked per asset type and the conflict rule per type.
function loadChoices(input) {
  const known = new Set(snapshotAssets.map(([key]) => key));
  let items = null;
  if (input.items && typeof input.items === 'object' && !Array.isArray(input.items)) {
    items = {};
    for (const [key, value] of Object.entries(input.items)) {
      if (!known.has(key)) continue;
      if (value === '*') items[key] = '*';
      else if (Array.isArray(value)) items[key] = value.filter(id => typeof id === 'string').slice(0, 2000);
    }
  }
  const modes = {};
  if (input.modes && typeof input.modes === 'object') for (const [key, value] of Object.entries(input.modes)) {
    if (known.has(key) && (value === 'skip' || value === 'overwrite')) modes[key] = value;
  }
  return { items, modes };
}

// Tipo de uso de IA da subconta (ai-model.mjs) → funcionalidade do graao AI Gateway (política, classe de dado, log).
const AI_FEATURE_OF_KIND = { blog: 'blog.writer', brand: 'content.writer', reputation: 'content.writer', conversations: 'conversation.reply', meetings: 'meeting.summary',
  visibility: 'seo.writer', social: 'social.writer', workflow: 'workflow.ai', agents: 'agent.reply', email: 'content.writer', sms: 'content.writer' };
const aiFeatureOf = kind => AI_FEATURE_OF_KIND[kind] || 'content.writer';

const defaultDbPath = process.env.GO_DB_PATH ? resolve(process.env.GO_DB_PATH) : (process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME)
  ? resolve(tmpdir(), 'go.sqlite')
  : resolve(root, '.data', 'go.sqlite');

export function makeServer({
  pushEnv=process.env, pushRequest=fetch, connectorRequest=fetch, dbPath=defaultDbPath, port=defaultPort, store=createSqliteStore(dbPath), socialScheduler=localScheduler(store.kind), cronConcurrency=4, cronBudgetMs=45_000,
  auth=authFromEnv(), agencyOwnerId=process.env.GO_AGENCY_OWNER_ID, agentModel=openAIModel, generateAgentReply=replyAsAgent, contentAI=null, workflowAI=null, mediaAI=null, brandFetch=fetch, ghlFetch=fetch, ghlResolve=null, metaFetch=fetch, inboundFetch=fetch, twilioRequest=fetch, phoneEnv=process.env, brandResolve=null, designAgentConfig=designAgent,
  emailResolver=undefined, openAISecret=process.env.GO_STORAGE_KEY, openAIRequest=fetch, aiGatewayEnv=process.env, aiGatewayRequest=null, fetchMedia=fetchPage, wahaRequest=fetch, whatsappRequest=fetch, abacatePayRequest=fetch,
  evolutionBaseUrl=process.env.EVOLUTION_BASE_URL || '', evolutionApiKey=process.env.EVOLUTION_API_KEY || '',
  phoneVerify={ number: process.env.GRAAO_VERIFY_WHATSAPP || '', instance: process.env.GRAAO_VERIFY_INSTANCE || '', secret: process.env.GRAAO_VERIFY_SECRET || '' },
  portalOptions={}, prospectAudit=collectProspectAudit, reportMail=reportMailer(), documentMail=documentMailer(), emailDomainApi=emailDomains(), campaignMail=campaignMailer(),
  signupOpen=undefined, allowLocalAccess=process.env.GO_DEV_NO_AUTH === '1', r2=r2FromEnv(), platformEnv=process.env, platformRequest=fetch, hosting=hostingDomains()
}={}) {
  const cronReads = scopedReads(store);
  store = cronReads.store;
  // Any write that leaves billing facts in a document's outbox sends them to the ledger right after.
  const ledgerFlush = createLedgerFlush({ store });
  store = watchLedger(store, id => inBackground(`Livro (${id})`, () => ledgerFlush.any(id)));
  const localAccess = !auth && !process.env.VERCEL && allowLocalAccess;
  const content = { transformText, writeEmail, writeReviewReply, writeBrandVoice, writeCaption, writePost, postSeo, transcribeAudio, summarizeMeeting, askAssistant, writeConversationReply, writeConversationSummary, ...contentAI };
  // The default brand board's voice, added by the server to every AI writer (never taken from the browser).
  const brandVoiceOf = async workspace => brandVoicePrompt(defaultBoard((await store.load(workspace)).brandBoards));
  // One AI request for a sub-account: checks the monthly limit, meters every OpenAI call and books it.
  // Tests inject `contentAI` and run locally with only the meter, never a key.
  async function meteredAI(who, id, kind, run) {
    checkAiBudget(await store.load(id));
    const meter = usageMeter();
    // Escopo do graao AI Gateway: a subconta é a organização do pedido; transcrição e busca na web só com a chave da agência.
    const scope = { org: id, feature: aiFeatureOf(kind), allowPlatform: !['meetings', 'visibility'].includes(kind) };
    const connection = localAccess && contentAI ? { onUsage: meter.onUsage, model: agentModel }
      : { ...await openAI.requireConnection(who.session, scope), onUsage: meter.onUsage };
    try {
      const result = await run(connection);
      await store.change(id, state => { meter.charge(state, kind, ''); });
      return result;
    } catch (problem) {
      await store.change(id, state => { meter.charge(state, kind, '', problem.message); });
      throw problem;
    }
  }
  // graao AI Gateway: camada única entre as funcionalidades e os provedores de IA (ai-gateway/, docs/ai-gateway/).
  const graaoAI = createGraaoAI({ store, env: aiGatewayEnv, request: aiGatewayRequest || openAIRequest, allowLocalUrls: localAccess, log: console });
  const openAI = createOpenAI({ store, model: agentModel, secret: openAISecret, request: openAIRequest, gateway: graaoAI });
  async function voiceAgentReply(workspace, { agentId, input, workflowId = '', voiceKey = null }) {
    const state = await store.load(workspace);
    const connection = localAccess && generateAgentReply !== replyAsAgent ? { model: agentModel }
      : workflowId ? await workflowConnection(workspace, state, workflowId)
      : await keyConnection(workspace, state, voiceKey, 'Voice AI: salve o número de novo, com a OpenAI conectada', 'quem ligou o Voice AI não tem mais acesso a esta subconta; salve o número de novo', 'conecte a OpenAI de quem ligou o Voice AI (Visão da agência → Configurações → OpenAI)');
    checkAiBudget(state);
    const meter = usageMeter();
    const request = agentWorkflowRequest(state, agentId, input);
    const reply = String(await generateAgentReply({ ...request, model: request.model || agentModel }, { ...connection, onUsage: meter.onUsage }) || '');
    await store.change(workspace, current => {
      meter.charge(current, 'workflow', '');
      recordAgentRun(current, { agent: agentId, version: 'published', input, output: reply, kind: 'voice', model: request.model || agentModel, sources: [...new Set(request.retrieved.map(row => row.title))] });
    });
    return reply;
  }
  // Telefonia (2.4): Twilio numbers, calls and IVR (phone-server.mjs).
  const phone = createPhoneHandler({ store, change: (workspace, command) => change(workspace, command), flushLater: workspace => flushLater(workspace), request: twilioRequest, env: phoneEnv,
    accountActive: workspace => publicAccountPolicy(workspace, false, 'conversations'), agentReply: (workspace, options) => voiceAgentReply(workspace, options) });
  const phoneOrigin = () => String(phoneEnv.PHONE_PUBLIC_ORIGIN || phoneEnv.SOCIAL_PUBLIC_URL || phoneEnv.PORTAL_PUBLIC_ORIGIN || '').replace(/\/+$/, '');
  const handleAsk = createAskHandler({ store, openAI, openAIRequest });
  const waha = createWahaHandler({ store, secret: openAISecret, request: wahaRequest });
  const abacate = createAbacatePayHandler({ store, secret: openAISecret, request: abacatePayRequest });
  const whatsapp = createWhatsAppHandler({
    store, secret: openAISecret, request: whatsappRequest,
    evolutionBaseUrl, evolutionApiKey,
    onMedia: (agencyId, workspace, messages) => {
      if (messageMedia.enabled) inBackground(`Message media (${workspace})`, () => messageMedia.store(agencyId || AGENCY_ID, workspace, messages));
    }
  });
  const messageMedia = createMessageMedia({ r2, load: workspace => store.load(workspace), fetchMedia: (...args) => whatsapp.fetchWorkspaceMedia(...args), redirect: (...args) => redirectToR2(...args) });
  // A quiz, an assignment or a grade: the student's contact gets the course triggers in the workflows.
  const onCourseActivity = async (workspace, data) => { await change(workspace, { type: 'course-activity', data }); flushLater(workspace); };
  // A member signed in to the portal: "Login no portal do cliente" (first sign-in = signup).
  const onPortalLogin = async (workspace, data) => { await change(workspace, { type: 'portal-login', data }); flushLater(workspace); };
  const clientPortal = makeClientPortal({ ...portalOptions, store, onCourseActivity, onLogin: onPortalLogin, loadState: workspace => store.load(workspace),
    extraCourses: (workspace, state, memberId) => community.includedCourses(workspace, state, memberId) });
  // A member confirmed or paid an event: find or create the contact and fire "Inscrição em evento da comunidade".
  const onEventJoin = async (workspace, { eventId, memberId, paid }) => {
    const member = (await clientPortal.directory(workspace)).members?.find(row => row.id === memberId);
    if (!member) return;
    await change(workspace, { type: 'community-event-joined', id: eventId, data: { email: member.email, name: member.name, contactId: member.contactId || '', paid } });
    flushLater(workspace);
  };
  // Someone became an active member: the welcome e-mail (when set) and "Membro entrou na comunidade".
  const onMemberJoin = async (workspace, { groupId, memberId }) => {
    const [state, directory] = await Promise.all([store.load(workspace), clientPortal.directory(workspace)]);
    const group = state.communities.find(row => row.id === groupId), member = directory.members?.find(row => row.id === memberId);
    if (!group || !member?.email) return;
    const body = fillWelcome(group.welcomeDm, { name: member.name || member.email.split('@')[0], group: group.name });
    await change(workspace, { type: 'community-welcome', id: group.id, data: { items: [{ email: member.email, name: member.name, contactId: member.contactId || '', group: group.name, subject: `Boas-vindas à ${group.name}`, body }] } });
    flushLater(workspace);
  };
  // Posts, comments, join requests and lost access in a group: the community triggers on the member's contact.
  const onCommunityActivity = async (workspace, { groupId, memberId, ...data }) => {
    const member = (await clientPortal.directory(workspace)).members?.find(row => row.id === memberId);
    if (!member?.email) return;
    await change(workspace, { type: 'community-activity', id: groupId, data: { ...data, email: member.email, name: member.name, contactId: member.contactId || '' } });
    flushLater(workspace);
  };
  const community = makeCommunity({ store, onEventJoin, onMemberJoin, onActivity: onCommunityActivity });
  // A paid ticket invoice: the member gets the seat (once per invoice).
  async function grantEventTicket(workspace, invoice) {
    await community.grantTicket(workspace, invoice.eventTicket, invoice.id);
    await store.change(workspace, current => {
      const row = current.invoices.find(item => item.id === invoice.id);
      if (row) row.ticketGrantedAt = new Date().toISOString();
    });
  }
  // Courses the contact gained or lost: "Acesso a curso liberado / removido" in the workflows.
  async function courseAccessChanged(workspace, contact, courseIds, event) {
    for (const courseId of courseIds || []) await onCourseActivity(workspace, { event, courseId, email: contact.email, name: contact.name || '', contactId: contact.id || contact.contactId || '' });
  }
  // An offer's courses and communities given or taken: "Acesso à oferta liberado / removido" in the workflows.
  async function offerAccessChanged(workspace, contact, offerId, event) {
    await change(workspace, { type: 'offer-access', data: { event, offerId, email: contact.email || '', name: contact.name || '', contactId: contact.id || contact.contactId || '' } });
    flushLater(workspace);
  }
  // Workflows: "Copiar contato" into another sub-account of the same agency (checked again at run time).
  async function workflowCopyContact(workspace, state, item) {
    const target = String(item.workspace || '');
    if (privateSpace.test(workspace)) return 'não disponível na conta pessoal';
    if (target === workspace) return 'a subconta de destino é esta mesma';
    const agencyId = state.agencyId || AGENCY_ID;
    const account = (await listWorkspaces(agencyId)).find(row => row.id === target);
    if (!account) return 'subconta de destino não encontrada nesta agência';
    if (!await accountIsActive(agencyId, target, 'contacts').catch(() => false)) return `${account.name}: subconta sem contatos ativos`;
    const copied = await change(target, { type: 'contact-copy-in', data: { ...(item.contact || {}), tags: [...(item.contact?.tags || []), ...(item.tags || [])], from: state.profile?.name || workspace } });
    if (copied.state.workflowOutbox?.length) flushLater(target);
    return `${account.name}: ${copied.id?.created ? 'contato criado' : 'contato já existia (campos vazios e tags completados)'}`;
  }
  // Workflows: the access actions (courses in the portal, communities, offers, ranking points), applied after the run was saved.
  async function workflowAccess(workspace, item) {
    const state = await store.load(workspace);
    const who = { email: item.email, name: item.name, contactId: item.contactId };
    if (item.action === 'grant_offer' || item.action === 'revoke_offer') {
      const offer = state.offers.find(row => row.id === item.offerId);
      if (!offer) return 'oferta não encontrada';
      if (item.action === 'grant_offer') {
        const { memberId, emailed, added } = await clientPortal.enroll(workspace, state, who, offer.courseIds);
        if (!memberId) return 'acesso ao portal revogado para este contato';
        const joined = await community.enroll(workspace, memberId, offer.communityIds);
        await courseAccessChanged(workspace, who, added, 'granted');
        // Only a grant that opened something fires the trigger, so a workflow that grants on the trigger cannot loop.
        if (!added.length && !joined.length) return `${offer.title}: já tinha acesso`;
        await offerAccessChanged(workspace, who, offer.id, 'granted');
        return `${offer.title}: acesso liberado${emailed ? ' (link enviado)' : ''}`;
      }
      const removed = await clientPortal.revokeCourses(workspace, who, offer.courseIds);
      const left = await community.unenroll(workspace, await clientPortal.memberOf(workspace, who), offer.communityIds);
      await courseAccessChanged(workspace, who, removed, 'revoked');
      if (!removed.length && !left.length) return `${offer.title}: contato não tinha acesso`;
      await offerAccessChanged(workspace, who, offer.id, 'revoked');
      return `${offer.title}: acesso removido`;
    }
    if (item.action === 'register_event') {
      const event = (state.communityEvents || []).find(row => row.id === item.eventId);
      if (!event) return 'evento não encontrado';
      const outcome = await community.registerEvent(workspace, state, await clientPortal.memberOf(workspace, who), event.id, { comp: item.comp === true });
      return `${event.title}: ${({ registered: item.comp ? 'inscrito como cortesia' : 'presença confirmada', already: 'já estava confirmado', full: 'vagas esgotadas', ended: 'evento já terminou', paid: 'evento pago (use o ingresso)', missing: 'evento não publicado', 'not-member': 'contato não é membro ativo da comunidade' })[outcome]}`;
    }
    if (item.action === 'grant_channel_access' || item.action === 'revoke_channel_access') {
      const group = state.communities.find(row => row.id === item.communityId), channel = group?.channels.find(row => row.id === item.channelId);
      if (!channel) return 'canal não encontrado';
      const grant = item.action === 'grant_channel_access';
      const outcome = await community.channelAccess(workspace, state, await clientPortal.memberOf(workspace, who), group.id, channel.id, grant);
      if (!outcome) return `${group.name}: contato não é membro ativo (ou o canal não é privado)`;
      return outcome === 'same' ? `#${channel.name}: ${grant ? 'já tinha acesso' : 'contato não tinha acesso'}` : `#${channel.name}: acesso ${grant ? 'liberado' : 'removido'}`;
    }
    if (item.action === 'community_points') {
      const group = state.communities.find(row => row.id === item.communityId);
      if (!group) return 'comunidade não encontrada';
      const given = await community.grantPoints(workspace, state, await clientPortal.memberOf(workspace, who), group.id, item.points, item.note);
      if (!given) return `${group.name}: contato não é membro ativo`;
      return `${group.name}: ${item.points > 0 ? '+' : ''}${item.points} ponto(s), total ${given.total} (nível ${given.level}${given.name ? ` · ${given.name}` : ''})`;
    }
    const course = item.courseId && state.courses.find(row => row.id === item.courseId);
    const group = item.communityId && state.communities.find(row => row.id === item.communityId);
    if (item.action === 'grant_course_access') {
      if (!course) return 'curso não encontrado';
      const { memberId, emailed, added } = await clientPortal.enroll(workspace, state, who, [course.id]);
      if (!memberId) return 'acesso ao portal revogado para este contato';
      await courseAccessChanged(workspace, who, added, 'granted');
      return added.length ? `${course.name}: acesso liberado${emailed ? ' (link enviado)' : ''}` : `${course.name}: já tinha acesso`;
    }
    if (item.action === 'revoke_course_access') {
      if (!course) return 'curso não encontrado';
      const removed = await clientPortal.revokeCourses(workspace, who, [course.id]);
      await courseAccessChanged(workspace, who, removed, 'revoked');
      return removed.length ? `${course.name}: acesso removido` : `${course.name}: contato não tinha acesso`;
    }
    if (!group) return 'comunidade não encontrada';
    if (item.action === 'grant_community_access') {
      const { memberId } = await clientPortal.enroll(workspace, state, who, []);
      if (!memberId) return 'acesso ao portal revogado para este contato';
      const joined = await community.enroll(workspace, memberId, [group.id]);
      return joined.length ? `${group.name}: membro adicionado` : `${group.name}: já era membro (ou está banido)`;
    }
    const memberId = await clientPortal.memberOf(workspace, who);
    const removed = await community.unenroll(workspace, memberId, [group.id]);
    return removed.length ? `${group.name}: membro removido` : `${group.name}: contato não era membro`;
  }
  // Gives an offer's courses and communities to the contact who bought it (once per invoice).
  async function grantOffer(workspace, offerId, contactId, invoiceId = '') {
    const state = await store.load(workspace);
    const offer = state.offers.find(row => row.id === offerId);
    const contact = state.contacts.find(row => row.id === contactId);
    if (!offer || !contact?.email) throw error('Oferta ou contato não encontrado.',404);
    if (invoiceId && state.invoices.find(row => row.id === invoiceId)?.offerGrantedAt) return { enrolled: true, alreadyGranted: true, emailed: false };
    const { memberId, emailed, added } = await clientPortal.enroll(workspace, state, { email: contact.email, name: contact.name, contactId }, offer.courseIds);
    if (!memberId) throw error('O acesso deste cliente ao portal foi revogado. Reative-o na aba Clientes.',409);
    await community.enroll(workspace, memberId, offer.communityIds);
    await courseAccessChanged(workspace, contact, added, 'granted');
    await offerAccessChanged(workspace, contact, offer.id, 'granted');
    if (invoiceId) await store.change(workspace, current => {
      const invoice = current.invoices.find(row => row.id === invoiceId);
      if (invoice) invoice.offerGrantedAt = new Date().toISOString();
    });
    return { enrolled: true, emailed };
  }
  const ready = Promise.all([store.insert('demo', seed()), store.insert(AGENCY_ID, blankAgency())]);
  ready.catch(() => {});
  const workspaceOwner = id => id === AGENCY_ID ? null : id;
  // Subcontas da agência. As que estão na lixeira ficam de fora de tudo (listas, ações, rotas); só a lixeira as vê.
  const ownedWorkspaces = async agencyId => (await store.list(workspaceOwner(agencyId))).filter(w => spaceId.test(w.id));
  const listWorkspaces = async agencyId => {
    const [rows, agency] = await Promise.all([ownedWorkspaces(agencyId), loadAgency(agencyId).catch(e => { if (e.status === 404) return null; throw e; })]);
    return agency ? rows.filter(w => !inTrash(agency, w.id)) : rows;
  };
  const agencyCache = new Map();
  const AGENCY_CACHE_TTL = 30000;
  const loadAgency = async id => {
    const cached = agencyCache.get(id);
    const now = Date.now();
    if (cached && cached.expiresAt > now) return structuredClone(cached.data);
    const fresh = hydrateAgency(await store.load(id), id);
    agencyCache.set(id, { data: structuredClone(fresh), expiresAt: now + AGENCY_CACHE_TTL });
    return fresh;
  };
  const loadFresh = id => { agencyCache.delete(id); return loadAgency(id); };
  // Imagens grandes em base64 saem do documento da agência a cada gravação (asset-store.mjs):
  // o documento guarda só /asset/<hash>; as linhas das imagens são gravadas antes da resposta.
  const auditLog = createAuditLog({ store });
  const changeAgency = async (id, mutate) => {
    agencyCache.delete(id);
    const images = new Map();
    let waiting = 0;
    const result = await store.change(id, state => { const out = mutate(hydrateAgency(state, id)); extractAssets(state, images); waiting = state.audit.length; return out; });
    if (images.size) await saveAssets(store, images);
    await auditLog.settle(id, waiting);
    agencyCache.delete(id);
    return result;
  };
  async function loadMarketplace() {
    try { return hydrateMarketplace(await store.load(MARKETPLACE_DOC_ID)); }
    catch (e) {
      if (e.status !== 404) throw e;
      await store.insert(MARKETPLACE_DOC_ID, emptyMarketplace());
      return hydrateMarketplace(await store.load(MARKETPLACE_DOC_ID));
    }
  }
  async function changeMarketplace(mutate) {
    await store.insert(MARKETPLACE_DOC_ID, emptyMarketplace());
    return store.change(MARKETPLACE_DOC_ID, doc => mutate(hydrateMarketplace(doc)));
  }
  async function extractStudioSites(assets) {
    const sites = {};
    for (const project of assets.studioProjects || []) {
      try {
        const doc = await store.load(siteRowId(project.id));
        const copy = structuredClone(doc);
        copy.published = false;
        if (copy.stats) copy.stats = { visits: 0, leads: 0 };
        sites[project.id] = copy;
      } catch (e) { if (e.status !== 404) throw e; }
    }
    return sites;
  }
  // Setups importados do GHL guardam as páginas em linhas próprias (setup-sites-store.mjs), fora do estado da agência.
  async function withStoredSites(snap) {
    return snap?.sitesStored ? { ...snap, studioSites: await loadSetupSites(store, snap.id) } : snap;
  }
  async function applyStudioSites(snap, studioMap, targetWorkspaceId) {
    if (!snap.studioSites || !studioMap?.size) return;
    for (const [oldId, newId] of studioMap.entries()) {
      const sourceDoc = snap.studioSites[oldId];
      if (!sourceDoc) continue;
      const copy = structuredClone(sourceDoc);
      copy.profile = { name: copy.profile?.name || 'Studio Site' };
      copy.workspace = targetWorkspaceId;
      copy.projectId = newId;
      copy.published = null;
      copy.updatedAt = stamp();
      // Forms and services shown inside the pages point at the records this account received.
      const relink = html => String(html || '').replace(/(<div\b[^>]*\sdata-graao-embed=[^>]*\sdata-id=")([^"]*)(")/gi, (_, a, ref, b) => a + (studioMap.ids?.get(ref) || ref) + b);
      // The pages get new ids, and the versions follow them: a version page without HTML shares the current page's.
      const pageIds = new Map();
      if (Array.isArray(copy.pages)) copy.pages = copy.pages.map(pg => { const id = uid(); pageIds.set(pg.id, id); return { ...pg, id, html: relink(pg.html) }; });
      for (const version of copy.versions || []) version.pages = version.pages.map(pg => ({ ...pg, id: pageIds.get(pg.id) || pg.id, ...(typeof pg.html === 'string' && { html: relink(pg.html) }) }));
      const rowId = siteRowId(newId);
      const inserted = await store.insert(rowId, copy);
      if (!inserted) await store.change(rowId, state => Object.assign(state, copy));
      siteDocCache.delete(newId);
    }
  }
  const auditEntry = (who, action, target = '', details = '') => ({ id: uid(), at: stamp(), actor: who.name, action, target, details });
  const keepEntry = (agency, entry) => {
    agency.audit.push(entry);
    if (agency.audit.length > AUDIT_IN_DOCUMENT) agency.audit.splice(0, agency.audit.length - AUDIT_IN_DOCUMENT);
  };
  const logTo = (agency, who, action, target, details) => keepEntry(agency, auditEntry(who, action, target, details));
  const ensureAccounts = (agency, workspaces) => {
    for (const w of workspaces) {
      agency.accounts[w.id] ??= { status: 'Active', created: w.id === 'demo' ? '' : stamp(), lastLogin: '', plan: '', address: '', phone: '', website: '' };
      if (w.name) agency.accounts[w.id].name = w.name;
    }
  };
  const requestUsers = new WeakMap();
  function verifiedUser(req, res) {
    if (!auth) return null;
    if (!requestUsers.has(req)) {
      requestUsers.set(req, auth.user(req,res).then(user => {
        if (!user) throw error('Entre na sua conta para continuar.',401);
        // Uma aba aberta antes da troca de conta diz em qual conta está: se não é mais esta, nada é lido nem gravado.
        const tabAccount = req.headers['x-graao-account'];
        if (tabAccount && tabAccount !== user.id) {
          res.setHeader('X-Graao-Account-Changed','1');
          throw Object.assign(error('Você trocou de conta em outra aba. Recarregue a página para continuar.',409), { code: 'ACCOUNT_CHANGED' });
        }
        return accountProfile(user);
      }));
    }
    return requestUsers.get(req);
  }
  // Agência sem celular confirmado ou bloqueada só abre as rotas que levam até a confirmação ou o pagamento.
  // Sem a linha de confirmação (GRAAO_VERIFY_*), as agências que já existem seguem como estão e só o cadastro novo fecha.
  const verifyOn = Boolean(phoneVerify?.number && phoneVerify?.instance && phoneVerify?.secret);
  // Fora da Vercel (testes, máquina local) o cadastro fica aberto mesmo sem a linha.
  const openSignup = signupOpen ?? (verifyOn || !platformEnv.VERCEL);
  // O que fecha a agência agora ({ code, error }) ou null. A tela da agência recebe isto em `gate` e cobre o app.
  function agencyGate(agency, invited) {
    if (!verifyOn) return null;
    const access = agencyAccess(agency.billing, new Date());
    if (access.canUse) return null;
    if (invited && access.gate === 'PHONE_REQUIRED') return { code: 'AGENCY_NOT_ACTIVE', error: 'A agência ainda não foi ativada pelo responsável.' };
    return { code: access.gate, error: access.gate === 'PHONE_REQUIRED' ? 'Confirme seu celular pelo WhatsApp para começar a usar o graao.' : 'A agência está bloqueada por falta de pagamento.' };
  }
  function requireAgencyOpen(agency, invited) {
    const closed = agencyGate(agency, invited);
    if (closed) throw Object.assign(error(closed.error, 402), { code: closed.code, billing: publicBilling(agency.billing, new Date()) });
  }
  // Qual agência é dona do domínio da requisição ({ id, name }) ou null no graao. Só o id e o nome ficam um minuto em
  // memória: o resto da agência é sempre lido de novo.
  const domainAgencies = new Map();
  async function domainAgency(req) {
    const host = req ? requestHost(req) : '';
    if (isPlatformHost(host)) return null;
    const cached = domainAgencies.get(host);
    if (cached && cached.expiresAt > Date.now()) return cached.agency;
    const owner = await whiteLabelAgency(store, host);
    const agency = owner ? { id: owner.id, name: owner.state?.company?.name || 'esta agência' } : null;
    domainAgencies.set(host, { agency, expiresAt: Date.now() + 60000 });
    return agency;
  }
  async function accessContext(req,session,{ gate = true } = {}) {
    if (!session && !localAccess) throw error('O login do Supabase ainda não foi configurado.',503);
    const agencyId = !session || session.id === agencyOwnerId ? AGENCY_ID : `agency-${session.id}`;
    let agency;
    try { agency = await loadAgency(agencyId); }
    catch (e) { if (e.status !== 404 || agencyId === AGENCY_ID) throw e; }
    if (!agency) {
      const email = session.email.toLowerCase();
      // White Label: no domínio de uma agência só entra quem ela liberou; ninguém vira cliente novo do graao por ali.
      const domain = await domainAgency(req);
      let invite = await store.findAgency({ users: [{ email, loginEnabled: true }] });
      if (domain && invite && invite.id !== domain.id) {
        const state = await store.load(domain.id);
        invite = hydrateAgency(state, domain.id).users.some(user => user.loginEnabled && user.email === email) ? { id: domain.id, state } : null;
      }
      if (domain && !invite) {
        throw Object.assign(error(`O e-mail ${session.email} ainda não tem acesso a ${domain.name}. Peça a quem administra ${domain.name} para liberar o seu acesso ou entre com outra conta.`, 403), { code: 'NOT_INVITED' });
      }
      if (invite) {
        agency = hydrateAgency(invite.state, invite.id);
        const member = agency.users.find(user => user.loginEnabled && user.email === email);
        const who = { ...userAccess(agency,member.id), agencyId: invite.id, userId: member.id, session, owner: member.role === 'Agency Owner' };
        if (gate && verifyOn && !agencyAccess(agency.billing, new Date()).canUse) agency = hydrateAgency((await store.load(invite.id)), invite.id);
        if (gate) requireAgencyOpen(agency, true);
        return { agency, who };
      }
      const initial = blankAgency();
      Object.assign(initial.profile, { name: session.name, email: session.email });
      const [first, ...last] = (session.name === session.email ? '' : session.name).split(/\s+/);
      initial.profile.first = first || 'Responsável';
      initial.profile.last = last.join(' ');
      initial.company.name = 'Minha agência';
      if (!openSignup) throw Object.assign(error('O cadastro de agências novas está temporariamente fechado. Tente de novo mais tarde.', 503), { code: 'SIGNUP_CLOSED' });
      await store.insert(agencyId,initial);
      agency = await loadAgency(agencyId);
    }
    const userId = localAccess ? String(req.headers['x-go-user'] || req.localSocialUser || '') : '';
    const result = userAccess(agency,userId);
    if (!result) throw error('The selected user no longer exists. Choose another user.',403);
    // platform: o dono da plataforma (página Plataforma, limites dos serviços). Sem login, só o servidor local.
    const platform = Boolean(session ? agencyOwnerId && session.id === agencyOwnerId : localAccess);
    const who = { ...result, agencyId, userId, session, platform, ...(session ? { name: session.name, owner: true } : {}) };
    // A confirmação pode ter chegado por outra instância: antes de fechar, relê sem o cache.
    if (gate && verifyOn && !agencyAccess(agency.billing, new Date()).canUse) agency = await loadFresh(agencyId);
    if (gate) requireAgencyOpen(agency, Boolean(userId));
    return { agency, who };
  }
  const access = async (req,res) => (await accessContext(req,await verifiedUser(req,res))).who;
  const canOpenPersonal = (who,id) => Boolean(who.owner && who.session && personalId(who.session) === id);
  const belongsCache = new Map();
  const BELONGS_CACHE_TTL = 60000;
  async function canOpen(who,id) {
    if (privateSpace.test(id)) return canOpenPersonal(who,id);
    if (who.accounts && !who.accounts.includes(id)) return false;
    const cacheKey = `${who.agencyId}:${id}`;
    const cached = belongsCache.get(cacheKey);
    const now = Date.now();
    if (cached && cached.expiresAt > now) return cached.result;
    const result = await store.belongsToAgency(id,workspaceOwner(who.agencyId));
    belongsCache.set(cacheKey, { result, expiresAt: now + BELONGS_CACHE_TTL });
    return result;
  }
  // A gateway is only connected for the first time when the books can say who sells; who already charges keeps going.
  async function requireFiscal(fiscal, agencyId, scope) {
    if (fiscal || await abacate.connected(agencyId, scope)) return;
    throw Object.assign(error('Complete o cadastro fiscal em Configurações antes de conectar o AbacatePay.', 409), { code: 'FISCAL_REQUIRED' });
  }
  const retryPolicyOf = agency => ({ maxRetry: agency.saas.autoSuspend.maxRetry, retryEvery: agency.saas.autoSuspend.retryEvery });
  const pausedError = (lifecycle, showReason = false) => Object.assign(
    error(lifecycle.status === 'Closed' ? 'Esta subconta foi encerrada.' : 'Esta subconta está pausada.', 403),
    { code: 'ACCOUNT_SUSPENDED', account: showReason ? lifecycle : { status: lifecycle.status } }
  );
  async function systemWorkspaceAccess(id, agencyId) {
    const actor = { modules: null };
    if (privateSpace.test(id)) return effectiveAccess({}, actor, id, true);
    const owner = agencyId || (await store.load(id)).agencyId || AGENCY_ID;
    return effectiveAccess(await store.load(owner), actor, id);
  }
  const accountIsActive = async (agencyId, id, module) => {
    const access = await systemWorkspaceAccess(id, agencyId);
    return access.account.status === 'Active' && (!module || hasModule(access, module));
  };
  async function requireActiveAccount(agencyId, id, showReason = false, module) {
    const access = await systemWorkspaceAccess(id, agencyId);
    const lifecycle = access.account;
    if (lifecycle.status !== 'Active') throw pausedError(lifecycle, showReason);
    if (module) requireModule(access, module);
  }
  async function webhookBlockReason(agencyId, id, provider) {
    const access = await systemWorkspaceAccess(id, agencyId);
    if (access.account.status === 'Active') return hasModule(access, 'conversations') ? null : 'MODULE_DISABLED';
    await changeAgency(agencyId, agency => {
      const meta = agency.accounts[id];
      meta.ignoredWebhooks ??= {};
      const prior = meta.ignoredWebhooks[provider];
      meta.ignoredWebhooks[provider] = { count: (prior?.count || 0) + 1, lastAt: stamp() };
    });
    return 'ACCOUNT_SUSPENDED';
  }
  async function publicAccountPolicy(id, write = false, module) {
    const access = await systemWorkspaceAccess(id);
    const lifecycle = access.account;
    if (lifecycle.status === 'Closed') throw Object.assign(error('Este conteúdo está indisponível.', 404), { publicAccount: true });
    if (module && !hasModule(access, module)) throw Object.assign(error('Este conteúdo está indisponível.', 404), { publicAccount: true });
    if (write && lifecycle.status !== 'Active') throw Object.assign(pausedError(lifecycle), { publicAccount: true });
    return lifecycle.status === 'Active';
  }
  async function requireWorkspaceAccess(agency, actor, id, { modules = [], support = false, hide = false, reason = true } = {}) {
    if ((!spaceId.test(id) && !privateSpace.test(id)) || !await canOpen(actor, id)) {
      throw error('Your user cannot open this sub-account.', hide ? 404 : 403);
    }
    if (inTrash(agency, id)) throw error('Esta subconta foi excluída e está na lixeira da agência.', 404);
    const who = effectiveAccess(agency, actor, id, privateSpace.test(id));
    requireModule(who, ...modules);
    if (who.account.status !== 'Active' && !(support && who.support)) throw pausedError(canReactivate(agency, id, who) ? { ...who.account, canReactivate: true } : who.account, reason);
    return who;
  }
  async function workspaceAccess(req, res, id, options) {
    const { agency, who } = await accessContext(req, await verifiedUser(req, res));
    return requireWorkspaceAccess(agency, who, id, options);
  }
  async function publicPreview(req, res, url, workspace) {
    if (url.searchParams.get('preview') !== '1') return false;
    await workspaceAccess(req, res, workspace, { modules: ['sites'], hide: true });
    return true;
  }
  async function existingPersonalWorkspace(who) {
    if (!who.owner || !who.session) return;
    const id = personalId(who.session);
    try { return { id, name: (await store.load(id)).profile.name }; }
    catch (e) { if (e.status !== 404) throw e; }
  }
  async function visibleWorkspaces(who) {
    const [workspaces, personalWorkspace] = await Promise.all([listWorkspaces(who.agencyId), existingPersonalWorkspace(who)]);
    const visible = workspaces.filter(w => !who.accounts || who.accounts.includes(w.id));
    return personalWorkspace ? [...visible, personalWorkspace] : visible;
  }
  async function agencyPayload(req, res, extra = {}) {
    const { agency, who } = await accessContext(req,await verifiedUser(req,res),{ gate: false });
    requireCapability(who, 'agency', 'Seu usuário não pode abrir a visualização da agência.');
    const [workspaces, personalWorkspace, marketplaceDoc] = await Promise.all([
      listWorkspaces(who.agencyId),
      existingPersonalWorkspace(who),
      loadMarketplace()
    ]);
    ensureAccounts(agency, workspaces);
    const states = await agencyWorkspaceViews(agency, who, workspaces);
    const gateway = await abacate.status(who.agencyId, abacate.AGENCY_SCOPE, publicBase(req));
    return { agency: { ...publicAgency(agency, who), abacatepay: { connected: gateway.connected, storeName: gateway.storeName || '', devMode: Boolean(gateway.devMode) } }, overview: agencyOverview(agency, states), marketplace: publicMarketplaceList(marketplaceDoc, who.agencyId), workspaces, personalWorkspace, access: who,
      trash: who.settings ? trashList(agency) : [],
      features:{prospectingMaps:placesConfigured,prospectingMapsEmbed:mapsEmbedKey}, billing: publicBilling(agency.billing, new Date()), gate: agencyGate(agency, Boolean(who.userId)), ...extra };
  }
  // Sub-accounts of a brand group that still belong to the agency and are not closed, with their state.
  async function brandWorkspaces(agency, agencyId, group) {
    const wanted = new Set(group.accountIds);
    const rows = (await listWorkspaces(agencyId)).filter(w => wanted.has(w.id) && agency.accounts?.[w.id]?.status !== 'Closed');
    return Promise.all(rows.map(async w => ({ id: w.id, name: w.name, state: await store.load(w.id) })));
  }
  const agencyWorkspaceViews = (agency, who, workspaces) => Promise.all(workspaces.map(async w => ({
    ...w, ...workspaceView(effectiveAccess(agency, who, w.id), await store.load(w.id))
  })));
  // Reselling: the agency's prices for each sub-account, copied into its wallet so every send can charge locally.
  async function syncWallets(agencyId, workspaces) {
    const agency = await loadAgency(agencyId);
    for (const w of workspaces) await store.change(w.id, s => { setPricing(s, pricingFor(agency, w.id)); });
  }
  // Labs: the agency's mode for each feature, copied into every sub-account.
  async function syncLabs(agencyId, workspaces) {
    const agency = await loadAgency(agencyId);
    for (const w of workspaces) await store.change(w.id, s => { setLabsOffer(s, agency.labs); });
  }
  /** A loose entry goes straight to the table; only without it is the agency document written again. */
  async function writeAudit(who, action, target, details) {
    const entry = auditEntry(who, action, target, details);
    if (!await auditLog.append(who.agencyId, entry)) await changeAgency(who.agencyId, agency => keepEntry(agency, entry));
  }
  async function recordAudit(who, action, target, details = '') {
    try { await writeAudit(who, action, target, details); }
    catch { /* Audit entries are best effort and never undo the action itself. */ }
  }
  async function createAccount(who, input) {
    const name = typeof input.name === 'string' ? input.name.trim().slice(0,70) : '';
    if (!name) throw error('O nome da subconta é obrigatório.',400);
    const state = blank(name);
    if (who.agencyId !== AGENCY_ID) state.agencyId = who.agencyId;
    const mail = typeof input.email === 'string' ? input.email.trim().toLowerCase().slice(0,240) : '';
    if (mail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mail)) throw error('Informe um endereço de e-mail válido.',400);
    Object.assign(state.profile, { email: mail, phone: String(input.phone || '').slice(0,48) });
    if (['America/Sao_Paulo','America/New_York','Europe/London','UTC'].includes(input.timezone)) state.profile.timezone = input.timezone;
    const agency = await loadAgency(who.agencyId);
    if (input.plan) {
      requireCapability(who, 'settings', 'Somente administradores podem atribuir um plano à subconta.');
      if (!agency.plans.some(p => p.id === input.plan)) throw error('Escolha um plano válido.',400);
    }
    const newId = uid();
    let loaded = null;
    const studioMap = new Map();
    if (input.snapshotId || input.templateId) {
      // A setup from the agency library, or a segment template straight from the gallery (like GHL snapshot templates).
      const template = input.templateId ? findMarketplaceSetup(await loadMarketplace(), input.templateId) : null;
      const found = template?.template ? { id: template.id, name: template.title, assets: template.assets, studioSites: template.studioSites || {} } : agency.snapshots.find(item => item.id === input.snapshotId);
      if (!found) throw error('Choose a valid snapshot.',400);
      const snap = await withStoredSites(found);
      const planned = { ...agency, accounts: { [newId]: { plan: input.plan } } };
      requireSetupModules(effectiveAccess(planned, who, newId), Object.keys(snap.assets || {}));
      loaded = { snap, report: applySnapshot(state, snap, 'skip', studioMap) };
    }
    // Central de IA defaults and the agency's Labs offer start with the new sub-account.
    const aiDefaults = agency.aiDefaults || {};
    state.ai = { ...state.ai, limit: Number(aiDefaults.limit) || 0, alertAt: Number(aiDefaults.alertAt) || 0.8 };
    setAiAccess(state, aiDefaults.enabled !== false);
    setLabsOffer(state, agency.labs);
    await store.insert(newId, state);
    if (loaded) await applyStudioSites(loaded.snap, studioMap, newId);
    if (loaded && input.templateId && loaded.snap.id === input.templateId) await changeMarketplace(doc => recordMarketplaceInstall(doc, input.templateId));
    await changeAgency(who.agencyId, a => {
      a.accounts[newId] = { name, status: 'Active', created: stamp(), lastLogin: '', plan: input.plan || '', address: String(input.address || '').slice(0,240), phone: state.profile.phone, website: '' };
      logTo(a, who, 'Sub-account created', name, loaded ? `Snapshot ${loaded.snap.name}` : '');
      if (loaded) a.snapshotLoads.push({ id: uid(), snapshotId: loaded.snap.id, snapshot: loaded.snap.name, workspace: newId, account: name, at: stamp(), mode: 'skip', ...loaded.report });
    });
    return newId;
  }
  const KEY_USE_WRITE = 10 * 60000;
  // Whose key this is and what it may do. Scopes null = a full agency key.
  async function apiCredential(req) {
    const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i,'');
    if (!token) throw error('Send an API key in the Authorization header.',401);
    const digest = hash(token);
    const matches = await Promise.all([store.findAgency({ apiKeys: [{ hash: digest }] }), store.findAgency({ privateIntegrations: [{ hash: digest }] })]);
    const match = matches.find(Boolean);
    if (!match) throw error('This key is invalid or lacks the required scope.',401);
    const keyOf = agency => [...(agency.apiKeys || []), ...(agency.privateIntegrations || [])].find(k => k.hash === digest);
    const found = keyOf(match.state);
    // "Last used" only needs to be roughly right: an AI makes many calls in a row, and each write rewrites the agency.
    if (!(Date.now() - Date.parse(found.lastUsed) < KEY_USE_WRITE)) await changeAgency(match.id, agency => {
      const key = keyOf(agency);
      if (key) key.lastUsed = stamp();
    });
    return { agencyId: match.id, name: found.name, scopes: found.scopes || null };
  }
  async function bearer(req, scope) {
    const key = await apiCredential(req);
    if (key.scopes && !key.scopes.includes(scope)) {
      throw error('This key is invalid or lacks the required scope.',401);
    }
    return key.agencyId;
  }
  // ---- AI Studio sites ----
  async function studioGuard(req, res, workspace) {
    if (!spaceId.test(workspace) && !privateSpace.test(workspace)) throw error('Workspace not found.',404);
    return workspaceAccess(req, res, workspace, { modules: ['sites'] });
  }
  const siteDocCache = new Map();
  const SITE_DOC_CACHE_TTL = 300000;
  async function siteDoc(workspace, projectId, create = true) {
    if (!/^[0-9a-f-]{36}$/.test(String(projectId))) throw error('Project not found.',404);
    const cached = siteDocCache.get(projectId);
    const now = Date.now();
    if (cached && cached.expiresAt > now && cached.doc.workspace === workspace) {
      return structuredClone(cached.doc);
    }
    let doc = await Promise.resolve().then(() => store.load(siteRowId(projectId))).catch(e => { if (e.status === 404) return null; throw e; });
    if (doc && doc.workspace !== workspace) throw error('Project not found.',404);
    if (doc || !create) {
      if (doc) siteDocCache.set(projectId, { doc: structuredClone(doc), expiresAt: now + SITE_DOC_CACHE_TTL });
      return doc;
    }
    const project = (await store.load(workspace)).studioProjects.find(item => item.id === projectId);
    if (!project) throw error('Project not found.',404);
    doc = newSiteDoc({ workspace, project, pages:[{ name:'Home', slug:'index', html:pageFromStructure(project) }] });
    await store.insert(siteRowId(projectId), doc);
    const loaded = await store.load(siteRowId(projectId));
    siteDocCache.set(projectId, { doc: structuredClone(loaded), expiresAt: now + SITE_DOC_CACHE_TTL });
    return loaded;
  }
  const changeSite = async (projectId, mutate) => {
    siteDocCache.delete(projectId);
    const result = await store.change(siteRowId(projectId), mutate);
    siteDocCache.delete(projectId);
    return result;
  };
  const syncMeta = (workspace, projectId, doc) => change(workspace,{ type:'studio-meta', id:projectId, data:{
    pages:doc.pages.map(({ id:pageId, name, slug }) => ({ id:pageId, name, slug })), rev:doc.rev,
    publishedAt:doc.published?.at || '', publishedRev:doc.published?.rev || 0 } });
  async function studioRequest(workspace, op, input, session) {
    const project = (await store.load(workspace)).studioProjects.find(item => item.id === input.id);
    if (!project) throw error('Project not found.',404);
    const doc = await siteDoc(workspace, project.id);
    const text = (value, label, limit) => { const v = typeof value === 'string' ? value.trim() : ''; if (!v) throw error(`${label} is required.`,400); if (v.length > limit) throw error(`${label} can have up to ${limit} characters.`,400); return v; };
    if (op === 'save') return changeSite(project.id, d => savePage(d, input.pageId, input.html, typeof input.label === 'string' ? input.label : 'Saved'));
    if (op === 'revise') {
      const instruction = text(input.instruction,'Request',2000);
      const selection = typeof input.selection === 'string' ? input.selection.slice(0,8000) : '';
      const page = findPage(doc, input.pageId);
      const revised = await revisePage(await openAI.requireConnection(session), { html:page.html, instruction, selection });
      const before = doc.versions.at(-1)?.id || '';
      await changeSite(project.id, d => { savePage(d, page.id, revised.html, `AI: ${instruction}`); return chatEntry(d, { ask:instruction, reply:revised.change, before, page:page.name }); });
      return { change: revised.change };
    }
    if (op === 'page') {
      if (input.action === 'add') {
        const name = text(input.name,'Page name',60);
        const description = typeof input.description === 'string' ? input.description.trim().slice(0,1500) : '';
        const home = doc.pages.find(item => item.slug === 'index') || doc.pages[0];
        const design = project.design ? validDesign(project.design) : null;
        const role = /obrigad|thank/i.test(`${name} ${input.slug || ''}`) ? 'thanks' : /contato|contact/i.test(name) ? 'contact' : 'page';
        const html = input.ai ? (await generatePage(await openAI.requireConnection(session), { name, description, home:home.html, slugs:doc.pages.map(item => item.slug), design })).html
          : design ? designedPage({ siteName:project.name, page:{ name, slug:input.slug || '', purpose:description }, design, role, summary:project.summary })
          : pageFromStructure({ ...project, blocks:[], summary:description }, name);
        const pageId = await changeSite(project.id, d => addPage(d, name, html));
        if (typeof input.slug === 'string' && input.slug.trim()) await changeSite(project.id, d => setSlug(d, pageId, input.slug));
        return pageId;
      }
      if (input.action === 'rename') return changeSite(project.id, d => renamePage(d, input.pageId, input.name));
      if (input.action === 'duplicate') return changeSite(project.id, d => duplicatePage(d, input.pageId));
      if (input.action === 'move') return changeSite(project.id, d => movePage(d, input.pageId, input.direction === 'up' ? 'up' : 'down'));
      if (input.action === 'slug') return changeSite(project.id, d => setSlug(d, input.pageId, input.slug));
      if (input.action === 'delete') return changeSite(project.id, d => deletePage(d, input.pageId));
      throw error('Choose a valid page action.',400);
    }
    if (op === 'restore') return changeSite(project.id, d => restoreVersion(d, input.versionId));
    if (op === 'note') return changeSite(project.id, d => chatEntry(d, { ask:text(input.ask,'Pedido',4000), reply:text(input.reply,'Resposta',4000), before:'' }));
    if (op === 'chat-undo') {
      return changeSite(project.id, d => {
        const entry = (d.chat || []).find(item => item.id === input.entryId);
        if (!entry?.before) throw error('Esta mensagem não tem uma alteração para desfazer.',400);
        if (entry.undone) throw error('Esta alteração já foi desfeita.',409);
        restoreVersion(d, entry.before);
        entry.undone = new Date().toISOString();
        return entry.id;
      });
    }
    if (op === 'seo') return changeSite(project.id, d => setSeo(d, input.pageId, input));
    if (op === 'seo-ai') {
      const page = findPage(doc, input.pageId);
      const seo = await suggestSeo(await openAI.requireConnection(session), { name:page.name, html:page.html });
      await changeSite(project.id, d => setSeo(d, page.id, seo));
      return seo;
    }
    if (op === 'stats-reset') return changeSite(project.id, d => resetStats(d));
    if (op === 'publish') {
      if (input.publish) {
        const state = await store.load(workspace);
        const form = project.formId && state.forms.find(item => item.id === project.formId);
        if (form) { if (!form.active) await change(workspace,{ type:'save', key:'forms', id:form.id, data:{ ...form, active:true } }); }
        else {
          const created = await change(workspace,{ type:'save', key:'forms', data:{ name:`${project.name} · AI Studio`, description:'Leads from the published AI Studio site.', askPhone:true, active:true } });
          await change(workspace,{ type:'studio-meta', id:project.id, data:{ formId:created.id } });
        }
      }
      return changeSite(project.id, d => publish(d, Boolean(input.publish)));
    }
    throw error('Unknown AI Studio request.',404);
  }
  // Every field of a public form post, keeping repeated keys (checkboxes, multiple choice) as lists.
  async function formBody(req) {
    if (!/^application\/x-www-form-urlencoded/i.test(req.headers['content-type'] || '')) throw error('Envie os campos do formulário.',415);
    let size = 0; const chunks = [];
    for await (const part of req) { size += part.length; if (size > 60000) throw error('Formulário muito longo.',413); chunks.push(part); }
    const params = new URLSearchParams(Buffer.concat(chunks).toString('utf8')), out = {};
    for (const key of new Set(params.keys())) { if (key.length > 60) continue; const all = params.getAll(key).slice(0,50).map(v => v.slice(0,5000)); out[key] = all.length > 1 ? all : all[0]; }
    return out;
  }
  async function formFields(req) {
    if (!/^application\/x-www-form-urlencoded/i.test(req.headers['content-type'] || '')) throw error('Send the form fields.',415);
    let size = 0; const chunks = [];
    for await (const part of req) { size += part.length; if (size > 20000) throw error('Request is too large.',413); chunks.push(part); }
    const params = new URLSearchParams(Buffer.concat(chunks).toString('utf8'));
    return { ...Object.fromEntries(['name','email','phone','_page'].map(key => [key, (params.get(key) || '').slice(0,240)])), message:(params.get('message') || '').slice(0,2400) };
  }
  async function findProspects(who,input) {
    const agency = await loadAgency(who.agencyId);
    const agent = input.agent ? agency.prospecting.agents.find(row => row.id === input.agent) : null;
    if (input.agent && !agent) throw error('Agente não encontrado.',404);
    const term = typeof input.keyword === 'string' ? input.keyword.trim().slice(0,120) : '';
    const keywords = agent?.niches || (term ? [term] : []);
    const location = agent?.location || (typeof input.location === 'string' ? input.location.trim().slice(0,140) : '');
    const radius = agent?.radius || ([2,5,10,20,30].includes(Number(input.radius)) ? Number(input.radius) : 5);
    if (!keywords.length || !location) throw error('Informe a empresa ou nicho e a região.',400);
    const saved = new Map(agency.prospects.filter(row => row.placeId).map(row => [row.placeId,row.id]));
    if (!placesConfigured) {
      const { center,rows } = await osmSearch(keywords,location,radius);
      return { provider:'osm',center,radius,rows:rows.map(row => ({...row,saved:saved.get(row.placeId) || ''})) };
    }
    const results = await placesSearch(keywords,location,radius);
    const items = new Map(results.map(row => [row.placeId,row]));
    return { provider:'maps',rows:[...items.values()].slice(0,20).map(row => ({...row,saved:saved.get(row.placeId) || ''})) };
  }

  async function transferProspects(who,input) {
    const workspace = typeof input.workspace === 'string' ? input.workspace : '';
    if (!spaceId.test(workspace)) throw error('Escolha uma subconta à qual você tem acesso.',400);
    await requireWorkspaceAccess(await loadAgency(who.agencyId), who, workspace, {
      modules: input.opportunity === true ? ['contacts', 'opportunities'] : ['contacts']
    });
    const ids = Array.isArray(input.ids) ? [...new Set(input.ids.slice(0,100))] : [];
    if (!ids.length) throw error('Selecione pelo menos um prospect.',400);
    const agency = await loadAgency(who.agencyId);
    const prospects = ids.map(id => agency.prospects.find(row => row.id === id && !row.archived));
    if (prospects.some(row => !row)) throw error('Um dos prospects não está disponível para envio.',404);
    const imported = await store.change(workspace,state => receiveProspects(state,prospects,{opportunity:input.opportunity === true}));
    const at = stamp();
    await changeAgency(who.agencyId, current => {
      for (const item of imported) {
        const row = current.prospects.find(prospect => prospect.id === item.id);
        if (row) row.transfers[workspace] = { contact:item.contact,opportunity:item.opportunity,at:row.transfers[workspace]?.at || at };
      }
      logTo(current,who,'Prospects sent to CRM',workspace,`${imported.length} prospect(s)`);
    });
    return imported;
  }

  async function agencyRequest(op, who, input) {
    if (op === 'prospecting-search') return findProspects(who,input);
    if (op === 'prospecting-places') {
      // Dados do Google Maps para mostrar na tela: lidos ao vivo pelo placeId, nunca gravados.
      const agency = await loadAgency(who.agencyId);
      const ids = Array.isArray(input.ids) ? input.ids.slice(0,60) : [];
      return placeSummaries(ids.map(id => agency.prospects.find(row => row.id === id)?.placeId).filter(isGooglePlace));
    }
    if (op === 'prospecting-transfer') return transferProspects(who,input);
    if (op === 'prospecting-action') {
      if (['brand','sections','widget'].includes(input.op)) requireCapability(who, 'settings', 'Somente administradores podem alterar essas configurações.');
      const data = input.data && typeof input.data === 'object' && !Array.isArray(input.data) ? input.data : {};
      const apply = (command,trusted) => changeAgency(who.agencyId, agency => {
        const result = runProspectingAction(agency,command,trusted);
        logTo(agency,who,`Prospecting: ${command.op}`,typeof command.id === 'string' ? command.id : '');
        return result;
      });
      // The automated audit reaches the network, so it runs outside the agency write and is applied afterwards.
      const audited = async (id,manual = {}) => {
        const row = (await loadAgency(who.agencyId)).prospects.find(item => item.id === id);
        if (!row) throw error('Registro não encontrado.',404);
        const audit = await prospectAudit({ ...row }).catch(() => null);
        return apply({ op:'audit',id,data:manual },{ audit });
      };
      if (input.op === 'audit' && typeof input.id === 'string') return audited(input.id,data);
      if (input.op === 'save-maps' && Array.isArray(data.placeIds) && data.placeIds.some(id => typeof id === 'string' && id.startsWith('osm-'))) {
        // OpenStreetMap details are re-read here so the saved prospect never trusts client-supplied fields.
        const ids = data.placeIds.filter(id => typeof id === 'string' && id.startsWith('osm-')).slice(0,20);
        return apply({ ...input,data },{ places:await osmLookup(ids) });
      }
      if (input.op === 'save' && !input.id && [true,'true','on'].includes(data.audit)) {
        const id = await apply({ ...input,data:{ ...data,audit:false } });
        await audited(id);
        return id;
      }
      return apply({ ...input,data });
    }
    if (op === 'subaccount-wallet') {
      requireCapability(who, 'settings', 'Seu usuário não pode lançar créditos nas carteiras.');
      const workspace = String(input.workspace || '');
      if (!(await listWorkspaces(who.agencyId)).some(w => w.id === workspace)) throw error('Subconta não encontrada.', 404);
      const kind = input.kind === 'debit' ? 'debit' : 'credit';
      const balance = await store.change(workspace, s => walletAdjust(s, { kind, amount: input.amount, note: input.note, by: who.name, method: 'Lançamento da agência' }));
      await recordAudit(who, kind === 'credit' ? 'Crédito lançado na carteira' : 'Débito lançado na carteira', workspace, `R$ ${Number(input.amount).toFixed(2)}`);
      flushLater(workspace);
      return balance;
    }
    if (op === 'action') {
      const workspaces = await listWorkspaces(who.agencyId);
      const shareCode = input.type === 'snapshot-import' && typeof input.data?.code === 'string' ? input.data.code.trim().toLowerCase() : '';
      const shared = /^[0-9a-f]{12}$/.test(shareCode) ? await store.findAgency({ snapshots: [{ shareCode, shared: true }] }) : null;
      const sharedSnapshot = shared?.state.snapshots.find(item => item.shareCode === shareCode && item.shared);
      // White Label: o domínio das subcontas é de uma agência só, e a hospedagem passa a atendê-lo.
      const newDomain = input.type === 'company' && input.data?.domain !== undefined ? whiteLabelHost(input.data.domain) : null;
      if (newDomain) await requireFreeDomain(store, newDomain, who.agencyId);
      const priorDomain = newDomain !== null ? (await loadAgency(who.agencyId)).company?.domain || '' : '';
      // White Label: o domínio de envio da agência mora na Resend. Ele é criado, conferido e removido lá, depois de
      // conferir a permissão, e o resultado entra no estado da agência.
      let emailDomain, priorMail = {};
      if (['email-domain', 'email-domain-status', 'email-domain-remove'].includes(input.type)) {
        const agency = await loadAgency(who.agencyId), actor = userAccess(agency, who.userId);
        if (!actor) throw error('The selected user no longer exists.',403);
        requireCapability(actor, 'agency', 'Your user cannot open the agency view.');
        requireAgencyCommand(actor, input, agency);
        priorMail = agency.emailServices || {};
      }
      if (input.type === 'email-domain') {
        normalizeLocalPart(input.data?.localPart || 'contato');
        emailDomain = await emailDomainApi.add(input.data?.domain);
      }
      if (input.type === 'email-domain-status') {
        if (!priorMail.resendId) throw error('Adicione o domínio de envio de novo para criá-lo no serviço de e-mail.',400);
        await emailDomainApi.verify(priorMail.resendId).catch(() => {});
        emailDomain = await emailDomainApi.get(priorMail.resendId);
      }
      const outcome = await changeAgency(who.agencyId, agency => {
        const currentActor = userAccess(agency, who.userId);
        if (!currentActor) throw error('The selected user no longer exists.',403);
        requireCapability(currentActor, 'agency', 'Your user cannot open the agency view.');
        requireAgencyCommand(currentActor, input, agency);
        if (sharedSnapshot) requireSetupModules(currentActor, Object.keys(sharedSnapshot.assets || {}));
        ensureAccounts(agency, workspaces);
        const result = executeAgency(agency, input, { accountIds: workspaces.map(w => w.id), actor: who.name, sharedSnapshot, emailDomain });
        if (who.session && input.type === 'save' && input.key === 'users') {
          agency.users.find(user => user.id === result).loginEnabled = true;
        }
        return result;
      });
      // Setups com páginas em linhas próprias: excluir apaga as linhas; importar por código copia para o setup novo.
      if (input.type === 'snapshot-delete') await removeSetupSites(store, String(input.id || ''));
      if (input.type === 'snapshot-import' && typeof outcome === 'string') {
        const copy = (await loadAgency(who.agencyId)).snapshots.find(s => s.id === outcome);
        const origin = sharedSnapshot || (await loadAgency(who.agencyId)).snapshots.find(s => s.shareCode === shareCode && s.shared);
        if (copy?.sitesStored && origin) await saveSetupSites(store, copy.id, await loadSetupSites(store, origin.id));
      }
      // Reselling prices are copied into each sub-account's wallet.
      if (['saas-rebilling', 'rebill-account'].includes(input.type)) await syncWallets(who.agencyId, workspaces);
      if (input.type === 'labs') await syncLabs(who.agencyId, workspaces);
      // O domínio de envio trocado ou removido sai da Resend.
      if (['email-domain', 'email-domain-remove'].includes(input.type) && priorMail.resendId && priorMail.resendId !== emailDomain?.id) {
        await emailDomainApi.remove(priorMail.resendId).catch(problem => console.error('agency email domain:', priorMail.domain, problem.message));
      }
      if (newDomain !== null && newDomain !== priorDomain) {
        if (newDomain) await hosting.add(newDomain).catch(problem => console.error('white-label domain:', newDomain, problem.message));
        // The old address leaves the project: kept there it stayed tied to this agency's deploy for good.
        if (priorDomain) await hosting.remove(priorDomain).catch(problem => console.error('white-label old domain:', priorDomain, problem.message));
      }
      return outcome;
    }
    // White Label: o domínio das subcontas está na hospedagem e o DNS já aponta para cá?
    if (op === 'domain-status') {
      requireCapability(who, 'settings', 'Seu usuário não pode ver as configurações da agência.');
      return hosting.status((await loadAgency(who.agencyId)).company?.domain || '');
    }
    // Central de IA: usage over a period, and the agency's limit and switch for each sub-account.
    if (op === 'ai-usage') {
      const workspaces = await listWorkspaces(who.agencyId);
      const rows = await Promise.all(workspaces.map(async w => ({ id: w.id, name: w.name, ai: (await store.load(w.id)).ai })));
      return agencyAiUsage(rows, String(input.period || '30'));
    }
    if (['ai-limit', 'ai-access', 'ai-apply-defaults'].includes(op)) {
      requireCapability(who, 'settings', 'Seu usuário não pode mudar os limites de IA das subcontas.');
      const workspaces = await listWorkspaces(who.agencyId);
      if (op === 'ai-apply-defaults') {
        const { limit = 0, alertAt = 0.8 } = (await loadAgency(who.agencyId)).aiDefaults || {};
        const all = input.scope === 'all';
        let changed = 0;
        for (const w of workspaces) {
          const done = await store.change(w.id, s => {
            if (!all && Number(s.ai?.limit) > 0) return false;
            setAiLimit(s, { limit, alertAt });
            return true;
          });
          if (done) changed += 1;
        }
        await recordAudit(who, 'Limite padrão de IA aplicado', all ? 'Todas as subcontas' : 'Subcontas sem limite', `US$ ${Number(limit).toFixed(2)} em ${changed} subconta(s)`);
        return changed;
      }
      const workspace = workspaces.find(w => w.id === String(input.workspace || ''));
      if (!workspace) throw error('Subconta não encontrada.', 404);
      if (op === 'ai-limit') {
        const usage = await store.change(workspace.id, s => setAiLimit(s, input));
        await recordAudit(who, 'Limite de IA alterado', workspace.name, usage.limit ? `US$ ${usage.limit.toFixed(2)} por mês, alerta em ${Math.round((Number(input.alertAt) || 0.8) * 100)}%` : 'Sem limite');
        return usage.limit;
      }
      const on = input.on === true || input.on === 'true';
      await store.change(workspace.id, s => setAiAccess(s, on));
      await recordAudit(who, on ? 'IA ligada na subconta' : 'IA desligada na subconta', workspace.name);
      return on;
    }
    if (op === 'brand-group-report') {
      const agency = await loadAgency(who.agencyId);
      const group = agency.brandGroups?.find(row => row.id === input.id);
      if (!group) throw error('Grupo de marcas não encontrado.',404);
      return brandGroupData(group, await brandWorkspaces(agency, who.agencyId, group));
    }
    if (op === 'accounts') return createAccount(who, input);
    if (op === 'snapshot-create' || op === 'snapshot-refresh') {
      const agency = await loadAgency(who.agencyId);
      const prior = op === 'snapshot-refresh' ? agency.snapshots.find(s => s.id === input.id) : null;
      if (op === 'snapshot-refresh' && !prior) throw error('Snapshot not found.',404);
      if (prior && prior.kind !== 'mine') throw error('Only your own snapshots can be refreshed from their source.',400);
      const source = prior ? prior.workspace : input.workspace;
      if (!(await listWorkspaces(who.agencyId)).some(w => w.id === source)) throw error('Choose a valid source sub-account.',400);
      const sourceAccess = await requireWorkspaceAccess(agency, who, source);
      const include = prior ? prior.include : Array.isArray(input.include) && input.include.length ? input.include.filter(k => snapshotAssets.some(a => a[0] === k)) : snapshotAssets.map(a => a[0]);
      if (!include.length) throw error('Choose at least one asset type.',400);
      requireSetupModules(sourceAccess, include);
      const name = prior ? prior.name : String(input.name || '').trim().slice(0,100);
      if (!name) throw error('Snapshot name is required.',400);
      const { assets, counts } = extractSnapshot(await store.load(source), include);
      const studioSites = await extractStudioSites(assets);
      return changeAgency(who.agencyId, a => {
        if (prior) {
          const snap = a.snapshots.find(s => s.id === prior.id);
          Object.assign(snap, { assets, studioSites, counts, updated: stamp(), version: (snap.version || 1) + 1 });
          logTo(a, who, 'Snapshot refreshed', snap.name, `Version ${snap.version}`);
          return snap.id;
        }
        if (a.snapshots.length >= 50) throw error('You can keep up to 50 snapshots.',400);
        const snap = { id: uid(), name, kind: 'mine', workspace: source, include, assets, studioSites, counts, version: 1, created: stamp(), updated: stamp(), shareCode: '', shared: false };
        a.snapshots.push(snap);
        logTo(a, who, 'Snapshot created', name);
        return snap.id;
      });
    }
    if (op === 'snapshot-preview') {
      // Conflict check before a load: nothing is written.
      const agency = await loadAgency(who.agencyId);
      const snap = agency.snapshots.find(s => s.id === input.id);
      if (!snap) throw error('Snapshot not found.',404);
      const targets = Array.isArray(input.workspaces) ? (await listWorkspaces(who.agencyId)).filter(w => input.workspaces.includes(w.id)) : [];
      if (!targets.length) throw error('Choose at least one sub-account.',400);
      const { items } = loadChoices(input);
      const out = [];
      for (const target of targets) {
        await requireWorkspaceAccess(agency, who, target.id);
        const categories = previewSnapshot(await store.load(target.id), snap, items);
        // A protected setup reveals counts, never record names.
        out.push({ workspace: target.id, account: target.name, categories: snap.protected ? categories.map(({ conflicts, ...c }) => ({ ...c, conflicts: conflicts.map(() => '') })) : categories });
      }
      return out;
    }
    if (op === 'snapshot-load') {
      const agency = await loadAgency(who.agencyId);
      const found = agency.snapshots.find(s => s.id === input.id);
      if (!found) throw error('Snapshot not found.',404);
      const snap = await withStoredSites(found);
      const targets = Array.isArray(input.workspaces) ? (await listWorkspaces(who.agencyId)).filter(w => input.workspaces.includes(w.id)) : [];
      if (!targets.length) throw error('Choose at least one sub-account.',400);
      for (const target of targets) {
        const targetAccess = await requireWorkspaceAccess(agency, who, target.id);
        requireSetupModules(targetAccess, Object.keys(snap.assets || {}));
      }
      const mode = input.mode === 'overwrite' ? 'overwrite' : 'skip';
      const { items, modes } = loadChoices(input);
      const loads = [];
      for (const target of targets) {
        const studioMap = new Map();
        const report = await store.change(target.id, state => applySnapshot(state, snap, mode, studioMap, { items, modes }));
        await applyStudioSites(snap, studioMap, target.id);
        loads.push({ id: uid(), snapshotId: snap.id, snapshot: snap.name, workspace: target.id, account: target.name, at: stamp(), mode,
          ...(items ? { partial: true } : {}), ...(Object.keys(modes).length ? { modes } : {}), ...report });
      }
      await changeAgency(who.agencyId, a => {
        a.snapshotLoads.push(...loads);
        if (a.snapshotLoads.length > 500) a.snapshotLoads.splice(0, a.snapshotLoads.length - 500);
        logTo(a, who, 'Snapshot loaded', snap.name, targets.map(t => t.name).join(', '));
      });
      return loads;
    }
    if (op === 'marketplace-publish') {
      const agency = await loadAgency(who.agencyId);
      const snap = agency.snapshots.find(s => s.id === input.snapshotId && s.kind === 'mine');
      if (!snap) throw error('Escolha um setup criado pela sua agência para publicar.',400);
      requireSetupModules(who, Object.keys(snap.assets || {}));
      const author = agency.company?.name || who.name || 'Agência da comunidade';
      const { listing, updated } = await changeMarketplace(doc => publishToMarketplace(doc, {
        agencyId: who.agencyId, author, snap, studioSites: snap.studioSites || {}, input
      }));
      await changeAgency(who.agencyId, a => {
        const localSnap = a.snapshots.find(s => s.id === snap.id);
        if (localSnap) {
          Object.assign(localSnap, {
            published: true,
            marketplaceId: listing.id,
            publishedVersion: listing.version,
            marketplaceCategory: listing.category,
          ...(listing.segment ? { marketplaceSegment: listing.segment } : {}),
            marketplaceSummary: listing.summary,
            marketplaceDescription: listing.description,
            marketplaceTags: listing.tags
          });
        }
        logTo(a, who, updated ? 'Setup updated on marketplace' : 'Setup published to marketplace', listing.title, `v${listing.version}`);
      });
      return { listingId: listing.id, updated };
    }
    if (op === 'marketplace-unpublish') {
      const removed = await changeMarketplace(doc => unpublishFromMarketplace(doc, { agencyId: who.agencyId, listingId: input.id }));
      await changeAgency(who.agencyId, a => {
        for (const s of a.snapshots) {
          if (s.marketplaceId === removed.id) {
            s.published = false;
            s.marketplaceId = '';
          }
        }
        logTo(a, who, 'Setup unpublished from marketplace', removed.title);
      });
      return removed.id;
    }
    if (op === 'setup-templates') return templateGallery(await loadMarketplace());
    if (op === 'marketplace-install') {
      const listing = findMarketplaceSetup(await loadMarketplace(), input.id);
      if (!listing) throw error('Setup não encontrado no marketplace.',404);
      const copy = await changeAgency(who.agencyId, a => {
        if (a.snapshots.length >= 50) throw error('Você atingiu o limite de 50 setups salvos na agência.',400);
        const snap = {
          id: uid(),
          name: listing.title,
          kind: 'marketplace',
          workspace: '',
          include: Object.keys(listing.assets || {}),
          assets: structuredClone(listing.assets || {}),
          studioSites: structuredClone(listing.studioSites || {}),
          counts: structuredClone(listing.counts || {}),
          version: listing.version || 1,
          created: stamp(),
          updated: stamp(),
          shareCode: '',
          shared: false,
          marketplaceId: listing.id,
          marketplaceAuthor: listing.author,
          marketplaceCategory: listing.category,
          official: Boolean(listing.official)
        };
        a.snapshots.push(snap);
        logTo(a, who, 'Setup installed from marketplace', listing.title, listing.author);
        return { snapshotId: snap.id, name: snap.name };
      });
      await changeMarketplace(doc => recordMarketplaceInstall(doc, listing.id));
      return copy;
    }
    if (op === 'prospect-convert') {
      const prospect = (await loadAgency(who.agencyId)).prospects.find(r => r.id === input.id);
      if (!prospect) throw error('Prospect not found.',404);
      if (prospect.workspace) throw error('This prospect already has a sub-account.',400);
      const newId = await createAccount(who, { name: prospect.name, email: prospect.email, phone: prospect.phone, address: prospect.city, snapshotId: input.snapshotId || '' });
      await changeAgency(who.agencyId, a => { const row = a.prospects.find(r => r.id === input.id); if (row) Object.assign(row, { workspace: newId, status: 'Won' }); });
      return newId;
    }
    throw error('Unknown agency request.',404);
  }
  function change(id,command,who) {
    const scope = requestScope.getStore();
    const affiliate = !who && scope?.public ? scope.refs[id] || null : null;
    // Visitor actions on landing pages and the public store/chat/webinar/offer APIs carry the visit's source.
    const attribution = !who && scope?.attribute ? scope.touches[id] || {} : null;
    return store.change(id, state => {
      if (who) requireRecordEffects(who, state, command);
      const result = execute(state, command, { workspace: id, affiliate, attribution });
      return { id:result, state };
    });
  }
  // ---- Social Planner: OAuth secrets, scheduler and media ------------------------------------
  const socialRow = async rowId => {
    try { return await store.load(rowId); }
    // Supabase derives a NOT NULL name column from profile.name, so secret rows carry one too.
    catch { await store.insert(rowId, { profile:{ name:'Social Planner' }, tokens:{}, pending:{}, states:{} }); return store.load(rowId); }
  };
  const socialSecrets = async (workspace, mutate) => { await socialRow(`social-${workspace}`); return store.change(`social-${workspace}`, mutate); };
  const publicBase = req => process.env.SOCIAL_PUBLIC_URL || `${req.headers['x-forwarded-proto'] || 'http'}://${req.headers['x-forwarded-host'] || req.headers.host}`;
  // Documentos e contratos: signing links by e-mail/WhatsApp, and a per-IP limit on the public signing API.
  // Serviços de e-mail: the sub-account's verified sending domain, or '' to send from the platform address.
  // O domínio próprio da subconta; sem ele, o domínio dedicado da agência quando ela escolheu esta subconta.
  const sendingAddress = async workspace => {
    try { const own = workspaceSender(await store.load(`email-${workspace}`)); if (own) return own; } catch { /* sem domínio próprio */ }
    try { return agencySender((await loadAgency((await store.load(workspace)).agencyId || AGENCY_ID)).emailServices, workspace); } catch { return ''; }
  };
  const signHits = new Map(), testHits = new Map(), trackingHits = new Map();
  const trackingLog = createTrackingLog({ store });
  // Tracking events: up to 300 per connection every 10 minutes.
  const allowTracking = ip => {
    const at = Date.now(), hit = trackingHits.get(ip);
    if (!hit || hit.reset < at) { if (trackingHits.size > 5000) trackingHits.clear(); trackingHits.set(ip, { count: 1, reset: at + 600000 }); return true; }
    return ++hit.count <= 300;
  };
  // The sub-account's pixels (GA4, Tag Manager, Meta) on a public page: the loader tag and a CSP that allows them.
  const withPixels = (state, workspace, headers, body) => {
    if (!hasPixels(state?.tracking) || typeof body !== 'string') return [headers, body];
    return [{ ...headers, 'Content-Security-Policy': widenCsp(headers['Content-Security-Policy']) }, injectPixels(body, workspace)];
  };
  // Sends the visitor to a destination: a plain redirect, or a short page when the whole window must change (inside a
  // frame) or when the pixel needs a moment before an external address.
  const leave = (res, state, workspace, target, { embed = false, event = '' } = {}) => {
    const pixel = target.external && event;
    if (!embed && !pixel) { res.writeHead(303, { Location: target.href }); return res.end(); }
    const [headers, body] = withPixels(pixel ? state : null, workspace, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'Referrer-Policy': 'same-origin', 'Content-Security-Policy': leaveCsp(embed ? '*' : "'none'") },
      leavePage({ href: target.href, event: pixel ? event : '', wait: pixel ? 900 : 0 }));
    res.writeHead(200, headers);
    return res.end(body);
  };
  const allowSign = ip => {
    const at = Date.now(), hit = signHits.get(ip);
    if (!hit || hit.reset < at) { if (signHits.size > 5000) signHits.clear(); signHits.set(ip, { count: 1, reset: at + 600000 }); return true; }
    return ++hit.count <= 120;
  };
  // Compras públicas (checkout da loja, link de pagamento) e o cálculo do carrinho, por conexão a cada 10 minutos. Cada
  // compra prende estoque, gasta cupom, cria contato e fatura e abre cobrança; o cálculo diz se um cupom existe.
  // Contadores próprios: os do carrinho (allowSign) não somam aqui.
  const windowLimit = max => {
    const hits = new Map();
    return ip => {
      const at = Date.now(), hit = hits.get(ip);
      if (!hit || hit.reset < at) { if (hits.size > 5000) hits.clear(); hits.set(ip, { count: 1, reset: at + 600000 }); return true; }
      return ++hit.count <= max;
    };
  };
  const allowPurchase = windowLimit(20), allowQuote = windowLimit(30);
  const callbackPath = provider => `/api/social/callback/${provider === 'instagram' ? 'facebook' : provider}`;
  const validateInvite = (row, key) => {
    const invite = row.invite;
    if (!key || invite?.hash !== key || invite.expires <= Date.now()) throw error('Este convite expirou ou foi revogado.',404);
    return invite;
  };
  const validateApproval = (row, key) => {
    const link = row.approval;
    if (!key || link?.hash !== key || link.expires <= Date.now()) throw error('Este link de aprovação expirou ou foi revogado.',404);
    return link;
  };
  // What the client sees on the approval page: posts waiting for review, with media inlined so Mídia
  // Drive images (private until published) can be shown without opening the file route.
  const approvalView = state => {
    const zone = state.profile?.timezone || 'America/Sao_Paulo';
    const posts = state.socialPosts.filter(post => post.status === 'in_review')
      .sort((a, b) => (a.scheduleDate || a.created || '').localeCompare(b.scheduleDate || b.created || '')).slice(0, 40)
      .map(post => ({ id: post.id, type: post.type, summary: post.summary, link: post.link || '', firstComment: post.firstComment || '', scheduleDate: post.scheduleDate || '',
        overrides: Object.entries(post.overrides || {}).map(([provider, text]) => ({ network: network(provider)?.name || provider, text })),
        accounts: post.accountIds.map(accountId => state.socialAccounts.find(a => a.id === accountId)).filter(Boolean)
          .map(a => ({ name: a.name, provider: a.provider, network: network(a.provider)?.name || a.provider })),
        media: (post.media || []).slice(0, 6).map(m => ({ type: m.type || 'image',
          src: m.fileId ? state.files.find(f => f.id === m.fileId)?.data || '' : m.url })).filter(m => m.src) }));
    const reviewed = state.socialPosts.filter(post => /\(cliente\)$/.test(post.reviewedBy || '') && Date.parse(post.updated || 0) > Date.now() - 14 * 86_400_000)
      .map(post => ({ id: post.id, summary: String(post.summary || '').slice(0, 140), approval: post.approval, by: post.reviewedBy.replace(/ \(cliente\)$/, ''), note: post.reviewNote || '', at: post.updated }))
      .sort((a, b) => b.at.localeCompare(a.at)).slice(0, 20);
    return { brand: state.profile?.name || '', zone, posts, reviewed };
  };
  const socialActor = who => who.session?.id || who.userId || 'local-owner';
  async function startSocialOAuth(req, workspace, provider, inviteKey = '', actor = null) {
    const nonce = uid();
    const target = authUrl(provider, { redirectUri: publicBase(req) + callbackPath(provider), state: nonce });
    await socialRow('social-oauth');
    await store.change('social-oauth', row => {
      for (const [k, v] of Object.entries(row.states)) if (Date.parse(v.at) < Date.now() - 15 * 60_000) delete row.states[k];
      row.states[nonce] = { workspace, provider, at: stamp(), inviteKey, actor };
    });
    return target;
  }
  async function inviteAttach(workspace, key, chosen) {
    validateInvite(await store.load(`social-${workspace}`), key);
    await publicAccountPolicy(workspace, true, 'marketing');
    const ids = await store.change(workspace, s => {
      const fresh = chosen.filter(x => !s.socialAccounts.some(a => a.provider === x.provider && a.externalId === x.externalId));
      if (fresh.length !== chosen.length) throw error('Uma das contas já está conectada. Selecione somente novas contas.',409);
      return attachAccounts(s, fresh, { uid, now: stamp });
    });
    await socialSecrets(workspace, row => ids.forEach((id, n) => { row.tokens[id] = seal(chosen[n].secret); }));
    if (chosen.some(row => ['facebook', 'instagram'].includes(row.provider))) await routeMetaAccounts(workspace).catch(problem => console.error(`Meta routes (${workspace}): ${problem.message}`));
    return { connected: ids.length };
  }
  const fileBytes = data => { const [, mime, b64] = String(data).match(/^data:([^;]+);base64,(.*)$/) || []; return { mime, bytes: Buffer.from(b64 || '', 'base64') }; };
  const socialMedia = (state, workspace, base, post) => (post.media || []).map(m => {
    if (m.fileId) {
      const file = state.files.find(f => f.id === m.fileId);
      if (!file) throw error('Uma imagem do post foi removida do Mídia Drive.',400);
      const { mime, bytes } = fileBytes(file.data);
      return { ...m, mime, url: `${base}/m/${workspace}/${m.fileId}`, bytes: async () => bytes };
    }
    return { ...m, bytes: async () => { const r = await fetch(m.url, { signal: AbortSignal.timeout(120_000) }); if (!r.ok) throw error(`Não foi possível baixar a mídia (${r.status}).`,502); return Buffer.from(await r.arrayBuffer()); } };
  });
  async function checkFeeds(workspace, agencyId, at) {
    const state = await store.load(workspace);
    const stale = state.socialFeeds.filter(f => f.active && Date.parse(f.lastChecked || 0) < at - 30 * 60_000);
    for (const feed of stale) {
      if (!await accountIsActive(agencyId, workspace, 'marketing')) return;
      let items = [], problem = '';
      try {
        const r = await fetch(feed.url, { signal: AbortSignal.timeout(20_000), headers: { Accept: 'application/rss+xml, application/atom+xml, text/xml' } });
        if (!r.ok) throw Error(`HTTP ${r.status}`);
        items = parseFeed((await r.text()).slice(0, 2_000_000));
      } catch (e) { problem = `Não foi possível ler o feed: ${e.message}`.slice(0, 200); }
      if (!await accountIsActive(agencyId, workspace, 'marketing')) return;
      await store.change(workspace, s => {
        const row = s.socialFeeds.find(f => f.id === feed.id); if (!row) return;
        row.lastChecked = new Date(at).toISOString(); row.error = problem; if (problem) return;
        const made = feedPosts(s, row, items, { at, uid, now: stamp });
        if (made.length) row.lastItemAt = stamp();
      });
    }
  }
  async function runSocial(workspace, base, at = Date.now()) {
    let state = await store.load(workspace);
    if (!state.socialFeeds?.length && !state.socialAccounts?.length) return 0;
    const agencyId = state.agencyId || AGENCY_ID;
    if (!await accountIsActive(agencyId, workspace, 'marketing')) return 0;
    if (state.socialFeeds?.length) {
      await checkFeeds(workspace, agencyId, at).catch(e => console.error(e.message));
      if (!await accountIsActive(agencyId, workspace, 'marketing')) return 0;
    }
    if (!state.socialAccounts?.length) return 0;
    // Pages and Instagram accounts connected before Messenger/Direct existed get their webhook route here, once.
    const metaAccounts = state.socialAccounts.filter(row => ['facebook', 'instagram'].includes(row.provider));
    if (metaAccounts.length && !privateSpace.test(workspace)) {
      const routes = (await metaRoutesRow().catch(() => null))?.routes || {};
      if (metaAccounts.some(row => !routes[row.externalId])) await routeMetaAccounts(workspace).catch(problem => console.error(`Meta routes (${workspace}): ${problem.message}`));
    }
    const due = await store.change(workspace, s => {
      for (const copy of evergreenDue(s, new Date(at), s.profile.timezone)) s.socialPosts.push({ ...copy, id: uid(), created: stamp() });
      return claimDue(s, at);
    });
    if (!due.length) return 0;
    state = await store.load(workspace);
    const secrets = await socialRow(`social-${workspace}`);
    const refreshed = {}, broken = {};
    let completed = 0;
    for (const post of due) {
      if (!await accountIsActive(agencyId, workspace, 'marketing')) {
        const pending = new Map(due.slice(completed).map(row => [row.id, row.claimedAt]));
        await store.change(workspace, current => {
          for (const row of current.socialPosts) {
            if (row.status === 'in_progress' && pending.get(row.id) === row.claimedAt && pending.has(row.id)) {
              row.status = 'scheduled';
              delete row.claimedAt;
            }
          }
        });
        break;
      }
      const results = [];
      let media = [];
      try { media = socialMedia(state, workspace, base, post); }
      catch (e) { results.push(...post.accountIds.map(accountId => ({ accountId, ok: false, error: e.message }))); }
      if (!results.length) for (const [index, accountId] of post.accountIds.entries()) {
        if (index && !await accountIsActive(agencyId, workspace, 'marketing')) {
          results.push(...post.accountIds.slice(index).map(id => ({ accountId: id, ok: false, error: 'Subconta suspensa durante a publicação.' })));
          break;
        }
        const account = state.socialAccounts.find(a => a.id === accountId);
        if (!account) { results.push({ accountId, ok: false, error: 'Conta desconectada.' }); continue; }
        try {
          const secret = refreshed[accountId] || unseal(secrets.tokens[accountId]);
          const { secret: next, ...outcome } = await socialPublish(account, secret, post, media);
          refreshed[accountId] = next; results.push({ accountId, ...outcome });
        } catch (e) {
          if (e.status === 401) broken[accountId] = e.message;
          results.push({ accountId, ok: false, error: `${network(account.provider)?.name}: ${e.message}`.slice(0, 500) });
        }
      }
      const publishedOk = results.filter(r => r.ok);
      const publishedFail = results.filter(r => !r.ok);
      const queued = await store.change(workspace, s => {
        const outcome = settle(s, post.id, results, { uid, now: stamp });
        for (const [accountId, message] of Object.entries(broken)) { const a = s.socialAccounts.find(x => x.id === accountId); if (a) Object.assign(a, { status: 'expired', error: message }); }
        // "Post social publicado" workflows run here, outside a member's command.
        if (outcome && s.workflows?.some(w => w.active)) emitWorkflow(s, 'social_post_published', outcome);
        return s.workflowOutbox?.length || 0;
      });
      if (queued) flushLater(workspace);
      completed++;
      const activeWebhooks = (state.socialWebhooks || []).filter(w => w.active);
      if (activeWebhooks.length) {
        for (const wh of activeWebhooks) {
          if (publishedOk.length && wh.events?.includes('post.published')) {
            deliverWebhook({ url: wh.url, method: 'POST', body: { event: 'post.published', workspace, postId: post.id, postType: post.type, summary: post.summary, results: publishedOk, timestamp: stamp } }).catch(() => null);
          }
          if (publishedFail.length && wh.events?.includes('post.failed')) {
            deliverWebhook({ url: wh.url, method: 'POST', body: { event: 'post.failed', workspace, postId: post.id, summary: post.summary, results: publishedFail, timestamp: stamp } }).catch(() => null);
          }
          if (Object.keys(broken).length && wh.events?.includes('account.disconnected')) {
            deliverWebhook({ url: wh.url, method: 'POST', body: { event: 'account.disconnected', workspace, brokenAccounts: broken, timestamp: stamp } }).catch(() => null);
          }
        }
      }
    }
    if (Object.keys(refreshed).length) await socialSecrets(workspace, row => { for (const [k, v] of Object.entries(refreshed)) if (v) row.tokens[k] = seal(v); });
    return completed;
  }
  // Webinar reminders that fell due are written to Conversas; WhatsApp ones are also sent when the sub-account has WhatsApp connected.
  async function runWebinarReminders(workspace, base, at = Date.now()) {
    const state = await store.load(workspace);
    if (!state.webinarRegistrations?.length) return 0;
    const result = await change(workspace,{ type:'webinar-reminders', data:{ base, workspace, at:new Date(at).toISOString() } });
    const sent = Array.isArray(result.id) ? result.id : [];
    if (!privateSpace.test(workspace)) for (const item of sent.filter(row => row.channel === 'WhatsApp' && row.phone)) {
      await whatsapp.sendWorkspaceText(state.agencyId || AGENCY_ID, workspace, item.phone, item.body, (agencyId, id) => accountIsActive(agencyId, id, 'conversations')).catch(() => null);
    }
    return sent.length;
  }
  // Community events: one day before each date, attendees get an e-mail reminder in Conversas.
  async function runEventReminders(workspace, base, at = Date.now()) {
    const state = await store.load(workspace);
    if (!state.communityEvents?.length) return 0;
    const due = await community.dueReminders(workspace, state, at);
    if (!due.length) return 0;
    const members = new Map(((await clientPortal.directory(workspace)).members || []).map(row => [row.id, row]));
    const items = due.map(row => { const member = members.get(row.memberId);
      return member && { eventId: row.eventId, start: row.start, email: member.email, name: member.name, contactId: member.contactId || '', link: `${base}/portal/${workspace}` }; }).filter(Boolean);
    if (!items.length) return 0;
    const result = await change(workspace, { type: 'community-event-reminders', data: { items } });
    return Number(result.id) || 0;
  }
  // Community newsletters: at the chosen hour, the best posts go by e-mail to every member with access.
  async function runNewsletters(workspace, base, at = Date.now()) {
    const state = await store.load(workspace);
    if (!state.communities?.some(group => group.newsletter?.enabled)) return 0;
    const due = await community.dueNewsletters(workspace, state, at);
    if (!due.length) return 0;
    const members = new Map(((await clientPortal.directory(workspace)).members || []).map(row => [row.id, row]));
    const items = due.flatMap(digest => digest.memberIds.map(id => members.get(id)).filter(member => member?.email && !member.revokedAt).map(member => ({
      email: member.email, name: member.name, contactId: member.contactId || '', subject: `Novidades da comunidade ${digest.groupName}`,
      body: [`Oi${member.name ? `, ${member.name.split(' ')[0]}` : ''}! Veja o que movimentou a comunidade ${digest.groupName}:`, '',
        ...digest.posts.map(post => `• ${post.title} (${post.likes} curtidas, ${post.comments} comentários)`), '', `Entre para participar: ${base}/portal/${workspace}`].join('\n') })));
    if (!items.length) return 0;
    const result = await change(workspace, { type: 'community-newsletter', data: { items } });
    return Number(result.id) || 0;
  }
  async function videoBytes(workspace, row) {
    const parts = [];
    for (let index = 0; index < row.chunks; index++) {
      const chunk = await Promise.resolve().then(() => store.load(mediaRowId(workspace, row.id, index))).catch(() => null);
      if (!chunk?.data) throw error('Vídeo indisponível.', 404);
      parts.push(Buffer.from(chunk.data, 'base64'));
    }
    return Buffer.concat(parts);
  }
  const clearVideoChunks = async (workspace, row) => {
    for (let index = 0; index < row.chunks; index++) await Promise.resolve().then(() => store.change(mediaRowId(workspace, row.id, index), chunk => { chunk.data = ''; chunk.deleted = true; })).catch(() => {});
  };
  // A video kept in R2 is served by the bucket itself, through a short-lived signed link.
  const redirectToR2 = (res, key, options) => {
    if (!r2) throw error('Arquivo indisponível.', 404);
    res.writeHead(302, { Location: r2.downloadUrl(key, options), 'Cache-Control': 'private, max-age=300', 'Referrer-Policy': 'no-referrer' });
    return res.end();
  };
  // Testimonials arrive in chunks (each one a database row); once complete they move to R2 in one object.
  async function moveVideoToR2(workspace, row) {
    if (!r2 || !row?.chunks) return;
    try {
      const r2Key = `ws/${workspace}/videos/${row.id}`;
      await r2.put(r2Key, await videoBytes(workspace, row), row.mime);
      await change(workspace, { type: 'video-stored', data: { id: row.id, r2Key } });
      await clearVideoChunks(workspace, row);
    } catch (problem) { console.error(`R2 video move (${workspace}): ${problem.message}`); }
  }
  async function sendVideo(req, res, method, workspace, row, cache) {
    if (row.r2Key) return redirectToR2(res, row.r2Key, { type: row.mime });
    const bytes = await videoBytes(workspace, row);
    const range = /^bytes=(\d*)-(\d*)$/.exec(String(req.headers.range || ''));
    const headers = { 'Content-Type': row.mime, 'Accept-Ranges': 'bytes', 'Cache-Control': cache, 'X-Content-Type-Options': 'nosniff', 'Cross-Origin-Resource-Policy': 'cross-origin' };
    if (range && (range[1] || range[2])) {
      const start = range[1] ? Number(range[1]) : Math.max(0, bytes.length - Number(range[2]));
      const end = range[1] && range[2] ? Math.min(Number(range[2]), bytes.length - 1) : bytes.length - 1;
      if (start >= bytes.length || start > end) { res.writeHead(416, { 'Content-Range': `bytes */${bytes.length}` }); return res.end(); }
      res.writeHead(206, { ...headers, 'Content-Range': `bytes ${start}-${end}/${bytes.length}`, 'Content-Length': end - start + 1 });
      return res.end(method === 'HEAD' ? undefined : bytes.subarray(start, end + 1));
    }
    res.writeHead(200, { ...headers, 'Content-Length': bytes.length });
    return res.end(method === 'HEAD' ? undefined : bytes);
  }
  // AI steps run in the background with the OpenAI key of whoever saved the workflow, and only while that
  // person still belongs to the agency that owns the sub-account (or it is their own personal account).
  // Sem a chave, as etapas só de texto (`scope.allowPlatform`) usam a IA gratuita do graao quando o dono a liberou.
  async function workflowConnection(workspace, state, workflowId, scope = {}) {
    if (localAccess && workflowAI) return { model: agentModel };
    return keyConnection(workspace, state, state.workflows.find(row => row.id === workflowId)?.aiKey, 'salve o fluxo de novo para usar as ações de IA', 'quem salvou o fluxo não tem mais acesso a esta subconta; salve o fluxo de novo', 'conecte a OpenAI de quem salvou o fluxo (Visão da agência → Configurações → OpenAI)', { org: workspace, feature: 'workflow.ai', ...scope });
  }
  async function keyConnection(workspace, state, key, missing, revoked, disconnected, scope = { org: workspace }) {
    if (!key?.session) throw error(missing, 409);
    const agencyId = state.agencyId || AGENCY_ID;
    let allowed = false;
    if (privateSpace.test(workspace)) allowed = workspace === personalId({ id: key.session });
    else if (key.agency === agencyId) {
      if (key.user) allowed = Boolean((await loadAgency(agencyId).catch(() => null))?.users.some(user => user.id === key.user && user.loginEnabled));
      else allowed = agencyId === `agency-${key.session}` || (agencyId === AGENCY_ID && key.session === agencyOwnerId);
    }
    if (!allowed) throw error(revoked, 403);
    const connection = await openAI.optionalConnection({ id: key.session }, scope);
    if (!connection) throw error(disconnected, 409);
    return connection;
  }
  async function workflowAIStep(workspace, state, item) {
    // The bot switched on in a conversation has no run: its answer goes back by contact.
    const base = item.bot ? { runId: '', stepId: '', bot: true, contactId: item.contactId } : { runId: item.runId, stepId: item.stepId };
    try {
      // Gerar imagem e vídeo usam APIs da OpenAI fora do gateway: só com a chave. O resto é texto (ou visão),
      // e o gateway escolhe um modelo gratuito que atenda (ou recusa, como no agente com busca na web).
      const media = ['ai_image_generate', 'ai_video_generate'].includes(item.action);
      const agent = ['ai_agent', 'conversation_ai'].includes(item.action);
      const connection = await workflowConnection(workspace, state, item.workflowId, { feature: agent ? 'agent.reply' : 'workflow.ai', allowPlatform: !media });
      checkAiBudget(await store.load(workspace));
      const meter = usageMeter();
      try {
        if (item.action === 'ai_image_generate') {
          // "Gerar imagem com IA": the image becomes a public file; its link goes to the flow variable.
          const data = await (mediaAI?.image || generateImage)({ ...connection, onUsage: meter.onUsage }, item);
          const fileId = (await change(workspace, { type: 'ai-media-file', data: { name: `imagem-ia-${Date.now()}.webp`, data } })).id;
          await store.change(workspace, current => { meter.charge(current, 'workflow', ''); });
          return { ...base, vars: { [item.variable]: documentMail.linkOf({ path: `/m/${workspace}/${fileId}` }), [`${item.variable}_id`]: fileId } };
        }
        if (item.action === 'ai_video_generate') {
          // "Gerar vídeo com IA": the job runs for minutes; runWorkflows checks it every cycle (pollAiVideos).
          const jobId = await (mediaAI?.start || startVideo)({ ...connection, onUsage: meter.onUsage }, item);
          await change(workspace, { type: 'ai-video-job', data: { jobId, runId: item.runId, stepId: item.stepId, workflowId: item.workflowId, variable: item.variable, prompt: item.prompt } });
          await store.change(workspace, current => { meter.charge(current, 'workflow', ''); });
          return null;
        }
        if (item.action === 'ai_agent' || item.action === 'conversation_ai') {
          // "Rodar agente de IA" and the bot of Conversas: the published agent answers; the run shows in the agent's history.
          const request = agentWorkflowRequest(state, item.agentId, item.input);
          const reply = String(await generateAgentReply({ ...request, model: request.model || agentModel }, { ...connection, onUsage: meter.onUsage }) || '');
          await store.change(workspace, current => {
            meter.charge(current, 'workflow', '');
            recordAgentRun(current, { agent: item.agentId, version: 'published', input: item.input, output: reply, kind: 'workflow', model: request.model || agentModel, sources: [...new Set(request.retrieved.map(row => row.title))] });
          });
          return { ...base, vars: { [item.variable]: reply } };
        }
        const { vars } = await (workflowAI || runWorkflowAI)({ ...connection, onUsage: meter.onUsage }, item);
        await store.change(workspace, current => { meter.charge(current, 'workflow', ''); });
        return { ...base, vars };
      } catch (problem) {
        await store.change(workspace, current => { meter.charge(current, 'workflow', '', problem.message); });
        throw problem;
      }
    } catch (problem) {
      return { ...base, error: problem.status === 402 ? 'limite mensal de IA da subconta atingido' : problem.message };
    }
  }
  // Workflows: deliver what the engine queued (outbound webhooks, WhatsApp) and record the outcome on each run.
  async function flushWorkflows(workspace) {
    const state = await store.load(workspace);
    if (!state.workflowOutbox?.length) return 0;
    const items = (await change(workspace, { type: 'workflow-outbox-take' })).id || [];
    const results = [], aiResults = [];
    const fromAddress = items.some(item => ['document', 'document-owner', 'review-email', 'email'].includes(item.kind)) ? await sendingAddress(workspace) : '';
    const absolute = item => (item.path && !item.origin ? String(item.body || '').split(item.path).join(documentMail.linkOf(item)) : item.body);
    for (const item of items) {
      if (item.kind === 'webhook') results.push({ runId: item.runId, kind: 'webhook', text: await deliverWebhook(item) });
      if (item.kind === 'ai') { const answered = await workflowAIStep(workspace, state, item); if (answered) aiResults.push(answered); }
      if (item.kind === 'marketing-audit') auditLater(workspace, item);
      if (item.kind === 'ga4-event') results.push({ runId: item.runId, kind: 'ga4', text: await workflowGa4(workspace, item).catch(problem => `erro: ${problem.message}`) });
      if (item.kind === 'google-ads-conversion') results.push({ runId: item.runId, kind: 'google', text: await workflowGoogleAds(workspace, item).catch(problem => `erro: ${problem.message}`) });
      if (item.kind === 'meta-capi' || item.kind === 'meta-audience') results.push({ runId: item.runId, kind: 'meta', text: await workflowMeta(workspace, item).catch(problem => `erro: ${problem.message}`) });
      if (item.kind === 'copy-contact') results.push({ runId: item.runId, kind: 'copy', text: await workflowCopyContact(workspace, state, item).catch(problem => `erro: ${problem.message}`) });
      if (item.kind === 'custom-webhook') aiResults.push({ runId: item.runId, stepId: item.stepId, ...(await deliverCustomWebhook(item).catch(() => ({ error: 'falha de conexão' }))) });
      if (item.kind === 'connector') {
        const row = state.connectors?.[item.connector];
        const answered = !row ? { error: 'conector desconectado' } : await runConnectorAction(item.connector, item.action, connectorAuth(row), item.input || {}, { request: connectorRequest }).then(vars => ({ vars }), problem => ({ error: problem.message }));
        aiResults.push({ runId: item.runId, stepId: item.stepId, ...answered });
      }
      if (item.kind === 'push') {
        const devices = pushTargets(state, { target: item.target, contactId: item.contactId, messagesOnly: item.messagesOnly });
        const sent = await Promise.all(devices.map(device => sendPush(device, { title: item.title, body: item.body, url: item.url, tag: item.tag }, { env: pushEnv, request: pushRequest }).catch(() => ({ ok: false }))));
        const gone = devices.filter((device, index) => sent[index].gone).map(device => device.endpoint);
        if (gone.length) await change(workspace, { type: 'push-gone', data: { endpoints: gone } });
        if (item.runId) results.push({ runId: item.runId, kind: 'push', text: devices.length ? `enviada para ${sent.filter(row => row.ok).length} de ${devices.length} aparelho(s)` : 'nenhum aparelho com notificações ativadas' });
      }
      if (item.kind === 'phone-call' || item.kind === 'voicemail-drop' || item.kind === 'voice-ai-call') {
        const text = !phoneOrigin() ? 'erro: defina PHONE_PUBLIC_ORIGIN para a Twilio chamar o Graao'
          : await phone.workflowItem(workspace, item, phoneOrigin()).catch(problem => `erro: ${problem.message}`);
        results.push({ runId: item.runId, kind: 'phone', text });
      }
      if (item.kind === 'phone-lookup') {
        const found = await phone.workflowItem(workspace, item, phoneOrigin()).catch(problem => ({ error: problem.message }));
        aiResults.push({ runId: item.runId, stepId: item.stepId, ...found });
      }
      if (item.kind === 'email-verify') {
        const checked = await checkEmailAddress(item.email, emailResolver).catch(() => ({ status: 'unknown', reason: 'não foi possível consultar o domínio agora' }));
        aiResults.push({ runId: item.runId, stepId: item.stepId, vars: { email_status: checked.status, email_motivo: checked.reason } });
      }
      if (item.kind === 'access') results.push({ runId: item.runId, kind: 'access', text: await workflowAccess(workspace, item).catch(problem => `erro: ${problem.message}`) });
      if (item.kind === 'review-email') {
        const outcome = await documentMail.email(item.email, { subject: item.subject, text: absolute(item) }, `review-${workspace}-${item.requestId}`,
          { fromName: state.profile?.name || '', fromAddress }).catch(problem => problem.message);
        results.push({ runId: item.runId, kind: 'email', text: typeof outcome === 'string' ? outcome : 'pedido de avaliação enviado' });
      }
      if (item.kind === 'document' || item.kind === 'document-owner') {
        const message = documentMessage(item, documentMail.linkOf(item)), outcomes = [];
        if (item.kind === 'document-owner' || item.channels?.includes('email')) {
          outcomes.push(await documentMail.email(item.email, message, `doc-${workspace}-${item.docId || item.estimateId || item.invoiceId || item.checkoutId || item.giftCardId}-${item.recipientId || 'owner'}-${item.event || (item.final ? 'final' : 'request')}-${String(item.path || '').slice(-12)}`, { fromName: item.fromName || (fromAddress ? state.profile?.name || '' : ''), replyTo: item.replyTo, fromAddress }));
        }
        if (item.kind === 'document' && item.channels?.includes('whatsapp')) {
          if (!item.phone) outcomes.push('WhatsApp: contato sem telefone');
          else if (privateSpace.test(workspace)) outcomes.push('WhatsApp não enviado (conta pessoal)');
          else {
            const sent = await whatsapp.sendWorkspaceText(state.agencyId || AGENCY_ID, workspace, item.phone, message.text, (agencyId, id) => accountIsActive(agencyId, id, 'conversations')).catch(() => null);
            outcomes.push(sent?.sent ? 'WhatsApp enviado' : sent?.reason === 'not-connected' ? 'WhatsApp não conectado' : 'WhatsApp não enviado');
          }
        }
        results.push({ docId: item.docId, estimateId: item.estimateId, invoiceId: item.invoiceId, checkoutId: item.checkoutId, giftCardId: item.giftCardId, kind: 'document', text: `${item.kind === 'document-owner' ? 'Aviso ao remetente' : item.name}${item.final ? ' (cópia final)' : ''}: ${outcomes.join(' · ')}` });
      }
      if (item.kind === 'whatsapp') {
        if (privateSpace.test(workspace)) { results.push({ runId: item.runId, kind: 'whatsapp', text: 'não enviado (conta pessoal)' }); continue; }
        const sent = await whatsapp.sendWorkspaceText(state.agencyId || AGENCY_ID, workspace, item.phone, absolute(item), (agencyId, id) => accountIsActive(agencyId, id, 'conversations')).catch(() => null);
        results.push({ runId: item.runId, kind: 'whatsapp', text: sent?.sent ? 'enviado' : sent?.reason === 'not-connected' ? 'WhatsApp não conectado' : 'não enviado',
          ...(sent?.sent ? {} : { failed: deliveryFailure(sent?.reason), messageId: item.messageId || '' }) });
      }
      if (item.kind === 'whatsapp-media') {
        if (privateSpace.test(workspace)) { results.push({ runId: item.runId, kind: 'whatsapp', text: 'não enviado (conta pessoal)' }); continue; }
        // The provider downloads the file: only public https addresses (never the internal network of its server).
        const target = await publicTarget(item.media?.url || '');
        if (typeof target === 'string') { results.push({ runId: item.runId, kind: 'whatsapp', text: `arquivo não enviado: ${target}`, failed: 'provider_error', messageId: item.messageId || '' }); continue; }
        const sent = await whatsapp.sendWorkspaceMedia(state.agencyId || AGENCY_ID, workspace, item.phone, item.media, (agencyId, id) => accountIsActive(agencyId, id, 'conversations')).catch(() => null);
        results.push({ runId: item.runId, kind: 'whatsapp', text: sent?.sent ? 'arquivo enviado' : sent?.reason === 'not-connected' ? 'WhatsApp não conectado' : sent?.reason === 'unsupported' ? 'o provedor de WhatsApp não envia arquivos' : 'arquivo não enviado',
          ...(sent?.sent ? {} : { failed: deliveryFailure(sent?.reason), messageId: item.messageId || '' }) });
      }
      if (item.kind === 'whatsapp-typing') {
        if (privateSpace.test(workspace)) { results.push({ runId: item.runId, kind: 'whatsapp', text: '"digitando" não mostrado (conta pessoal)' }); continue; }
        const shown = await whatsapp.sendWorkspacePresence(state.agencyId || AGENCY_ID, workspace, item.phone, item.seconds, (agencyId, id) => accountIsActive(agencyId, id, 'conversations')).catch(() => null);
        results.push({ runId: item.runId, kind: 'whatsapp', text: shown?.sent ? `"digitando…" por ${shown.seconds} s` : shown?.reason === 'not-connected' ? 'WhatsApp não conectado' : shown?.reason === 'unsupported' ? 'o provedor de WhatsApp não mostra "digitando"' : '"digitando" não mostrado' });
      }
      if (item.kind === 'email') {
        if (privateSpace.test(workspace)) { results.push({ runId: item.runId, kind: 'email', text: 'não enviado (conta pessoal)' }); continue; }
        const outcome = await documentMail.email(item.to, { subject: item.subject, text: absolute(item) }, `wf-email-${workspace}-${item.messageId}`,
          { fromName: state.profile?.name || '', fromAddress, replyTo: inboundAddress(workspace) }).catch(problem => problem.message);
        const ok = mailSent(outcome);
        results.push({ runId: item.runId, kind: 'email', text: ok ? 'enviado' : `não enviado: ${outcome}`,
          ...(ok ? {} : { failed: /não configurado/.test(outcome) ? 'not_connected' : 'provider_error', messageId: item.messageId || '' }) });
      }
      if (item.kind === 'whatsapp-interactive') {
        if (privateSpace.test(workspace)) { results.push({ runId: item.runId, kind: 'whatsapp', text: 'não enviada (conta pessoal)' }); continue; }
        const sent = await whatsapp.sendWorkspaceInteractive(state.agencyId || AGENCY_ID, workspace, item.phone, item.interactive, (agencyId, id) => accountIsActive(agencyId, id, 'conversations')).catch(() => null);
        results.push({ runId: item.runId, kind: 'whatsapp', text: sent?.sent ? 'mensagem interativa enviada' : sent?.reason === 'not-connected' ? 'WhatsApp não conectado' : sent?.reason === 'unsupported' ? 'o provedor de WhatsApp não envia mensagens interativas' : 'mensagem interativa não enviada',
          ...(sent?.sent ? {} : { failed: sent?.reason === 'not-connected' ? 'not_connected' : sent?.reason === 'invalid-phone' ? 'invalid_phone' : sent?.reason === 'account-suspended' ? 'suspended' : 'provider_error', messageId: item.messageId || '' }) });
      }
      if (item.kind === 'meta-comment-reply') {
        const sent = await deliverMetaCommentReply(workspace, state, item).catch(() => ({ sent: false, reason: 'provider_error' }));
        const channel = item.network === 'facebook' ? 'Facebook' : 'Instagram';
        const why = { not_connected: 'conta não conectada no Social Planner', suspended: 'subconta suspensa' }[sent.reason] || 'erro da Meta';
        results.push({ runId: item.runId, kind: 'meta', text: sent.sent ? `Comentário do ${channel}: respondido` : `Comentário do ${channel}: não respondido (${why})`, ...(sent.sent ? {} : { failed: sent.reason, messageId: item.messageId || '' }) });
      }
      if (item.kind === 'meta-message') {
        const sent = await deliverMetaMessage(workspace, state, item).catch(() => ({ sent: false, reason: 'provider_error' }));
        const place = item.network === 'facebook' ? 'Messenger' : 'Direct';
        const why = { not_connected: 'conta não conectada no Social Planner', no_recipient: 'o contato ainda não escreveu nesse canal', window_closed: 'fora da janela de 24 horas', suspended: 'subconta suspensa' }[sent.reason] || 'erro da Meta';
        results.push({ runId: item.runId, kind: 'meta', text: sent.sent ? `${place}: enviada` : `${place}: não enviada (${why})`, ...(sent.sent ? {} : { failed: sent.reason, messageId: item.messageId || '' }) });
      }
    }
    if (results.length) {
      // A failed WhatsApp can start "Falha no envio de mensagem" workflows, which queue their own deliveries.
      const reported = await change(workspace, { type: 'workflow-outbox-result', data: { results } });
      if (results.some(item => item.failed) && reported.state.workflowOutbox?.length) flushLater(workspace);
    }
    if (aiResults.length) {
      // Resuming can queue the next AI step or webhook of the same run.
      const resumed = await change(workspace, { type: 'workflow-ai-result', data: { results: aiResults } });
      if (resumed.state.workflowOutbox?.length) flushLater(workspace);
    }
    return results.length + aiResults.length;
  }
  const flushLater = workspace => { inBackground(`Workflow delivery (${workspace})`, () => flushWorkflows(workspace)); };
  // "Gerar auditoria de marketing": the audit can take a minute (PageSpeed), so it runs apart from the delivery queue
  // and resumes the waiting run with the result. The audit fetches only public addresses (prospect-audit.mjs).
  const auditLater = (workspace, item) => {
    inBackground(`Marketing audit (${workspace})`, async () => {
      const audit = await prospectAudit({ website: item.website, name: item.business, city: item.city }).catch(() => null);
      const done = await change(workspace, { type: 'workflow-ai-result', data: { results: [{ runId: item.runId, stepId: item.stepId, ...marketingAuditVars(audit, item.variable) }] } });
      if (done.state.workflowOutbox?.length) flushLater(workspace);
    });
  };
  // "Gerar vídeo com IA": each running job is checked; a finished video is stored in chunks and resumes the run
  // with its public link, a failed one resumes it with the error (and a job older than 40 minutes gives up).
  async function pollAiVideos(workspace, state) {
    for (const job of state.aiVideoJobs || []) {
      const finish = async (data, result) => {
        await change(workspace, { type: 'ai-video-done', data: { jobId: job.jobId, ...data } });
        await change(workspace, { type: 'workflow-ai-result', data: { results: [{ runId: job.runId, stepId: job.stepId, ...result }] } });
      };
      try {
        const connection = await workflowConnection(workspace, state, job.workflowId);
        const status = await (mediaAI?.status || videoStatus)(connection, job.jobId);
        if (status.status === 'failed') { await finish({}, { error: status.error || 'a OpenAI não conseguiu gerar o vídeo' }); continue; }
        if (status.status !== 'completed') {
          if (Date.now() - Date.parse(job.started) > 40 * 60000) await finish({}, { error: 'o vídeo não ficou pronto em 40 minutos' });
          continue;
        }
        const bytes = await (mediaAI?.content || videoContent)(connection, job.jobId);
        if (!bytes?.length || bytes.length > 15 * 1024 * 1024) { await finish({}, { error: 'o vídeo gerado passou de 15 MB' }); continue; }
        const id = uid();
        if (r2) {
          const r2Key = `ws/${workspace}/videos/${id}`;
          await r2.put(r2Key, bytes, 'video/mp4');
          await finish({ id, r2Key, chunks: 0, bytes: bytes.length, prompt: job.prompt, workflowId: job.workflowId },
            { vars: { [job.variable]: documentMail.linkOf({ path: `/m/${workspace}/video/${id}` }), [`${job.variable}_id`]: id } });
          continue;
        }
        const chunks = Math.ceil(bytes.length / CHUNK_BYTES);
        for (let index = 0; index < chunks; index++) {
          const rowId = mediaRowId(workspace, id, index);
          await store.insert(rowId, { profile: { name: 'Vídeo gerado com IA' }, data: bytes.subarray(index * CHUNK_BYTES, (index + 1) * CHUNK_BYTES).toString('base64') });
        }
        await finish({ id, chunks, bytes: bytes.length, prompt: job.prompt, workflowId: job.workflowId },
          { vars: { [job.variable]: documentMail.linkOf({ path: `/m/${workspace}/video/${id}` }), [`${job.variable}_id`]: id } });
      } catch (problem) {
        if (problem.status === 403 || problem.status === 409 || problem.status === 422) await finish({}, { error: problem.message }).catch(() => {});
        else console.error(`AI video job (${workspace}): ${problem.message}`);
      }
    }
    flushLater(workspace);
  }
  // Every minute: wake waiting runs and fire scheduled triggers (birthdays, custom dates, scheduler, stale deals).
  // T.2: the credentials of a connected app (sealed in the sub-account).
  const connectorAuth = row => { try { return JSON.parse(unsealSecret(row.sealed) || '{}'); } catch { return {}; } };
  async function pollConnectors(workspace, state, at = Date.now()) {
    const byApp = new Map();
    for (const job of pollJobs(state)) byApp.set(job.id, [...(byApp.get(job.id) || []), job]);
    for (const [id, jobs] of byApp) {
      const row = state.connectors[id];
      if (row.polledAt && at - Date.parse(row.polledAt) < 5 * 60000) continue;
      const auth = connectorAuth(row), cursors = {};
      for (const job of jobs) {
        try {
          const found = await pollConnector(id, job.key, job.config, auth, row.cursors?.[job.scope], { request: connectorRequest, now: at });
          cursors[job.scope] = found.cursor;
          for (const event of found.events) await change(workspace, { type: 'connector-event', data: { connector: id, key: event.key, ctx: event.ctx } });
        } catch (e) { console.error(`Conector ${id} (${workspace}): ${e.message}`); }
      }
      await change(workspace, { type: 'connector-cursor', data: { id, cursors } });
    }
  }
  async function runWorkflows(workspace, at = Date.now()) {
    const state = await store.load(workspace);
    if (!state.workflows?.some(row => row.active) && !state.runs?.some(row => row.status === 'Waiting')) return null;
    if (!privateSpace.test(workspace) && !(await accountIsActive(state.agencyId || AGENCY_ID, workspace, 'automation').catch(() => false))) return null;
    if (state.aiVideoJobs?.length) await pollAiVideos(workspace, state).catch(e => console.error(`AI video (${workspace}): ${e.message}`));
    await pollConnectors(workspace, state, at).catch(e => console.error(`Conectores (${workspace}): ${e.message}`));
    const result = (await change(workspace, { type: 'workflow-tick', data: { at: new Date(at).toISOString() } })).id;
    await flushWorkflows(workspace);
    return result;
  }
  // Recurring invoices: every minute, issue what is due today and deliver the e-mails with the payment links.
  async function runRecurringInvoices(workspace, at = Date.now()) {
    const state = await store.load(workspace);
    const day = new Intl.DateTimeFormat('en-CA', { timeZone: state.profile?.timezone || 'UTC' }).format(new Date(at));
    if (!state.recurringInvoices?.some(row => row.status === 'active' && row.nextIssueOn && row.nextIssueOn <= day)) return [];
    if (!privateSpace.test(workspace) && !(await accountIsActive(state.agencyId || AGENCY_ID, workspace, 'payments').catch(() => false))) return [];
    const issued = (await change(workspace, { type: 'invoice-tick', data: { at: new Date(at).toISOString() } })).id || [];
    if (issued.length) await flushWorkflows(workspace);
    return issued;
  }
  // Abandoned checkouts: open carts idle for longer than the configured wait become abandoned (contact,
  // workflow trigger and recovery e-mail).
  // Pedidos pagos online que passaram do prazo sem pagamento são cancelados (store-model.mjs, expiredOrders).
  async function runExpiredOrders(workspace, at = Date.now()) {
    const state = await store.load(workspace);
    if (!expiredOrders(state, at).length) return 0;
    const count = (await change(workspace, { type: 'store-orders-expire', data: { at: new Date(at).toISOString() } })).id || 0;
    if (count) await flushWorkflows(workspace);
    return count;
  }
  async function runAbandonedCheckouts(workspace, at = Date.now()) {
    const state = await store.load(workspace);
    const limit = at - abandonedOf(state).afterMinutes * 60000;
    if (!state.abandonedCheckouts?.some(row => row.status === 'open' && Date.parse(row.updated) <= limit)) return 0;
    if (!privateSpace.test(workspace) && !(await accountIsActive(state.agencyId || AGENCY_ID, workspace, 'payments').catch(() => false))) return 0;
    const count = (await change(workspace, { type: 'checkout-tick', data: { at: new Date(at).toISOString() } })).id || 0;
    if (count) await flushWorkflows(workspace);
    return count;
  }
  // Scheduled report e-mails: each due report is sent once per slot; failures are kept on the
  // schedule (lastError) and the slot is not retried, so a broken address does not resend all day.
  async function runReportMail(workspace, at = new Date()) {
    const state = await store.load(workspace);
    if (!state.customReports?.some(report => report.schedule)) return 0;
    const due = reportsDue(state, at);
    if (!due.length) return 0;
    if (!privateSpace.test(workspace) && !(await accountIsActive(state.agencyId || AGENCY_ID, workspace, 'reporting').catch(() => false))) return 0;
    let sent = 0;
    const fromAddress = await sendingAddress(workspace);
    for (const { id: reportId, slot } of due) {
      const report = state.customReports.find(row => row.id === reportId);
      let problem = '';
      try { await reportMail.send(workspace, state, report, slot, { fromAddress }); sent++; } catch (e) { problem = e.message; }
      await change(workspace, { type: 'report-sent', id: reportId, data: { slot, error: problem } });
    }
    return sent;
  }
  // E-mail campaigns: start what is scheduled, pick the A/B winner when the test ends and send the queue
  // in batches of 100 (at most 2.000 a minute per sub-account). One run per sub-account at a time.
  const emailRuns = new Set();
  async function runEmailCampaigns(workspace, at = Date.now()) {
    const state = await store.load(workspace);
    if (!state.emailCampaigns?.some(row => ['scheduled', 'sending', 'testing'].includes(row.status)) && !state.emailSequences?.some(row => row.status === 'active' && row.enrolled?.some(item => item.status === 'active'))) return 0;
    if (!privateSpace.test(workspace) && !(await accountIsActive(state.agencyId || AGENCY_ID, workspace, 'marketing').catch(() => false))) return 0;
    if (emailRuns.has(workspace)) return 0;
    emailRuns.add(workspace);
    try {
      const queued = (await change(workspace, { type: 'email-tick', data: { at: new Date(at).toISOString() } })).id;
      if (!queued) return 0;
      const fromAddress = await sendingAddress(workspace);
      let sent = 0;
      for (let round = 0; round < 20; round++) {
        const batch = (await change(workspace, { type: 'email-take', data: { limit: 100 } })).id;
        if (!batch.items.length) break;
        const results = await campaignMail.sendBatch({ workspace, ...batch, fromAddress });
        if (!results) break;
        const done = await change(workspace, { type: 'email-result', data: { results } });
        sent += results.filter(row => row.ok).length;
        if (done.state.workflowOutbox?.length) flushLater(workspace);
      }
      return sent;
    } finally { emailRuns.delete(workspace); }
  }
  const emailLater = workspace => { inBackground(`E-mail campaigns (${workspace})`, () => runEmailCampaigns(workspace)); };
  // Mensagens do Planejador de eventos pelo WhatsApp. Esperam entre uma e outra, então correm ao lado do cron e não dentro dele.
  const eventSender = createEventSender({
    load: workspace => store.load(workspace), change,
    active: async (state, workspace) => !privateSpace.test(workspace) && Boolean(await accountIsActive(state.agencyId || AGENCY_ID, workspace, 'marketing').catch(() => false)),
    send: (workspace, message, state) => whatsapp.sendEventMessage(state.agencyId || AGENCY_ID, workspace, message, (agencyId, id) => accountIsActive(agencyId, id, 'conversations')),
    changed: (workspace, state) => { if (state?.workflowOutbox?.length) flushLater(workspace); },
    sleep: ms => new Promise(done => { setTimeout(done, ms).unref?.(); })
  });
  const eventSendsLater = workspace => { inBackground(`Event messages (${workspace})`, () => eventSender.run(workspace)); };
  async function runAllEventSends(at = Date.now()) {
    const due = [];
    await runInBatches((await store.list()).filter(w => spaceId.test(w.id)), async ({ id }) => {
      try { if (eventSendDue(await store.load(id), at)) due.push(id); } catch (e) { console.error(`Event messages (${id}): ${e.message}`); }
    }, { concurrency: 10, budgetMs: cronBudgetMs, start: Math.floor(at / 60_000) });
    await runInBatches(due, async id => { try { await eventSender.run(id); } catch (e) { console.error(`Event messages (${id}): ${e.message}`); } }, { concurrency: 25, budgetMs: cronBudgetMs, start: Math.floor(at / 60_000) });
  }
  // Vigia do WhatsApp (whatsapp-guard.mjs): recupera mensagens, conserta webhook, avisa queda e reenvia o que não saiu.
  async function whatsappIncident({ agencyId, workspaceId, kind, since, reason }) {
    const agency = await store.load(agencyId), state = await store.load(workspaceId);
    const people = (agency.users || []).filter(user => user.email && (String(user.role || '').startsWith('Agency') || user.accounts?.includes(workspaceId))).slice(0, 10);
    const name = state.profile?.name || workspaceId, when = new Date(since).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
    const why = { server: 'O servidor do WhatsApp não está respondendo.', missing: 'A conexão não existe mais no servidor. Leia o QR Code de novo em Configurações → WhatsApp.',
      disconnected: 'O número foi desconectado. Se ele não voltar sozinho, leia o QR Code de novo em Configurações → WhatsApp.' }[reason] || '';
    const subject = kind === 'down' ? `WhatsApp fora do ar: ${name}` : `WhatsApp voltou: ${name}`;
    const text = kind === 'down' ? `O WhatsApp de ${name} está fora do ar desde ${when}.\n\n${why}` : `O WhatsApp de ${name} voltou a funcionar. Tinha caído em ${when}.\n\nAs mensagens recebidas pelo servidor durante a queda estão sendo buscadas para Conversas.`;
    for (const user of people) await documentMail.email(user.email, { subject, text }, `wa-${kind}-${workspaceId}-${since}-${user.id}`).catch(() => null);
  }
  const whatsappGuard = createWhatsAppGuard({
    store, onStored: workspace => flushLater(workspace), onIncident: whatsappIncident,
    wa: { ...whatsapp.guardOps, guardTargets: (agencyId, ids) => whatsapp.guardOps.guardTargets(agencyId, ids, (agency, id) => accountIsActive(agency, id, 'conversations').catch(() => false)) }
  });
  async function runWhatsAppGuard(base, spaces, at = Date.now()) {
    const byAgency = new Map();
    await runInBatches(spaces.filter(w => !privateSpace.test(w.id)), async ({ id }) => {
      try {
        const agencyId = (await store.load(id)).agencyId || AGENCY_ID;
        byAgency.set(agencyId, [...(byAgency.get(agencyId) || []), id]);
      } catch (e) { console.error(`WhatsApp guard (${id}): ${e.message}`); }
    }, { concurrency: 10, budgetMs: cronBudgetMs, start: Math.floor(at / 60_000) });
    await runInBatches([...byAgency], async ([agencyId, ids]) => {
      try { await whatsappGuard.run(agencyId, ids, base); } catch (e) { console.error(`WhatsApp guard (${agencyId}): ${e.message}`); }
    }, { concurrency: 5, budgetMs: cronBudgetMs, start: Math.floor(at / 60_000) });
  }
  const accountPurge = createAccountPurge({ store, r2, whatsapp });
  // Lixeira de subcontas: passados TRASH_DAYS da exclusão, a subconta é apagada de vez com tudo o que era dela
  // (account-purge.mjs) e sai da agência. Se o R2 ou a Evolution falham, ela espera na lixeira e o servidor tenta de
  // novo a cada hora; depois de 7 dias de falha, apaga o que é do graao e anota no histórico o que ficou de fora.
  async function purgeTrash(agencyId, at = Date.now()) {
    const agency = await store.load(agencyId), done = [];
    for (const id of trashExpired(agency, at)) {
      const failed = agency.accounts[id]?.trash?.purgeFailed;
      if (failed && at - Date.parse(failed.at) < PURGE_RETRY_MS) continue;
      let leftOut = [];
      // Uma linha que já não é desta agência (apagada antes) só sai da lixeira.
      if (await store.belongsToAgency(id, workspaceOwner(agencyId))) {
        const since = Date.parse(failed?.since || '') || at, givingUp = at - since >= PURGE_GIVE_UP_MS;
        const failures = await accountPurge.external(agencyId, id, { force: givingUp });
        if (failures.length && !givingUp) {
          console.error(`Lixeira de subcontas (${id}): ${failures.join(' · ')}`);
          await changeAgency(agencyId, current => {
            const trash = current.accounts[id]?.trash;
            if (trash) trash.purgeFailed = { at: new Date(at).toISOString(), since: new Date(since).toISOString(), error: failures.join(' · ').slice(0, 500) };
          });
          continue;
        }
        leftOut = failures;
        await accountPurge.local(id);
        await store.remove(id);
      }
      await changeAgency(agencyId, current => {
        const name = current.accounts[id]?.name || id;
        delete current.accounts[id];
        const drop = list => Array.isArray(list) ? list.filter(account => account !== id) : list;
        for (const user of current.users || []) user.accounts = drop(user.accounts);
        if (current.saas) current.saas.accounts = drop(current.saas.accounts);
        if (current.emailServices) current.emailServices.accounts = drop(current.emailServices.accounts);
        logTo(current, { name: 'Lixeira automática' }, 'Sub-account permanently deleted', name, leftOut.length ? `Ficou de fora: ${leftOut.join(' · ')}`.slice(0, 500) : '');
      });
      done.push(id);
    }
    if (done.length) belongsCache.clear();
    return done;
  }
  // Each document is read once per round, not once per task (read-scope.mjs).
  const runAllSocial = (base, at = Date.now()) => cronReads.run(() => runSocialRound(base, at));
  async function runSocialRound(base, at) {
    let total = 0;
    const spaces = (await store.list()).filter(w => spaceId.test(w.id) || privateSpace.test(w.id));
    await cronReads.prime(spaces.map(w => w.id)).catch(e => console.error(`Cron (revisões): ${e.message}`));
    inBackground('Event messages', () => runAllEventSends());
    inBackground('WhatsApp guard', () => runWhatsAppGuard(base, spaces));
    const { skipped } = await runInBatches(spaces, async w => {
      try { total += await runSocial(w.id, base); } catch (e) { console.error(`Social planner (${w.id}): ${e.message}`); }
      try { await runWebinarReminders(w.id, base); } catch (e) { console.error(`Webinar reminders (${w.id}): ${e.message}`); }
      try { await runEventReminders(w.id, base); } catch (e) { console.error(`Community event reminders (${w.id}): ${e.message}`); }
      try { await runNewsletters(w.id, base); } catch (e) { console.error(`Community newsletters (${w.id}): ${e.message}`); }
      try { await runWorkflows(w.id); } catch (e) { console.error(`Workflows (${w.id}): ${e.message}`); }
      try { await runReportMail(w.id); } catch (e) { console.error(`Report e-mail (${w.id}): ${e.message}`); }
      try {
        const state = await store.load(w.id), today = usageToClose(state, at);
        if (today) await store.change(w.id, s => closeUsage(s, today));
        else if (state.ledgerOutbox?.length) await ledgerFlush.workspace(w.id);
      } catch (e) { console.error(`Livro (${w.id}): ${e.message}`); }
      try { await runRecurringInvoices(w.id); } catch (e) { console.error(`Recurring invoices (${w.id}): ${e.message}`); }
      try { await runAbandonedCheckouts(w.id); } catch (e) { console.error(`Abandoned checkouts (${w.id}): ${e.message}`); }
      try { await runExpiredOrders(w.id); } catch (e) { console.error(`Expired orders (${w.id}): ${e.message}`); }
      try { await runEmailCampaigns(w.id); } catch (e) { console.error(`E-mail campaigns (${w.id}): ${e.message}`); }
      try { await runAllAds(w.id); } catch (e) { console.error(`Ads (${w.id}): ${e.message}`); }
    }, { concurrency: cronConcurrency, budgetMs: cronBudgetMs, start: Math.floor(at / 60_000) });
    for (const { id } of (await store.list()).filter(row => isAgencyRow(row.id))) {
      try { if ((await store.load(id)).ledgerOutbox?.length) await ledgerFlush.agency(id); } catch (e) { console.error(`Livro (${id}): ${e.message}`); }
      try { await purgeTrash(id, at); } catch (e) { console.error(`Lixeira de subcontas (${id}): ${e.message}`); }
    }
    await trackingLog.sweep(at);
    await auditLog.sweep(at);
    await graaoAI.admin.prune(at);
    if (skipped.length) console.warn(`Cron: ${skipped.length} de ${spaces.length} workspaces ficaram para o próximo minuto.`);
    return total;
  }
  const socialTimer = socialScheduler ? setInterval(() => { ready.then(() => runAllSocial(process.env.SOCIAL_PUBLIC_URL || `http://${host}:${port}`)).catch(() => {}); }, 60_000) : null;
  socialTimer?.unref?.();
  const socialPopup = (base, message) => `<!doctype html><meta charset="utf-8"><title>graao</title><body style="font-family:system-ui;padding:24px">
<p>${message.error ? 'Não foi possível conectar.' : 'Conta autorizada. Você pode fechar esta janela.'}</p><script>
const m=${JSON.stringify({ type: 'graao-social', ...message }).replace(/</g, '\\u003c')};
if (window.opener) { window.opener.postMessage(m, ${JSON.stringify(base)}); window.close(); } else location.href='/app#marketing/social';
</script>`;
  // ---- Anúncios (Meta Ads, Google Ads) --------------------------------------------------------
  // Tokens live sealed in the `ads-<workspace>` row; the workspace keeps campaigns and daily numbers.
  const adsCallbackPath = '/api/ads/callback';
  const adsPopup = (base, message) => `<!doctype html><meta charset="utf-8"><title>graao</title><body style="font-family:system-ui;padding:24px">
<p>${message.error ? 'Não foi possível conectar a conta de anúncios.' : 'Conta de anúncios conectada. Você pode fechar esta janela.'}</p><script>
const m=${JSON.stringify({ type: 'graao-ads', ...message }).replace(/</g, '\\u003c')};
if (window.opener) { window.opener.postMessage(m, ${JSON.stringify(base)}); window.close(); } else location.href='/app#marketing/ads';
</script>`;
  const adsView = row => ({ configured: adsConfigured(), ...Object.fromEntries(['meta', 'google'].map(network => {
    const a = row[network] || {};
    return [network, { connected: Boolean(a.token), user: a.user || '', connectedAt: a.connectedAt || '', accounts: a.accounts || [], accountId: a.accountId || '', pages: a.pages || [], pageId: a.pageId || '' }];
  })) });
  async function adsAccess(workspace, network) {
    const rowId = `ads-${workspace}`, a = (await socialRow(rowId))[network];
    if (!a?.token) throw error(`Conecte o ${network === 'meta' ? 'Meta Ads' : 'Google Ads'} primeiro.`, 409);
    const account = a.accounts.find(item => item.id === a.accountId);
    if (!account) throw error('Escolha a conta de anúncios.', 409);
    const fresh = await freshAdsSecret(network, unseal(a.token));
    if (fresh.changed) await store.change(rowId, row => { if (row[network]) row[network].token = seal(fresh.secret); });
    return { secret: fresh.secret, account, page: (a.pages || []).find(item => item.id === a.pageId) || null };
  }
  // Workflows (Conversions API, custom audiences): only the Meta token matters, not the chosen ad account.
  async function metaSecret(workspace) {
    const rowId = `ads-${workspace}`, a = (await socialRow(rowId)).meta;
    if (!a?.token) throw error('conecte o Meta Ads em Marketing → Anúncios', 409);
    const fresh = await freshAdsSecret('meta', unseal(a.token));
    if (fresh.changed) await store.change(rowId, row => { if (row.meta) row.meta.token = seal(fresh.secret); });
    return fresh.secret;
  }
  async function workflowMeta(workspace, item) {
    if (privateSpace.test(workspace)) return 'não disponível na conta pessoal';
    const secret = await metaSecret(workspace);
    if (item.kind === 'meta-capi') {
      const sent = await sendMetaEvents(secret, item.pixel, [item.event], item.testCode);
      return `${item.event.event_name}: ${sent.received ? 'recebido pela Meta' : 'não recebido'}${item.testCode ? ' (teste)' : ''}`;
    }
    const changed = await changeMetaAudience(secret, item.audience, [item.row], item.remove);
    return `${item.remove ? 'removido do' : 'incluído no'} público ${item.audience}${changed.invalid ? ' (dados inválidos)' : ''}`;
  }
  // Messenger and Direct (meta-messaging.mjs). "social-meta-routes" maps each connected page / Instagram account to its
  // sub-account, so the webhook knows where a message belongs; it is rebuilt whenever accounts change.
  const metaRoutesRow = async () => { try { return await store.load('social-meta-routes'); } catch { await store.insert('social-meta-routes', { profile: { name: 'Meta routes' }, routes: {} }); return store.load('social-meta-routes'); } };
  async function routeMetaAccounts(workspace) {
    if (privateSpace.test(workspace)) return;
    const accounts = ((await store.load(workspace)).socialAccounts || []).filter(row => ['facebook', 'instagram'].includes(row.provider));
    const secrets = (await socialRow(`social-${workspace}`)).tokens || {};
    await metaRoutesRow();
    await store.change('social-meta-routes', row => {
      row.routes ||= {};
      for (const [key, value] of Object.entries(row.routes)) if (value.workspace === workspace) delete row.routes[key];
      for (const account of accounts) row.routes[account.externalId] = { workspace, accountId: account.id, network: account.provider };
    });
    // Ask Meta to send each linked page's messages, comments and leads to this app. Instagram accounts share their linked Page token.
    const pages = new Map();
    for (const account of accounts) {
      const secret = (() => { try { return unseal(secrets[account.id]); } catch { return null; } })();
      const pageId = account.provider === 'instagram' ? secret?.pageId : account.externalId;
      if (secret?.token && /^\d{3,64}$/.test(String(pageId || ''))) pages.set(String(pageId), secret.token);
    }
    for (const [pageId, token] of pages) await subscribeMetaPage({ token, pageId }, metaFetch).catch(() => false);
  }
  // The page token and page id that send on this channel for this contact id key ("facebook:<pageId>").
  async function metaSender(workspace, state, key) {
    const [network, externalId] = key.split(':');
    const account = (state.socialAccounts || []).find(row => row.provider === network && row.externalId === externalId);
    if (!account) return null;
    let secret = null;
    try { secret = unseal(((await socialRow(`social-${workspace}`)).tokens || {})[account.id]); } catch { secret = null; }
    if (!secret?.token) return null;
    return { token: secret.token, pageId: network === 'instagram' ? secret.pageId : externalId };
  }
  // One public reply on the exact Facebook or Instagram comment that triggered the workflow.
  async function deliverMetaCommentReply(workspace, state, { network, accountId, commentId, body }) {
    if (privateSpace.test(workspace)) return { sent: false, reason: 'not_connected' };
    if (!await accountIsActive(state.agencyId || AGENCY_ID, workspace, 'conversations')) return { sent: false, reason: 'suspended' };
    const sender = await metaSender(workspace, state, network + ':' + accountId);
    if (!sender) return { sent: false, reason: 'not_connected' };
    return sendMetaCommentReply({ token: sender.token, commentId, network, text: body }, metaFetch);
  }
  // One message to a contact on Messenger or Direct, trying each connected account the contact has written to.
  async function deliverMetaMessage(workspace, state, { network, recipients, body, buttons = [] }) {
    if (privateSpace.test(workspace)) return { sent: false, reason: 'not_connected' };
    if (!await accountIsActive(state.agencyId || AGENCY_ID, workspace, 'conversations')) return { sent: false, reason: 'suspended' };
    let last = { sent: false, reason: 'no_recipient' };
    for (const [key, recipientId] of Object.entries(recipients || {}).filter(([key]) => key.startsWith(`${network}:`))) {
      const sender = await metaSender(workspace, state, key);
      if (!sender) { last = { sent: false, reason: 'not_connected' }; continue; }
      last = await sendMetaMessage({ ...sender, recipientId, text: body, buttons: quickReplies(buttons.join('\n')) }, metaFetch);
      if (last.sent) return last;
    }
    return last;
  }
  // Workflows: an event to the GA4 property, with the sealed Measurement Protocol secret.
  async function workflowGa4(workspace, item) {
    if (privateSpace.test(workspace)) return 'não disponível na conta pessoal';
    const row = await socialRow(`ads-${workspace}`);
    const secret = row.ga4Secret ? unseal(row.ga4Secret) : '';
    await sendGa4Event({ measurementId: item.measurementId, secret, clientId: item.clientId, userId: item.userId, event: item.event });
    return `${item.event.name} enviado`;
  }
  // Workflows: an offline conversion to the Google Ads account chosen in Marketing → Anúncios.
  async function workflowGoogleAds(workspace, item) {
    if (privateSpace.test(workspace)) return 'não disponível na conta pessoal';
    const { secret, account } = await adsAccess(workspace, 'google');
    const sent = await uploadGoogleConversion(secret, account.id, item);
    return sent.accepted ? `conversão registrada em ${account.name}` : 'o Google Ads não registrou a conversão';
  }
  const adsRuns = new Set();
  /** Syncs campaigns and the daily numbers of the last 7 days (90 on the first sync or when `full`). */
  async function runAds(workspace, network, { full = false } = {}) {
    const key = `${workspace}|${network}`;
    if (adsRuns.has(key)) throw error('A sincronização já está em andamento.', 409);
    adsRuns.add(key);
    try {
      const { secret, account } = await adsAccess(workspace, network);
      const state = await store.load(workspace);
      let today;
      try { today = new Intl.DateTimeFormat('en-CA', { timeZone: state.profile?.timezone || 'UTC' }).format(new Date()); } catch { today = stamp().slice(0, 10); }
      const back = full || !state.adSettings?.lastSync?.[network] ? 89 : 6;
      const from = new Date(Date.parse(`${today}T12:00:00Z`) - back * 864e5).toISOString().slice(0, 10);
      const data = await syncAds(network, secret, account, from, today);
      return await store.change(workspace, s => storeAdSync(s, network, { account, ...data, from, to: today }));
    } catch (e) {
      await store.change(workspace, s => { const settings = adSettingsOf(s); settings.syncErrors[network] = String(e.message || e).slice(0, 300); (settings.lastAttempt ??= {})[network] = stamp(); }).catch(() => {});
      throw e;
    } finally { adsRuns.delete(key); }
  }
  // Scheduler: every connected network syncs every 3 hours (an error waits an hour before retrying).
  async function runAllAds(workspace) {
    const state = await store.load(workspace), settings = state.adSettings;
    if (!settings?.connected?.meta && !settings?.connected?.google) return;
    if (!await accountIsActive(state.agencyId || AGENCY_ID, workspace, 'marketing')) return;
    for (const network of ['meta', 'google']) {
      if (!settings.connected[network] || Date.parse(settings.lastSync?.[network] || 0) > Date.now() - 3 * 3600_000) continue;
      if (Date.parse(settings.lastAttempt?.[network] || 0) > Date.now() - 3600_000) continue;
      await runAds(workspace, network).catch(e => console.error(`Ads sync (${workspace}, ${network}): ${e.message}`));
    }
  }
  // ---- Google Analytics + Business Profile (sub-account dashboard) ----------------------------
  const googleCallbackPath = '/api/google/callback';
  const googleCache = new Map();
  const searchCache = new Map();
  const googlePopup = (base, message) => `<!doctype html><meta charset="utf-8"><title>graao</title><body style="font-family:system-ui;padding:24px">
<p>${message.error ? 'Não foi possível conectar o Google.' : 'Conta Google conectada. Você pode fechar esta janela.'}</p><script>
const m=${JSON.stringify({ type: 'graao-google', ...message }).replace(/</g, '\\u003c')};
if (window.opener) { window.opener.postMessage(m, ${JSON.stringify(base)}); window.close(); } else location.href='/app#settings/google';
</script>`;
  const googleView = (row, manage) => {
    const g = row.google || {};
    const pick = (list, value) => list?.find(item => item.id === value) || null;
    return { configured: googleConfigured(), connected: Boolean(g.token), email: manage ? g.email || '' : '', connectedAt: g.connectedAt || '',
      properties: manage ? g.properties || [] : [], locations: manage ? g.locations || [] : [], errors: manage ? g.errors || {} : {},
      sites: manage ? g.sites || [] : [], gaProperty: g.gaProperty || '', gbpLocation: g.gbpLocation || '', gscSite: g.gscSite || '',
      gaName: pick(g.properties, g.gaProperty)?.name || '', gbpName: pick(g.locations, g.gbpLocation)?.name || '', gscName: pick(g.sites, g.gscSite)?.name || '' };
  };
  async function googleData(workspace, row) {
    const g = row.google;
    if (!g?.token || (!g.gaProperty && !g.gbpLocation)) return { ga: null, gbp: null };
    const key = `${g.gaProperty}|${g.gbpLocation}`;
    const cached = googleCache.get(workspace);
    if (cached && cached.key === key && cached.at > Date.now() - 15 * 60_000) return cached.data;
    let secret = unseal(g.token);
    if (!secret) return { ga: { error: 'A conexão com o Google precisa ser refeita.' }, gbp: null };
    const report = await googleReports(secret, g).catch(e => ({ ga: g.gaProperty ? { error: e.message } : null, gbp: g.gbpLocation ? { error: e.message } : null }));
    if (report.secret) await store.change(`google-${workspace}`, r => { if (r.google) r.google.token = seal(report.secret); });
    const data = { ga: report.ga, gbp: report.gbp, at: stamp() };
    if (!data.ga?.error && !data.gbp?.error) googleCache.set(workspace, { key, at: Date.now(), data });
    return data;
  }
  // The Business Profile location chosen for a workspace, with a fresh token and its account (for reviews).
  async function gbpAccess(workspace) {
    const rowId = `google-${workspace}`;
    const g = (await socialRow(rowId)).google;
    if (!g?.token) throw error('Conecte o Google em Configurações → Google para gerenciar o Perfil da Empresa.', 409);
    if (!g.gbpLocation) throw error('Escolha o local do Perfil da Empresa em Configurações → Google.', 409);
    const fresh = await freshSecret(unseal(g.token)).catch(() => { throw error('O acesso ao Google expirou. Conecte a conta de novo em Configurações → Google.', 401); });
    if (fresh.changed) await store.change(rowId, row => { if (row.google) row.google.token = seal(fresh.secret); });
    let location = g.locations?.find(item => item.id === g.gbpLocation);
    if (!location?.accountId) {
      const list = await listLocations(fresh.secret.token).catch(problem => { throw googleError(problem); });
      await store.change(rowId, row => { if (row.google) row.google.locations = list; });
      location = list.find(item => item.id === g.gbpLocation);
    }
    return { token: fresh.secret.token, location: g.gbpLocation, account: location?.accountId || '', name: location?.name || '' };
  }
  const gbpCache = new Map();
  async function gbpStatus(workspace, force = false) {
    const access = await gbpAccess(workspace);
    const cached = gbpCache.get(workspace);
    const details = !force && cached?.location === access.location && cached.at > Date.now() - 10 * 60_000 ? cached.details
      : await locationDetails(access.token, access.location).catch(problem => { throw googleError(problem); });
    gbpCache.set(workspace, { location: access.location, details, at: Date.now() });
    const state = await store.load(workspace);
    const gbpAccounts = new Set((state.socialAccounts || []).filter(row => row.provider === 'gbp').map(row => row.id));
    const week = Date.now() - 7 * 864e5;
    const posts = (state.socialPosts || []).filter(post => Date.parse(post.publishedAt || 0) > week && (post.results || []).some(result => result.ok && gbpAccounts.has(result.accountId))).length;
    return { location: access.location, name: details.title || access.name, account: Boolean(access.account), details, syncedAt: state.reputation?.googleSyncedAt || '',
      checklist: gbpChecklist(details, { reviews: state.reviews, posts }) };
  }
  const payload = async request => {
    if (!/^application\/json(?:\s*;|$)/i.test(request.headers['content-type']||'')) throw error('Send a JSON request.',415);
    let size=0; const chunks=[];
    for await (const part of request) { size+=part.length; if(size>1050000) throw error('Request is too large.',413); chunks.push(part); }
    try { const v=JSON.parse(Buffer.concat(chunks).toString('utf8')); if(!v||typeof v!=='object'||Array.isArray(v)) throw Error(); return v; }
    catch { throw error('Invalid JSON request.',400); }
  };
  // Rotas por domínio (P2.1): cada módulo recebe o que vive neste fechamento e devolve NEXT_ROUTE quando a rota não é dele.
  const platformMonitor = createPlatformMonitor({ store, env: platformEnv, request: platformRequest, mailer: documentMail, pushEnv, pushRequest });
  const platformRoute = createPlatformRoutes({ monitor: platformMonitor, verifiedUser, agencyOwnerId, auth, localAccess, error, payload });
  const aiGatewayRoute = createAiGatewayRoutes({ gateway: graaoAI, verifiedUser, agencyOwnerId, auth, localAccess, error, payload });
  const socialRoute = createSocialRoutes({ platformMonitor, store, auth, localAccess, redirectToR2, ready, root, error, spaceId, privateSpace, stamp, socialFilePath, socialInvitePath, socialApprovePath, accountIsActive, approvalView, brandVoiceOf, callbackPath, change, content, fileBytes, inviteAttach, meteredAI, openAI, payload, publicAccountPolicy, publicBase, routeMetaAccounts, runAllSocial, runSocial, socialActor, socialPopup, socialRow, socialSecrets, startSocialOAuth, validateApproval, validateInvite, whatsapp, workspaceAccess });
  const adsRoute = createAdsRoutes({ store, localAccess, error, spaceId, privateSpace, stamp, adsAccess, adsCallbackPath, adsPopup, adsView, payload, publicBase, recordAudit, runAds, socialActor, socialRow, workspaceAccess });
  const runCommand = createCommandRunner({ store, r2, messageMedia, clearVideoChunks, documentMail, error, privateSpace, mailSent, deliveryFailure, accountIsActive, change, deliverMetaMessage, emailLater, eventSendsLater, flushLater, listWorkspaces, publicBase, recordAudit, sendingAddress, whatsapp, workspaceAccess });
  const actionRoute = createActionRoutes({ error, spaceId, privateSpace, payload, workspaceAccess, runCommand });
  const mcpRoute = createMcpRoutes({ store, ready, root, auth, localAccess, error, spaceId, privateSpace, payload, runCommand, publicBase, stamp, recordAudit, listWorkspaces, access, apiCredential, changeAgency, loadAgency, requireWorkspaceAccess, workspaceAccess });
  const emailRoute = createEmailRoutes({ store, ready, error, spaceId, privateSpace, stamp, campaignMail, emailDomainApi, flushLater, inboundFetch, payload, publicAccountPolicy, publicBase, recordAudit, sendingAddress, socialRow, testHits, workspaceAccess });
  const metaRoute = createMetaRoutes({ store, ready, error, change, flushLater, metaFetch, metaRoutesRow, metaSender, publicAccountPolicy });
  const googleRoute = createGoogleRoutes({ store, ready, localAccess, error, spaceId, privateSpace, stamp, workspaceSegment, flushLater, googleCache, googleCallbackPath, googleData, googlePopup, googleView, payload, publicAccountPolicy, publicBase, recordAudit, searchCache, socialActor, socialRow, workspaceAccess });
  const gbpRoute = createGbpRoutes({ store, error, spaceId, change, flushLater, gbpAccess, gbpStatus, payload, recordAudit, workspaceAccess });
  const agentRoute = createAgentRoutes({ store, localAccess, error, spaceId, privateSpace, agentModel, designAgentConfig, generateAgentReply, listWorkspaces, openAI, payload, recordAudit, workspaceAccess });
  const studioRoute = createStudioRoutes({ store, error, change, openAI, payload, siteDoc, studioGuard, studioRequest, syncMeta });
  const billingRoute = createBillingRoutes({ abacate, accessContext, verifiedUser, canOpen, changeAgency, recordAudit, error, pausedError, publicBase, retryPolicyOf, spaceId,
    store, access, requireCapability, workspaceAccess, listWorkspaces });
  const storePageRoute = createStorePageRoutes({ store, ready, error, publicAccountPolicy, publicPreview, storePath, withPixels });
  const storeApiRoute = createStoreApiRoutes({ store, ready, error, abacate, allowSign, allowTracking, allowPurchase, allowQuote, change, flushLater, payload, publicAccountPolicy, publicBase, storeApi });
  const pranchetaRoute = createPranchetaRoutes({ store, error, access, change, changeAgency, loadAgency, payload, requireActiveAccount, workspaceAccess });
  const portalRoute = createPortalRoutes({ store, auth, ready, root, error, portalApi, portalPage, abacate, change, clientPortal, community, flushLater, grantOffer, payload, publicAccountPolicy, publicBase, requireActiveAccount, workspaceAccess });
  const documentRoute = createDocumentRoutes({ store, ready, root, error, workspaceSegment, abacate, allowSign, change, flushLater, payload, publicAccountPolicy, publicBase });
  const affiliateRoute = createAffiliateRoutes({ store, ready, error, workspaceSegment, allowSign, change, flushLater, payload, publicAccountPolicy, publicBase, referralsOf });
  const offerPageRoute = createOfferPageRoutes({ store, ready, error, workspaceSegment, clientPortal, publicAccountPolicy, withPixels });
  const offerApiRoute = createOfferApiRoutes({ store, ready, error, workspaceSegment, abacate, change, grantOffer, payload, publicAccountPolicy, publicBase });
  const paymentLinkRoute = createPaymentLinkRoutes({ store, ready, error, workspaceSegment, abacate, allowPurchase, change, payload, publicAccountPolicy, publicBase, clientPortal, withPixels });
  const bookingRoute = createBookingRoutes({ store, ready, error, workspaceSegment, allowSign, change, flushLater, formBody, leave, publicAccountPolicy, withPixels });
  const preferenceRoute = createPreferenceRoutes({ store, ready, error, workspaceSegment, change, flushLater, formBody, publicAccountPolicy });
  const agencyAppRoute = createAgencyAppRoutes({ store, auth, ready, error, loadAgency });
  const certificateRoute = createCertificateRoutes({ store, ready, error, workspaceSegment, publicAccountPolicy });
  const shareRoute = createShareRoutes({ store, ready, error, workspaceSegment, brandWorkspaces, publicAccountPolicy });
  const blogRoute = createBlogRoutes({ store, ready, error, workspaceSegment, brandVoiceOf, change, content, meteredAI, openAI, payload, publicAccountPolicy, publicBase, publicPreview, withPixels, workspaceAccess });
  const chatRoute = createChatRoutes({ store, ready, error, workspaceSegment, change, payload, publicAccountPolicy, workspaceAccess });
  const formRoute = createFormRoutes({ store, ready, error, workspaceSegment, change, formBody, leave, publicAccountPolicy, withPixels, workspaceAccess });
  const workflowHookRoute = createWorkflowHookRoutes({ store, ready, error, workspaceSegment, change, flushLater, payload, publicAccountPolicy });
  const countdownRoute = createCountdownRoutes({ store, ready, workspaceSegment, publicAccountPolicy });
  const emailTrackRoute = createEmailTrackingRoutes({ store, ready, workspaceSegment, change, flushLater, publicAccountPolicy });
  const linkRoute = createLinkRoutes({ store, ready, workspaceSegment, publicAccountPolicy });
  const whatsappWebhookRoute = createWhatsappWebhookRoutes({ whatsapp, payload, listWorkspaces, webhookBlockReason, flushLater });
  const connectorHookRoute = createConnectorHookRoutes({ store, ready, error, change, flushLater, publicAccountPolicy, connectorAuth });
  const twilioRoute = createTwilioWebhookRoutes({ ready, phone });
  const connectorRoute = createConnectorRoutes({ store, error, spaceId, privateSpace, change, payload, publicBase, requireActiveAccount, workspaceAccess, connectorRequest });
  // White Label: a origem que o Supabase aceita na volta do Google; nos domínios das agências o código passa por ela.
  const platformOrigin = String(process.env.PLATFORM_PUBLIC_ORIGIN || process.env.PORTAL_PUBLIC_ORIGIN || process.env.SOCIAL_PUBLIC_URL || '').replace(/\/+$/, '');
  const authRoute = createAuthRoutes({ auth, ready, error, payload, accessContext, store, platformOrigin });
  const pushRoute = createPushRoutes({ error, spaceId, privateSpace, change, payload, pushEnv, access, loadAgency, workspaceAccess });
  const phoneRoute = createPhoneRoutes({ error, spaceId, privateSpace, phone, payload, workspaceAccess });
  const inboxRoute = createInboxRoutes({ store, error, spaceId, privateSpace, workspaceAccess });
  const whatsappRoute = createWhatsappRoutes({ messageMedia, error, spaceId, whatsapp, waha, payload, publicBase, listWorkspaces, requireActiveAccount, webhookBlockReason, access, workspaceAccess });
  const siteRoute = createSiteRoutes({ store, ready, error, workspaceSegment, trackingPath, allowTracking, change, changeSite, flushLater, formFields, publicAccountPolicy, publicBase, siteDoc, studioGuard, trackingLog, withPixels });
  const webinarRoute = createWebinarRoutes({ store, ready, error, workspaceSegment, change, payload, publicAccountPolicy, publicBase, publicPreview });
  const qrRoute = createQrRoutes({ store, ready, workspaceSegment, change, publicAccountPolicy, publicBase });
  const reputationRoute = createReputationRoutes({ store, ready, error, workspaceSegment, allowSign, change, clientPortal, flushLater, moveVideoToR2, payload, publicAccountPolicy, publicBase, sendVideo });
  const verifyRoute = createVerifyRoutes({ store, accessContext, verifiedUser, changeAgency, loadFresh, whatsapp, phoneVerify, payload, error, publicBase });
  const askRoute = createAskRoutes({ accessContext, verifiedUser, handleAsk, listWorkspaces, ensureAccounts, agencyWorkspaceViews, publicAgency, abacate });
  const brandAIRoute = createBrandAIRoutes({ store, error, spaceId, privateSpace, workspaceAccess, payload, brandFetch, brandResolve, localAccess, contentAI, openAI, meteredAI, content });
  const conversationAIRoute = createConversationAIRoutes({ store, error, spaceId, privateSpace, workspaceAccess, payload, change, flushLater, localAccess, contentAI, openAI, meteredAI, content });
  const seoRoute = createSeoRoutes({ store, error, spaceId, privateSpace, workspaceAccess, payload, change, flushLater, stamp, prospectAudit, socialRow, searchCache, localAccess, contentAI, openAI, meteredAI, content });
  const contentAIRoute = createContentAIRoutes({ error, spaceId, privateSpace, workspaceAccess, payload, brandVoiceOf, localAccess, contentAI, openAI, meteredAI, content });
  const abacatePayRoute = createAbacatePayRoutes({ store, ready, error, abacate, access, payload, publicBase, listWorkspaces, loadAgency, changeAgency, agencyPayload, recordAudit, requireFiscal, retryPolicyOf, stamp, documentMail, mailSent, flushLater, grantOffer, grantEventTicket, community });
  const abacatePayWorkspaceRoute = createAbacatePayWorkspaceRoutes({ store, error, abacate, spaceId, workspaceAccess, payload, publicBase, requireFiscal });
  const walletRoute = createWalletRoutes({ store, error, abacate, spaceId, workspaceAccess, payload, publicBase, flushLater });
  const publicMediaRoute = createPublicMediaRoutes({ store, error, ready, workspaceSegment, publicAccountPolicy, sendVideo });
  const driveRoute = createDriveRoutes({ store, error, spaceId, privateSpace, payload, workspaceAccess, r2, fetchMedia, change });
  const trackingRoute = createTrackingRoutes({ store, error, spaceId, privateSpace, payload, workspaceAccess, trackingLog, socialRow, change });
  const videoRoute = createVideoRoutes({ store, error, spaceId, privateSpace, workspaceAccess, sendVideo });
  const publicApiRoute = createPublicApiRoutes({ store, error, bearer, payload, change, listWorkspaces, requireWorkspaceAccess, loadAgency });
  const prospectPublicRoute = createProspectPublicRoutes({ store, ready, error, changeAgency, csp });
  const faviconRoute = createFaviconRoutes();
  const whiteLabelRoute = createWhiteLabelRoutes({ store, ready });
  const accountRoute = createAccountRoutes({ error, verifiedUser, openAI, payload, access, createAccount, listWorkspaces, visibleWorkspaces });
  const workspaceRoute = createWorkspaceRoutes({ store, error, spaceId, privateSpace, accessContext, verifiedUser, requireWorkspaceAccess, visibleWorkspaces, workspaceAccess, payload, openAI, writeAudit, localAccess, contentAI, reportMail, agentModel });
  const ghlImportRoute = createGhlImportRoutes({ store, error, access, loadAgency, changeAgency, logTo, ghlFetch, ghlResolve,
    publicOrigin: String(process.env.PORTAL_PUBLIC_ORIGIN || 'https://graao.com').replace(/\/+$/, '') });
  const agencyRoute = createAgencyRoutes({ error, spaceId, privateSpace, access, accessContext, verifiedUser, requireWorkspaceAccess, visibleWorkspaces, agencyPayload, agencyRequest, auditLog, payload });
  const pageRoute = createPageRoutes({ store, ready, error, workspaceSegment, payload, change, publicAccountPolicy, staticFiles, sessionOnlyFiles, localAccess, auth, pranchetaEditorCsp, root });
  const server=createServer(async (req,res) => {
    const requestPath = String(req.url || '/').split('?')[0];
    const touches = touchesOf(req), landing = requestPath.match(landingPath);
    requestScope.enterWith({ public: publicRequest(requestPath), refs: referralsOf(req), touches,
      attribute: Boolean(landing) || /^\/api\/(store|chat|webinar|offer)\//.test(requestPath) });
    if (landing && req.method === 'GET') {
      // UTM tags, click ids or an outside referrer: remember them (the first touch is kept for 90 days).
      const host = String(req.headers['x-forwarded-host'] || req.headers.host || '').split(':')[0];
      const touch = touchFromVisit(req.url, String(req.headers.referer || ''), host);
      if (touch) {
        const workspace = landing[2], prior = touches[workspace];
        touches[workspace] = { first: prior?.first || touch, last: touch };
        const value = Buffer.from(JSON.stringify({ f: touches[workspace].first, l: touch })).toString('base64url');
        const secure = String(req.headers['x-forwarded-proto'] || '').includes('https') || String(process.env.SOCIAL_PUBLIC_URL || '').startsWith('https') ? '; Secure' : '';
        res.setHeader('Set-Cookie', `${touchCookie(workspace)}=${value}; Max-Age=${90 * 86400}; Path=/; HttpOnly; SameSite=Lax${secure}`);
      }
    }
    const isVercel = Boolean(process.env.VERCEL);
    const currentPort=server.address()?.port ?? port;
    const allowedHosts=[`127.0.0.1:${currentPort}`,`localhost:${currentPort}`];
    res.setHeader('Content-Security-Policy',csp);
    res.setHeader('X-Content-Type-Options','nosniff');
    res.setHeader('Referrer-Policy','no-referrer');
    res.setHeader('Cache-Control','no-store');
    const send=(status,type,data)=>{res.writeHead(status,{'Content-Type':type});res.end(data);};
    const json=(data,status=200)=>send(status,'application/json; charset=utf-8',JSON.stringify(data));
    const goTo = path => { res.writeHead(303, { Location: path }); res.end(); };
    let p = '';
    try {
      const host = req.headers.host || '';
      if (!isVercel && !allowedHosts.includes(host)) throw error('Use the local address shown in the terminal.',403);
      const proto = isVercel || req.socket?.encrypted ? 'https' : 'http';
      const url=new URL(req.url,`${proto}://${host}`);
      p = url.searchParams.get('__path') || url.pathname;
      if (!p.startsWith('/')) p = '/' + p;
      p = p.replace(/\/+/g, '/');
      const method=req.method;
      // Importar do GHL: a extensão do Chrome envia de chrome-extension://, autenticada pelo código de importação.
      const ghlImportPublic = GHL_IMPORT_PUBLIC.test(p);
      if (!['GET','HEAD','POST'].includes(method) && !(ghlImportPublic && method === 'OPTIONS')) throw error('Method not allowed.',405);
      // Tracking events come from the business's own site, so they are the one cross-site POST accepted.
      if (method==='POST' && !trackingPath.test(p) && !ghlImportPublic && (req.headers['sec-fetch-site']==='cross-site' || (req.headers.origin && req.headers.origin!==url.origin))) throw error('This workspace only accepts local requests.',403);
      // Versão para o rodapé das páginas (ui/rodape.js): pública, sem banco, guardada por alguns minutos.
      if (p === '/api/versao' && (method === 'GET' || method === 'HEAD')) {
        res.setHeader('Cache-Control', 'public, max-age=300, s-maxage=300');
        return json({ build: buildId() });
      }
      if (p.startsWith('/api/') && !p.startsWith('/api/auth/')) await ready;
      const id=url.searchParams.get('workspace') || 'demo';
      const portalRouteHandled = await portalRoute({ req, res, p, method, url, id, json, send, proto });
      if (portalRouteHandled !== NEXT_ROUTE) return portalRouteHandled;
      const faviconRouteHandled = await faviconRoute({ res, p });
      if (faviconRouteHandled !== NEXT_ROUTE) return faviconRouteHandled;
      const prospectPublicRouteHandled = await prospectPublicRoute({ req, res, p, method, url, send });
      if (prospectPublicRouteHandled !== NEXT_ROUTE) return prospectPublicRouteHandled;
      const publicApiRouteHandled = await publicApiRoute({ req, p, method, json });
      if (publicApiRouteHandled !== NEXT_ROUTE) return publicApiRouteHandled;
      const whiteLabelRouteHandled = await whiteLabelRoute({ req, p, method, json });
      if (whiteLabelRouteHandled !== NEXT_ROUTE) return whiteLabelRouteHandled;
      const authRouteHandled = await authRoute({ req, res, p, method, url, json, goTo });
      if (authRouteHandled !== NEXT_ROUTE) return authRouteHandled;
      const accountRouteHandled = await accountRoute({ req, res, p, method, json });
      if (accountRouteHandled !== NEXT_ROUTE) return accountRouteHandled;
      const platformHandled = await platformRoute({ req, res, p, method, json });
      if (platformHandled !== NEXT_ROUTE) return platformHandled;
      const aiGatewayHandled = await aiGatewayRoute({ req, res, p, method, url, json });
      if (aiGatewayHandled !== NEXT_ROUTE) return aiGatewayHandled;
      const socialHandled = await socialRoute({ req, res, p, method, url, id, json, send });
      if (socialHandled !== NEXT_ROUTE) return socialHandled;
      const publicMediaRouteHandled = await publicMediaRoute({ req, res, p, method });
      if (publicMediaRouteHandled !== NEXT_ROUTE) return publicMediaRouteHandled;
      const documentRouteHandled = await documentRoute({ req, res, p, method, json, send });
      if (documentRouteHandled !== NEXT_ROUTE) return documentRouteHandled;
      const workspaceRouteHandled = await workspaceRoute({ req, res, p, method, id, json });
      if (workspaceRouteHandled !== NEXT_ROUTE) return workspaceRouteHandled;
      const driveRouteHandled = await driveRoute({ req, res, p, method, id, json });
      if (driveRouteHandled !== NEXT_ROUTE) return driveRouteHandled;
      const trackingRouteHandled = await trackingRoute({ req, res, p, method, url, id, json });
      if (trackingRouteHandled !== NEXT_ROUTE) return trackingRouteHandled;
      const mcpRouteHandled = await mcpRoute({ req, res, p, method, url, json, send, goTo });
      if (mcpRouteHandled !== NEXT_ROUTE) return mcpRouteHandled;
      const actionRouteHandled = await actionRoute({ req, res, p, method, url, id, json, send });
      if (actionRouteHandled !== NEXT_ROUTE) return actionRouteHandled;
      const ghlImportRouteHandled = await ghlImportRoute({ req, res, p, method, json });
      if (ghlImportRouteHandled !== NEXT_ROUTE) return ghlImportRouteHandled;
      const agencyRouteHandled = await agencyRoute({ req, res, p, method, url, id, json });
      if (agencyRouteHandled !== NEXT_ROUTE) return agencyRouteHandled;
      const abacatePayRouteHandled = await abacatePayRoute({ req, res, p, method, url, json });
      if (abacatePayRouteHandled !== NEXT_ROUTE) return abacatePayRouteHandled;
      const billingRouteHandled = await billingRoute({ req, res, p, method, url, id, json, send });
      if (billingRouteHandled !== NEXT_ROUTE) return billingRouteHandled;
      const adsRouteHandled = await adsRoute({ req, res, p, method, url, id, json, send });
      if (adsRouteHandled !== NEXT_ROUTE) return adsRouteHandled;
      const googleRouteHandled = await googleRoute({ req, res, p, method, url, id, json, send });
      if (googleRouteHandled !== NEXT_ROUTE) return googleRouteHandled;
      const emailRouteHandled = await emailRoute({ req, res, p, method, id, json });
      if (emailRouteHandled !== NEXT_ROUTE) return emailRouteHandled;
      const abacatePayWorkspaceRouteHandled = await abacatePayWorkspaceRoute({ req, res, p, method, id, json });
      if (abacatePayWorkspaceRouteHandled !== NEXT_ROUTE) return abacatePayWorkspaceRouteHandled;
      const verifyRouteHandled = await verifyRoute({ req, res, p, method, json });
      if (verifyRouteHandled !== NEXT_ROUTE) return verifyRouteHandled;
      const whatsappWebhookHandled = await whatsappWebhookRoute({ req, p, method, url, json });
      if (whatsappWebhookHandled !== NEXT_ROUTE) return whatsappWebhookHandled;
      const connectorHookHandled = await connectorHookRoute({ req, p, method, json });
      if (connectorHookHandled !== NEXT_ROUTE) return connectorHookHandled;
      const twilioRouteHandled = await twilioRoute({ req, res, p, method, url });
      if (twilioRouteHandled !== NEXT_ROUTE) return twilioRouteHandled;
      const metaRouteHandled = await metaRoute({ req, p, method, url, json, send });
      if (metaRouteHandled !== NEXT_ROUTE) return metaRouteHandled;
      const connectorRouteHandled = await connectorRoute({ req, res, p, method, id, json });
      if (connectorRouteHandled !== NEXT_ROUTE) return connectorRouteHandled;
      const pushRouteHandled = await pushRoute({ req, res, p, method, id, json, isVercel });
      if (pushRouteHandled !== NEXT_ROUTE) return pushRouteHandled;
      const phoneRouteHandled = await phoneRoute({ req, res, p, method, url, id, json });
      if (phoneRouteHandled !== NEXT_ROUTE) return phoneRouteHandled;
      const inboxRouteHandled = await inboxRoute({ req, res, p, method, url, id, json });
      if (inboxRouteHandled !== NEXT_ROUTE) return inboxRouteHandled;
      const whatsappRouteHandled = await whatsappRoute({ req, res, p, method, url, id, json });
      if (whatsappRouteHandled !== NEXT_ROUTE) return whatsappRouteHandled;
      const askRouteHandled = await askRoute({ req, res, p, method, url, json });
      if (askRouteHandled !== NEXT_ROUTE) return askRouteHandled;
      const gbpRouteHandled = await gbpRoute({ req, res, p, method, url, id, json });
      if (gbpRouteHandled !== NEXT_ROUTE) return gbpRouteHandled;
      const videoRouteHandled = await videoRoute({ req, res, p, method, url, id });
      if (videoRouteHandled !== NEXT_ROUTE) return videoRouteHandled;
      const brandAIRouteHandled = await brandAIRoute({ req, res, p, method, id, json });
      if (brandAIRouteHandled !== NEXT_ROUTE) return brandAIRouteHandled;
      const conversationAIRouteHandled = await conversationAIRoute({ req, res, p, method, url, id, json });
      if (conversationAIRouteHandled !== NEXT_ROUTE) return conversationAIRouteHandled;
      const walletRouteHandled = await walletRoute({ req, res, p, method, id, json });
      if (walletRouteHandled !== NEXT_ROUTE) return walletRouteHandled;
      const seoRouteHandled = await seoRoute({ req, res, p, method, url, id, json });
      if (seoRouteHandled !== NEXT_ROUTE) return seoRouteHandled;
      const contentAIRouteHandled = await contentAIRoute({ req, res, p, method, id, json });
      if (contentAIRouteHandled !== NEXT_ROUTE) return contentAIRouteHandled;
      const agentRouteHandled = await agentRoute({ req, res, p, method, url, id, json });
      if (agentRouteHandled !== NEXT_ROUTE) return agentRouteHandled;
      const pranchetaRouteHandled = await pranchetaRoute({ req, res, p, method, url, id, json, send });
      if (pranchetaRouteHandled !== NEXT_ROUTE) return pranchetaRouteHandled;
      const studioRouteHandled = await studioRoute({ req, res, p, method, url, id, json });
      if (studioRouteHandled !== NEXT_ROUTE) return studioRouteHandled;
      const siteRouteHandled = await siteRoute({ req, res, p, method, url });
      if (siteRouteHandled !== NEXT_ROUTE) return siteRouteHandled;
      const webinarRouteHandled = await webinarRoute({ req, res, p, method, url, json });
      if (webinarRouteHandled !== NEXT_ROUTE) return webinarRouteHandled;
      const qrRouteHandled = await qrRoute({ req, res, p, method });
      if (qrRouteHandled !== NEXT_ROUTE) return qrRouteHandled;
      const storePageHandled = await storePageRoute({ req, res, p, method, url });
      if (storePageHandled !== NEXT_ROUTE) return storePageHandled;
      const affiliateRouteHandled = await affiliateRoute({ req, res, p, method, json });
      if (affiliateRouteHandled !== NEXT_ROUTE) return affiliateRouteHandled;
      const reputationRouteHandled = await reputationRoute({ req, res, p, method, json });
      if (reputationRouteHandled !== NEXT_ROUTE) return reputationRouteHandled;
      const offerPageRouteHandled = await offerPageRoute({ res, p, method, url });
      if (offerPageRouteHandled !== NEXT_ROUTE) return offerPageRouteHandled;
      const bookingRouteHandled = await bookingRoute({ req, res, p, method, url });
      if (bookingRouteHandled !== NEXT_ROUTE) return bookingRouteHandled;
      const preferenceRouteHandled = await preferenceRoute({ req, res, p, method });
      if (preferenceRouteHandled !== NEXT_ROUTE) return preferenceRouteHandled;
      const agencyAppRouteHandled = await agencyAppRoute({ req, res, p, method });
      if (agencyAppRouteHandled !== NEXT_ROUTE) return agencyAppRouteHandled;
      const certificateRouteHandled = await certificateRoute({ res, p, method });
      if (certificateRouteHandled !== NEXT_ROUTE) return certificateRouteHandled;
      const offerApiRouteHandled = await offerApiRoute({ req, p, method, json });
      if (offerApiRouteHandled !== NEXT_ROUTE) return offerApiRouteHandled;
      const paymentLinkHandled = await paymentLinkRoute({ req, res, p, method, url, json });
      if (paymentLinkHandled !== NEXT_ROUTE) return paymentLinkHandled;
      const storeApiHandled = await storeApiRoute({ req, p, method, json });
      if (storeApiHandled !== NEXT_ROUTE) return storeApiHandled;
      const shareRouteHandled = await shareRoute({ res, p, method, url });
      if (shareRouteHandled !== NEXT_ROUTE) return shareRouteHandled;
      const blogRouteHandled = await blogRoute({ req, res, p, method, url, id, json });
      if (blogRouteHandled !== NEXT_ROUTE) return blogRouteHandled;
      const chatRouteHandled = await chatRoute({ req, res, p, method, json });
      if (chatRouteHandled !== NEXT_ROUTE) return chatRouteHandled;
      const formRouteHandled = await formRoute({ req, res, p, method, url });
      if (formRouteHandled !== NEXT_ROUTE) return formRouteHandled;
      const workflowHookHandled = await workflowHookRoute({ req, p, method, url, json });
      if (workflowHookHandled !== NEXT_ROUTE) return workflowHookHandled;
      const countdownRouteHandled = await countdownRoute({ res, p, method, url });
      if (countdownRouteHandled !== NEXT_ROUTE) return countdownRouteHandled;
      const emailTrackHandled = await emailTrackRoute({ res, p, method });
      if (emailTrackHandled !== NEXT_ROUTE) return emailTrackHandled;
      const linkRouteHandled = await linkRoute({ res, p, method });
      if (linkRouteHandled !== NEXT_ROUTE) return linkRouteHandled;
      const pageRouteHandled = await pageRoute({ req, res, p, method, url, json, send, goTo });
      if (pageRouteHandled !== NEXT_ROUTE) return pageRouteHandled;
      throw error('Page not found.',404);
    } catch(e) {
      if (!e.status) console.error(e.message);
      if (!res.headersSent && e.publicAccount && !p.startsWith('/api/')) {
        return send(e.status, 'text/html; charset=utf-8', req.method === 'HEAD' ? undefined :
          `<!doctype html><html lang="pt-BR"><meta charset="utf-8"><title>Conteúdo indisponível</title><main><h1>${e.message}</h1><p>Entre em contato com o responsável pela publicação para saber mais.</p></main></html>`);
      }
      if (!res.headersSent) json({
        error: e.status ? e.message : 'The workspace could not complete this request.',
        ...(e.code === 'ACCOUNT_SUSPENDED' && { code: e.code, account: e.account }), ...(['FISCAL_REQUIRED', 'ACCOUNT_CHANGED', 'ACCOUNT_SIGNED_OUT'].includes(e.code) && { code: e.code }),
        ...(['PHONE_REQUIRED', 'AGENCY_BLOCKED', 'AGENCY_NOT_ACTIVE'].includes(e.code) && { code: e.code, billing: e.billing }),
        ...(['PHONE_TAKEN', 'VERIFY_OFF', 'ALREADY_VERIFIED', 'SIGNUP_CLOSED', 'NOT_INVITED'].includes(e.code) && { code: e.code })
      }, e.status || 500);
    }
  });
  server.on('close',()=>{ if (socialTimer) clearInterval(socialTimer); store.close(); });
  return {server,port,host,ready,backend:store.kind,scheduler:Boolean(socialTimer),purgeTrash};
}

if (process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  try {
    const store = supabaseFromEnv();
    const { server,port,host,ready,backend,scheduler } = makeServer(store ? { store } : {});
    await ready;
    server.listen(port,host,()=>{
      console.log(`Local workspace (${backend}): http://${host}:${server.address().port}/`);
      for (const line of startupLines({ backend, scheduler, dbPath: defaultDbPath })) console.log(line);
    });
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

let vercelApp = null;
export default async function handler(req, res) {
  if (!vercelApp) {
    const store = supabaseFromEnv();
    const instance = makeServer(store ? { store } : {});
    await instance.ready;
    vercelApp = instance.server;
  }
  vercelApp.emit('request', req, res);
}


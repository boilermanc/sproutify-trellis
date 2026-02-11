// AI Services
export {
  generateText,
  generateTicketDraft,
  generateCampaignCopy,
  generateSocialPost,
  sanitizePII,
  chatWithSage,
  generateEmailCopy,
} from './aiService';

// Email Services (Resend)
export {
  sendEmail,
  sendBatchEmails,
  sendWelcomeEmail,
  sendTicketResponseEmail,
} from './emailService';

// n8n Webhook Services
export {
  triggerWebhook,
  triggerProfileSync,
  triggerEmailCampaign,
  triggerTaskQueue,
  triggerSocialIntent,
} from './n8nService';

// Slack Services
export {
  sendSlackMessage,
  sendDLQAlert,
  sendTicketAlert,
  sendCampaignNotification,
} from './slackService';

// Twilio Services (SMS/Voice)
export {
  sendSms,
  makeCall,
  sendTicketSmsNotification,
  sendOrderConfirmationSms,
  sendAppointmentReminder,
} from './twilioService';

// Secrets Service
export { fetchSecrets, saveSecrets } from './secretsService';

// Social Services
export {
  saveCredential,
  checkConnections,
  disconnectPlatform,
  publishToSocial,
  ingestSocialSignal,
  fetchSocialSignals,
  updateSignalStatus,
  linkProfileToSocial,
} from './socialService';

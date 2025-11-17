/* eslint-disable */
// @ts-nocheck - Duplicate exports from multiple modules
/**
 * Communication Modules
 *
 * Send messages via email, chat platforms, and notifications
 * - Email (Resend)
 * - Slack
 * - Discord
 * - Telegram
 * - Twilio (SMS, MMS, Voice, WhatsApp)
 * - WhatsApp Business API
 * - OneSignal (Push Notifications)
 * - Firebase Cloud Messaging
 * - Zendesk (Support Tickets)
 * - Freshdesk (Help Desk)
 * - Intercom (Customer Messaging)
 */

export * from './email';
// @ts-ignore - slack exports addReaction and sendText which may conflict
export * from './slack';
// @ts-ignore - discord exports sendMessage which may conflict
export * from './discord';
export * from './telegram';
// @ts-ignore - twilio exports MessageStatus and getMessageStatus which may conflict
export * from './twilio';
// @ts-ignore - whatsapp exports SendMessageOptions which may conflict
export * from './whatsapp';
// @ts-ignore - onesignal exports multiple types that may conflict
export * from './onesignal';
export * from './firebase';
// @ts-ignore - zendesk exports multiple types that may conflict
export * from './zendesk';
// @ts-ignore - freshdesk exports multiple types that may conflict
export * from './freshdesk';
export * from './intercom';
// @ts-ignore - mailchimp exports multiple types that may conflict
export * from './mailchimp';
// @ts-ignore - microsoft-teams exports multiple types that may conflict
export * from './microsoft-teams';

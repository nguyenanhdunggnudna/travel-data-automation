import { google } from 'googleapis';

import 'dotenv/config';
import { GoogleService } from '@modules/google/google';
import { LoggerService } from 'src/logger/logger';

export interface MailItem {
  messageId: string;
  orderId: string;
  receivedAt: string;
}
export class EmailService {
  constructor(
    private readonly googleService: GoogleService,
    private readonly loggerService: LoggerService
  ) {}
  async getAllTripComOrderIds(): Promise<MailItem[]> {
    const auth = await this.googleService.authorize();
    const gmail = google.gmail({ version: 'v1', auth });

    const resList = await gmail.users.messages.list({
      userId: 'me',
      maxResults: 30,
      q: 'is:unread subject:"Trip.com ANT" -label:PENDING -label:DONE -label:FAILED'
    });

    const messages = resList.data.messages;
    if (!messages || messages.length === 0) return [];

    const result = [];

    for (const msg of messages) {
      const resMsg = await gmail.users.messages.get({
        userId: 'me',
        id: msg.id!,
        format: 'metadata',
        metadataHeaders: ['Subject']
      });

      const subject = resMsg.data.payload?.headers?.find(
        (h: any) => h.name === 'Subject'
      )?.value;

      const internalDate = resMsg.data.internalDate;

      this.loggerService.info(`Gmail received date: ${internalDate}`);

      const receivedAt = internalDate
        ? new Date(parseInt(internalDate, 10)).toISOString().split('T')[0]
        : new Date().toISOString().split('T')[0];

      if (!subject) continue;

      const match = subject.match(/\b\d{16}\b/);
      if (!match) continue;

      result.push({
        messageId: msg.id!,
        orderId: match[0],
        receivedAt
      });
    }

    return result;
  }

  async getAllKKdayOrderIds(): Promise<MailItem[]> {
    const auth = await this.googleService.authorize();
    const gmail = google.gmail({ version: 'v1', auth });

    const resList = await gmail.users.messages.list({
      userId: 'me',
      maxResults: 50,
      q: 'is:unread -label:PENDING -label:DONE -label:FAILED (subject:"You have a new order" OR subject:"You have a new message about Booking ID:")'
    });

    const messages = resList.data.messages ?? [];
    const result: MailItem[] = [];

    for (const msg of messages) {
      const resMsg = await gmail.users.messages.get({
        userId: 'me',
        id: msg.id!,
        format: 'metadata',
        metadataHeaders: ['Subject']
      });

      const subject = resMsg.data.payload?.headers?.find(
        (h: any) => h.name === 'Subject'
      )?.value;

      if (!subject) continue;

      const internalDate = resMsg.data.internalDate;

      this.loggerService.info(`Gmail received date: ${internalDate}`);

      const receivedAt = internalDate
        ? new Date(parseInt(internalDate, 10)).toISOString().split('T')[0]
        : new Date().toISOString().split('T')[0];

      const match = subject.match(/Booking ID:\s*([A-Za-z0-9]+)/i);
      if (!match) continue;

      result.push({ messageId: msg.id!, orderId: match[1], receivedAt });
    }

    return result;
  }
}

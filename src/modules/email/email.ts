import { gmail_v1, google } from 'googleapis';

import 'dotenv/config';
import { GoogleService } from '@modules/google/google';
import { LoggerService } from 'src/logger/logger';

export interface MailItem {
  messageId: string;
  orderId: string;
  receivedAt: string;
}
export class EmailService {
  private readonly START_DATE = '2025/12/23';

  constructor(
    private readonly kkDayGoogleService: GoogleService,
    private readonly tripComGoogleService: GoogleService,
    private readonly loggerService: LoggerService
  ) {}

  async getAllTripComOrderIds(): Promise<MailItem[]> {
    const auth = await this.tripComGoogleService.authorize();
    const gmail = google.gmail({ version: 'v1', auth });

    const resList = await gmail.users.messages.list({
      userId: 'me',
      maxResults: 50,
      q: `subject:"Trip.com ANT" -label:PENDING -label:DONE -label:FAILED after:${this.START_DATE}`
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
        (h: gmail_v1.Schema$MessagePartHeader) => h.name === 'Subject'
      )?.value;

      const internalDate = resMsg.data.internalDate;

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
    const auth = await this.kkDayGoogleService.authorize();
    const gmail = google.gmail({ version: 'v1', auth });

    const resList = await gmail.users.messages.list({
      userId: 'me',
      maxResults: 50,
      q: `-label:PENDING -label:DONE -label:FAILED (subject:"You have a new order") after:${this.START_DATE}`
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
        (h: gmail_v1.Schema$MessagePartHeader) => h.name === 'Subject'
      )?.value;

      if (!subject) continue;

      const internalDate = resMsg.data.internalDate;

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

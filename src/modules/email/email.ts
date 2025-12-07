import { google } from 'googleapis';

import 'dotenv/config';
import { GoogleService } from '@modules/google/google';

export class EmailService {
  constructor(private readonly googleService: GoogleService) {}
  async getAllOrderIds(): Promise<string[]> {
    const auth = await this.googleService.authorize();

    const gmail = google.gmail({ version: 'v1', auth });

    const resList = await gmail.users.messages.list({
      userId: 'me',
      maxResults: 1,
      q: 'subject:"Trip.com ANT" is:unread'
    });

    const messages = resList.data.messages;
    if (!messages || messages.length === 0) return [];

    const orderIds: string[] = [];

    for (const msg of messages) {
      const resMsg = await gmail.users.messages.get({
        userId: 'me',
        id: msg.id!,
        format: 'full'
      });

      await gmail.users.messages.modify({
        userId: 'me',
        id: msg.id!,
        requestBody: {
          removeLabelIds: ['UNREAD']
        }
      });

      const headers = resMsg.data.payload?.headers || [];
      const subjectHeader = headers.find((h: any) => h.name === 'Subject');

      if (!subjectHeader?.value) continue;

      const match = subjectHeader.value.match(/\b\d{16}\b/);
      if (match) {
        orderIds.push(match[0]);
      }
    }

    return orderIds;
  }

  async RunCrawlMailData(): Promise<void> {
    const orderIds = await this.getAllOrderIds();
    if (orderIds.length === 0) {
      return;
    }
  }
}

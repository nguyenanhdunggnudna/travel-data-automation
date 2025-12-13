import { google, gmail_v1 } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';

export class LabelService {
  private gmail: gmail_v1.Gmail;

  constructor(auth: OAuth2Client) {
    this.gmail = google.gmail({ version: 'v1', auth });
  }

  async getOrCreateLabel(labelName: string): Promise<string> {
    const res = await this.gmail.users.labels.list({ userId: 'me' });
    const labels = res.data.labels || [];

    const existing = labels.find(
      (l: gmail_v1.Schema$Label) => l.name === labelName
    );
    if (existing?.id) return existing.id;

    const created = await this.gmail.users.labels.create({
      userId: 'me',
      requestBody: {
        name: labelName,
        labelListVisibility: 'labelShow',
        messageListVisibility: 'show'
      }
    });

    return created.data.id!;
  }

  async addLabel(messageId: string, labelId: string): Promise<void> {
    await this.gmail.users.messages.modify({
      userId: 'me',
      id: messageId,
      requestBody: {
        addLabelIds: [labelId]
      }
    });
  }

  async removeLabel(messageId: string, labelId: string): Promise<void> {
    await this.gmail.users.messages.modify({
      userId: 'me',
      id: messageId,
      requestBody: {
        removeLabelIds: [labelId]
      }
    });
  }
}

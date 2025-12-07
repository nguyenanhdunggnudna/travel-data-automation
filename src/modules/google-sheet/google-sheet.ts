import { google } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';

import { BookingDetail } from '@modules/tripcom/tripcom.types';
import { PLATFORM } from 'src/config/platform/platform.constant';

export class GoggleSheetService {
  async appendToGoogleSheet(
    auth: OAuth2Client,
    detail: BookingDetail,
    sheetId: string = process.env.GOOGLE_SHEET_ID || ''
  ): Promise<void> {
    try {
      const sheets = google.sheets({ version: 'v4', auth });

      const formatTime = (time?: string): string => time?.split(' ')[0] ?? '';

      const flightMissingFlag = !detail.airport ? '⚠️ Missing' : 'N/A';

      const row = [
        detail.dateOfUse || '',
        detail.flightNo,
        detail.time || formatTime(detail.flightInfo?.departureTimeScheduled),
        detail.name,
        detail.contact || '',
        detail.adults,
        detail.children,
        detail.airport,
        detail.platform || PLATFORM.TRIP_COM,
        detail.orderId,
        '',
        flightMissingFlag,
        detail.departure ? 'SEEOFF' : 'FAST TRACK',
        detail.arrival,
        detail.departure,
        detail.serviceType || ''
      ];

      await sheets.spreadsheets.values.append({
        spreadsheetId: sheetId,
        range: 'Sheet1!A:Z',
        valueInputOption: 'USER_ENTERED',
        requestBody: {
          values: [row]
        }
      });
    } catch (error) {
      throw new Error(`Error appending to Google Sheet: ${error}`);
    }
  }
}

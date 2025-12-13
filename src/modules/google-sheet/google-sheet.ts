import { google } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';

import { BookingDetail } from '@modules/tripcom/tripcom.types';
import { PLATFORM } from 'src/config/platform/platform.constant';

export class GoggleSheetService {
  async appendToGoogleSheet(
    auth: OAuth2Client,
    detail: BookingDetail,
    sheetId: string = process.env.GOOGLE_SHEET_ID || '',
    mail: string
  ): Promise<void> {
    try {
      let dateOfUse = '';
      const sheets = google.sheets({ version: 'v4', auth });

      const formatTime = (time?: string): string => time?.split(' ')[0] ?? '';

      const flightMissingFlag = !detail.airport ? '⚠️ Missing' : 'N/A';

      const service = detail.departure ? 'SEEOFF' : 'FAST TRACK';

      const time =
        detail.time || formatTime(detail.flightInfo?.departureTimeScheduled);

      if (detail.dateOfUse) {
        let parts: string[] = [];
        console.log('detail.dateOfUse: ', detail.dateOfUse);

        if (detail.dateOfUse.includes('-')) {
          parts = detail.dateOfUse.split('-'); // 2025-12-26
          if (parts.length === 3) {
            dateOfUse = `${parts[2]}/${parts[1]}`; // dd/MM
          }
        } else if (detail.dateOfUse.includes('/')) {
          parts = detail.dateOfUse.split('/'); // 26/12/2025
          if (parts.length === 3) {
            dateOfUse = `${parts[0]}/${parts[1]}`; // dd/MM
          }
        }
        console.log('dateOfUse: ', dateOfUse);
      }

      const row = [
        dateOfUse,
        detail.flightNo,
        time,
        detail.adults,
        detail.children || 0,
        detail.airport,
        detail.platform || PLATFORM.TRIP_COM,
        detail.orderId,
        detail.name,
        detail.contact || '',
        service,
        flightMissingFlag,
        '',
        detail.arrival,
        detail.departure,
        detail.serviceType || '',
        detail.bookingDate,
        `${service} / ${detail.dateOfUse} / ${time} / ${detail.flightNo}`,
        mail
      ];

      const res = await sheets.spreadsheets.values.append({
        spreadsheetId: sheetId,
        range: 'Sheet1!A:Z',
        valueInputOption: 'USER_ENTERED',
        requestBody: {
          values: [row]
        }
      });

      const updatedRange = res.data.updates?.updatedRange;

      if (!updatedRange) return;

      const hasArrival = detail.arrival === 'Arrival';
      const hasDeparture = detail.departure === 'Departure';

      if (!(hasArrival || hasDeparture)) return;

      const read = await sheets.spreadsheets.values.get({
        spreadsheetId: sheetId,
        range: 'Sheet1!A:Z'
      });

      const rows = read.data.values || [];

      const matchedRows: any = [];
      // eslint-disable-next-line @typescript-eslint/typedef
      rows.forEach((r, idx) => {
        if (r[9] === detail.orderId) {
          matchedRows.push(idx + 1);
        }
      });

      if (matchedRows.length >= 2) {
        const requests = matchedRows.map((r: any) => ({
          repeatCell: {
            range: {
              sheetId: 0,
              startRowIndex: r - 1,
              endRowIndex: r,
              startColumnIndex: 0,
              endColumnIndex: 16
            },
            cell: {
              userEnteredFormat: {
                backgroundColor: { red: 1, green: 0.95, blue: 0.6 }
              }
            },
            fields: 'userEnteredFormat.backgroundColor'
          }
        }));

        await sheets.spreadsheets.batchUpdate({
          spreadsheetId: sheetId,
          requestBody: { requests }
        });
      }
    } catch (error) {
      throw new Error(`Error appending to Google Sheet: ${error}`);
    }
  }
}

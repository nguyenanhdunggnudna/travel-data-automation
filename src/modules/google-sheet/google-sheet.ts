import { google } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';

import { BookingDetail } from '@modules/tripcom/tripcom.types';
import { PLATFORM } from 'src/config/platform/platform.constant';

export class GoggleSheetService {
  private normalizeDate = (input?: string): string => {
    if (!input) return '';

    // yyyy-MM-dd or yyyy-MM-dd HH:mm
    if (/^\d{4}-\d{2}-\d{2}/.test(input)) {
      return input.split(' ')[0];
    }

    // dd/MM/yyyy
    if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(input)) {
      const [dd, mm, yyyy] = input.split('/');
      return `${yyyy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`;
    }

    // dd Month yyyy (10 January 2026)
    const m = input.match(/(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})/);
    if (m) {
      const [, d, mon, y] = m;
      const monthMap: Record<string, string> = {
        january: '01',
        february: '02',
        march: '03',
        april: '04',
        may: '05',
        june: '06',
        july: '07',
        august: '08',
        september: '09',
        october: '10',
        november: '11',
        december: '12'
      };

      const mm = monthMap[mon.toLowerCase()];
      if (mm) return `${y}-${mm}-${d.padStart(2, '0')}`;
    }

    return '';
  };

  private todayVN = (): string =>
    new Date().toLocaleDateString('en-CA', {
      timeZone: 'Asia/Ho_Chi_Minh'
    });

  private async getSheetHeaders(
    sheets: any,
    sheetId: string
  ): Promise<string[]> {
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: sheetId,
      range: 'Sheet1!1:1'
    });

    return (res.data.values?.[0] || []).map((h: any) =>
      h.toString().trim().toUpperCase()
    );
  }

  async sortByDateOfUse(sheets: any, sheetId: string): Promise<void> {
    const headers = await this.getSheetHeaders(sheets, sheetId);
    const dateIndex = headers.indexOf('DATE OF USE');
    if (dateIndex === -1) return;

    const sheetIdNum = await this.getSheetId(sheets, sheetId);

    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: sheetId,
      requestBody: {
        requests: [
          {
            sortRange: {
              range: {
                sheetId: sheetIdNum,
                startRowIndex: 1
              },
              sortSpecs: [
                {
                  dimensionIndex: dateIndex,
                  sortOrder: 'ASCENDING'
                }
              ]
            }
          }
        ]
      }
    });
  }

  async isBookingExists(
    auth: OAuth2Client,
    bookingId: string,
    sheetId: string = process.env.GOOGLE_SHEET_ID || ''
  ): Promise<boolean> {
    const sheets = google.sheets({ version: 'v4', auth });

    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: sheetId,
      range: 'Sheet1!A:Z'
    });

    const rows = res.data.values || [];
    if (rows.length < 2) return false;

    const headers = rows[0].map((h: string) =>
      h.toString().trim().toUpperCase()
    );

    const idIndex = headers.indexOf('ID BOOKING');
    if (idIndex === -1) return false;

    for (const row of rows.slice(1)) {
      const val = row[idIndex];
      if (!val) continue;

      if (val.replace(/^'/, '') === bookingId) {
        return true;
      }
    }

    return false;
  }

  private async getSheetId(
    sheets: any,
    spreadsheetId: string,
    sheetName = 'Sheet1'
  ): Promise<number> {
    const res = await sheets.spreadsheets.get({ spreadsheetId });
    const sheet = res.data.sheets?.find(
      (s: any) => s.properties?.title === sheetName
    );
    return sheet?.properties?.sheetId ?? 0;
  }

  async appendToGoogleSheet(
    auth: OAuth2Client,
    detail: BookingDetail,
    sheetId: string = process.env.GOOGLE_SHEET_ID || '',
    mail?: string
  ): Promise<void> {
    try {
      const sheets = google.sheets({ version: 'v4', auth });

      const formatTime = (time?: string): string => time?.split(' ')[0] ?? '';

      const flightMissingFlag = !detail.airport ? '⚠️ Missing' : 'N/A';

      const service = detail.departure ? 'SEEOFF' : 'FAST TRACK';

      const prices = detail.prices || {};

      const priceVND = prices['VND'] ?? '';
      const priceUSD = prices['USD'] ?? '';
      const priceKRW = prices['KRW'] ?? '';

      const bookingDay = this.normalizeDate(detail.bookingDate);
      const useDay = this.normalizeDate(detail.dateOfUse);
      const today = this.todayVN();

      const urgent =
        bookingDay && useDay && bookingDay === useDay && bookingDay === today
          ? '🚨 URGENT'
          : '';

      const time =
        detail.time || formatTime(detail.flightInfo?.departureTimeScheduled);

      const headers = await this.getSheetHeaders(sheets, sheetId);

      const dataMap: Record<string, any> = {
        PREMIUM: detail.serviceType ? 'PRE' : '',

        'DATE OF USE': `=DATEVALUE("${this.normalizeDate(detail.dateOfUse)}")`,

        URGENT: urgent,

        FLIGHT: detail.flightNo,

        TIME: time,

        'FLIGHT MISSING': flightMissingFlag,

        ADULT: detail.adults,

        CHILD: detail.children || 0,

        SERVICE: service,

        AIRPORT: detail.airport,

        'FLATFORMS (BOOKING)': detail.platform || PLATFORM.TRIP_COM,

        'ID BOOKING': `'${detail.orderId}`,

        NAME: detail.name,

        CONTACT: detail.contact || '',

        CHECK: '',

        NOTE: '',

        CANCELLED: '',

        ARRIVAL: detail.arrival,

        DEPARTURE: detail.departure,

        'BOOKING DATE': this.normalizeDate(detail.bookingDate),

        SUMMARY: '',

        VND: priceVND,

        USD: priceUSD,

        KWR: priceKRW,

        MAIL: mail
      };

      const row = headers.map((h: any) => dataMap[h] ?? '');

      // await sheets.spreadsheets.values.append({
      //   spreadsheetId: sheetId,
      //   range: 'Sheet1!A:Z',
      //   valueInputOption: 'USER_ENTERED',
      //   requestBody: {
      //     values: [row]
      //   }
      // });

      await sheets.spreadsheets.values.append({
        spreadsheetId: sheetId,
        range: 'Sheet1!A1',
        valueInputOption: 'USER_ENTERED',
        insertDataOption: 'INSERT_ROWS',
        requestBody: {
          values: [row]
        }
      });
    } catch (error) {
      throw new Error(`Error appending to Google Sheet: ${error}`);
    }
  }
}

import { google } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';

import { BookingDetail } from '@modules/tripcom/tripcom.types';
import { PLATFORM } from 'src/config/platform/platform.constant';

export class GoggleSheetService {
  private normalizeDate = (input?: string): string => {
    if (!input) return '';

    // yyyy-mm-dd or yyyy-mm-dd HH:mm
    if (input.includes('-')) {
      return input.split(' ')[0];
    }

    // dd/MM/yyyy
    if (input.includes('/')) {
      const [dd, mm, yyyy] = input.split('/');
      if (yyyy) return `${yyyy}-${mm}-${dd}`;
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

  async appendToGoogleSheet(
    auth: OAuth2Client,
    detail: BookingDetail,
    sheetId: string = process.env.GOOGLE_SHEET_ID || '',
    mail?: string
  ): Promise<void> {
    try {
      let dateOfUse = '';

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

      const serviceLabel = detail.serviceType ? `${service} PRE` : service;

      const pax =
        detail.adults || detail.children
          ? `${detail.adults ? `${detail.adults}NL` : ''}${
              detail.children ? ` +${detail.children}TE` : ''
            }`
          : '';

      if (detail.dateOfUse) {
        let parts: string[] = [];
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
      }

      const nameInline = (detail.name || '').replace(/\s*\n\s*/g, ' ').trim();

      const summaryParts = [
        serviceLabel,
        dateOfUse,
        detail.flightNo,
        time,
        pax,
        detail.airport,
        nameInline
      ].filter(
        (v: string | undefined): v is string =>
          typeof v === 'string' && v.trim() !== ''
      );

      const summary = summaryParts.join('/ ');

      const headers = await this.getSheetHeaders(sheets, sheetId);

      const dataMap: Record<string, any> = {
        PREMIUM: detail.serviceType ? 'PRE' : '',

        'DATE OF USE': dateOfUse,

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

        'BOOKING DATE': detail.bookingDate,

        SUMMARY: summary,

        VND: priceVND,

        USD: priceUSD,

        KWR: priceKRW,

        MAIL: mail
      };

      const row = headers.map((h: any) => dataMap[h] ?? '');

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

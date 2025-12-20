import { GoggleSheetService } from '@modules/google-sheet/google-sheet';
import { GoogleService } from '@modules/google/google';
import { BookingDetail } from '@modules/tripcom/tripcom.types';
import { gmail_v1, google } from 'googleapis';
import path from 'path';
import fs from 'fs';

import { Page } from 'puppeteer';
import { BrowserService } from '@modules/broswer/broswer';
import { PLATFORM } from 'src/config/platform/platform.constant';
import { fetchFlightInfoSmart } from '@modules/flight/flight';
import { LoggerService } from 'src/logger/logger';

interface FinalRecord {
  orderId: string;
  flightNo: string;
  name: string;
  dateOfUse: string;
  adults: number;
  children: number;
  contact: string;
  serviceType: string;
  bookingDate: string;
  prices: Record<string, number>;
  arrival?: 'Arrival';
  departure?: 'Departure';
  platform?: string;
  airport?: string;
  time?: string;
}

interface FlightSide {
  flightNo: string;
  date: string;
  time: string;
}

interface FlightDetail {
  bookingId: string;
  arrival: FlightSide;
  departure: FlightSide;
  contact: string;
  serviceType: string;
  name: string;
  dateOfUse: string;
  adults: number;
  child: number;
  prices: Record<string, number>;
}

export class KKdayCrawler {
  private cookiePath = path.join(
    process.cwd(),
    'cookies/kkday/kkday_cookies.json'
  );

  constructor(
    private readonly googleSheet: GoggleSheetService,
    private readonly googleService: GoogleService,
    private readonly browserService: BrowserService,
    private readonly loggerService: LoggerService
  ) {}

  async initBrowser(): Promise<Page> {
    const page = await this.browserService.newPage('KKDAY');
    return page;
  }

  async saveCookies(page: Page): Promise<void> {
    const cookies = await page.cookies();

    const dir = path.dirname(this.cookiePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    fs.writeFileSync(this.cookiePath, JSON.stringify(cookies, null, 2));
  }

  async loadCookies(page: Page): Promise<boolean> {
    if (!fs.existsSync(this.cookiePath)) return false;

    const cookies = JSON.parse(fs.readFileSync(this.cookiePath, 'utf-8'));

    if (!cookies.length) return false;

    await page.setCookie(...cookies);

    return true;
  }

  async gotoLoginPage(page: Page): Promise<void> {
    await page.goto('https://scm.kkday.com/v1/en/auth/login', {
      waitUntil: 'networkidle2'
    });

    const loginBtn = await page.waitForSelector('#loginBtn', {
      visible: true
    });
    if (!loginBtn) {
      throw new Error('Không tìm thấy nút login trên trang KKDAY');
    }

    await loginBtn.click();
    await page.waitForNavigation({ waitUntil: 'networkidle2' });
  }

  async fillLoginForm(
    email: string,
    password: string,
    page: Page
  ): Promise<void> {
    await page.select('select', 'EN');

    if (!email || !password)
      throw new Error('Vui lòng cung cấp email và password KKDAY');

    const emailInput = await page.waitForSelector('input[type="email"]', {
      visible: true
    });
    if (!emailInput)
      throw new Error('Không tìm thấy input email trên trang login');
    await emailInput.type(email, { delay: 100 });

    const passInput = await page.waitForSelector('input[type="password"]', {
      visible: true
    });
    if (!passInput)
      throw new Error('Không tìm thấy input password trên trang login');
    await passInput.type(password, { delay: 100 });

    const rememberLabel = await page.$('label.checkbox-button-label');
    if (rememberLabel) {
      await rememberLabel.evaluate((el: Element) =>
        el.scrollIntoView({ block: 'center' })
      );
      await rememberLabel.evaluate((el: HTMLElement) => el.click());
    }
  }

  async submitLogin(page: Page): Promise<void> {
    await page.waitForSelector(
      'div.panel-confirm-button > button.ant-btn-primary',
      {
        visible: true,
        timeout: 10000
      }
    );

    await page.evaluate(() => {
      const btn = document.querySelector(
        'div.panel-confirm-button > button.ant-btn-primary'
      ) as HTMLElement | null;
      if (!btn) throw new Error('Login button không tìm thấy');
      btn.scrollIntoView({ block: 'center' });
      btn.click();
    });

    try {
      await page.waitForNavigation({
        waitUntil: 'networkidle2',
        timeout: 10000
      });
    } catch {
      //
    }
  }

  async getLatestVerificationCode(): Promise<string | null> {
    const body = await this.getLatestEmailBody('KKday Login Verification Code');
    if (!body) return null;

    const match = body.match(/verification code is (\d{6})/i);
    return match ? match[1] : null;
  }

  async fillVerificationCode(code: string, page: Page): Promise<void> {
    const input = await page.waitForSelector('input[type="text"]', {
      visible: true,
      timeout: 10000
    });
    if (!input) throw new Error('Không tìm thấy input verification code');
    await input.type(code, { delay: 100 });

    await page.evaluate(() => {
      const label = document.querySelector(
        'label.checkbox-button-label'
      ) as HTMLElement | null;
      if (label) {
        label.scrollIntoView({ block: 'center' });
        label.click();
      }
    });

    const confirmBtn = await page.waitForSelector(
      'div.panel-confirm-button > button.ant-btn-primary',
      {
        visible: true,
        timeout: 10000
      }
    );
    if (!confirmBtn) throw new Error('Không tìm thấy button Confirm');

    await confirmBtn.evaluate((el: Element) =>
      el.scrollIntoView({ block: 'center' })
    );
    await confirmBtn.click();

    try {
      await page.waitForNavigation({
        waitUntil: 'networkidle2',
        timeout: 10000
      });
    } catch {
      //
    }
  }

  async runLoginFlow(
    email: string,
    password: string,
    page: Page
  ): Promise<Page> {
    await page.goto('https://scm.kkday.com/v1/en/auth/login', {
      waitUntil: 'networkidle2'
    });

    const hasCookie = await this.loadCookies(page);

    if (!hasCookie || page.url().includes('auth/login')) {
      await this.gotoLoginPage(page);
      await this.fillLoginForm(email, password, page);
      await this.submitLogin(page);

      const code = await this.getLatestVerificationCode();
      if (!code) {
        throw new Error('Không tìm thấy verification code trong Gmail');
      }

      await this.fillVerificationCode(code, page);
      await this.saveCookies(page);
    }

    return page;
  }

  // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
  private extractDateTime(dateTime: string) {
    const [date = '', time = ''] = dateTime.replace(/\u00a0/, ' ').split(' ');
    return { date, time };
  }

  // ---------- MAIL PARSER ----------
  async getLatestEmailBody(subject: string): Promise<string | null> {
    const delay = (ms: number): Promise<void> =>
      new Promise<void>((resolve: () => void) => {
        setTimeout(resolve, ms);
      });

    await delay(30000);

    const auth = await this.googleService.authorize();
    const gmail = google.gmail({ version: 'v1', auth });

    const list = await gmail.users.messages.list({
      userId: 'me',
      q: `subject:"${subject}" is:unread`,
      maxResults: 50
    });

    const msg = list.data.messages?.[0];

    if (!msg) return null;

    const msgId = msg.id;
    if (!msgId) return null;

    const full = await gmail.users.messages.get({
      userId: 'me',
      id: msg.id!,
      format: 'full'
    });

    await gmail.users.messages.modify({
      userId: 'me',
      id: msgId,
      requestBody: {
        removeLabelIds: ['UNREAD']
      }
    });

    const part =
      full.data.payload?.parts?.find(
        (p: gmail_v1.Schema$MessagePart) =>
          p.mimeType === 'text/html' || p.mimeType === 'text/plain'
      ) ?? full.data.payload;

    if (!part?.body?.data) return null;

    return Buffer.from(part.body.data, 'base64').toString('utf8');
  }

  private async saveToSheet(data: BookingDetail, mail: string): Promise<void> {
    const auth = await this.googleService.authorize();
    await this.googleSheet.appendToGoogleSheet(
      auth,
      data,
      process.env.GOOGLE_SHEET_ID!,
      mail
    );
  }

  async crawlOrderDetail(bookingId: string, page: Page): Promise<FlightDetail> {
    const url = `https://scm.kkday.com/v1/en/order/index/${bookingId}`;
    await page.goto(url, {
      waitUntil: 'domcontentloaded',
      timeout: 30000
    });

    await page.waitForSelector('#info_type3', {
      visible: true,
      timeout: 15000
    });

    return await page.evaluate((bId: string) => {
      // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
      const extractDateTime = (dt: string) => {
        const parts = dt
          .replace(/\u00a0/g, ' ')
          .trim()
          .split(' ');
        return {
          date: parts[0] ?? '',
          time: parts[1] ?? ''
        };
      };

      const result: FlightDetail = {
        bookingId: bId,
        arrival: { flightNo: '', date: '', time: '' },
        departure: { flightNo: '', date: '', time: '' },
        contact: '',
        serviceType: '',
        name: '',
        dateOfUse: '',
        adults: 0,
        child: 0,
        prices: {}
      };

      const airlineSection = document.querySelector('#info_type3');
      if (!airlineSection) return result;

      const flightDivs = Array.from(
        airlineSection.querySelectorAll('div.col-md-6')
      );

      flightDivs.forEach((div: Element) => {
        const title = div.querySelector('h4.area-title')?.textContent?.trim();
        if (!title) return;

        let flightNo = '';
        let dateTime = '';

        div.querySelectorAll('ul.info-list > li').forEach((li: Element) => {
          const label = li
            .querySelector('.info-list-title')
            ?.textContent?.trim();
          const value = li
            .querySelector('.info-list-text')
            ?.textContent?.trim();
          if (!label || !value) return;

          if (label.includes('Flight no.')) flightNo = value;
          if (label.includes('Date &')) dateTime = value;
        });

        const { date, time } = extractDateTime(dateTime);

        if (title.includes('Arrival')) {
          result.arrival = { flightNo, date, time };
        } else if (title.includes('Departure')) {
          result.departure = { flightNo, date, time };
        }
      });

      // fallback date of use
      const dateValueEl = document.querySelector('.order-date-value-01');
      if (dateValueEl) {
        result.dateOfUse = dateValueEl.textContent?.trim() ?? '';
      }

      // contact
      const phoneEl = Array.from(
        document.querySelectorAll('p.info-sub-list')
      ).find((p: Element) => p.textContent?.includes("Buyer's Phone Number"));

      if (phoneEl) {
        const m = phoneEl.textContent?.match(/Buyer's Phone Number：(.+)/);
        result.contact = m ? m[1].trim() : '';
      }

      // service type
      const vipEl = Array.from(document.querySelectorAll('div.text-sm')).find(
        (el: Element) => el.textContent?.includes('VIP Fast Track')
      );
      if (vipEl && vipEl.textContent?.includes('[PREMIUM]')) {
        result.serviceType = 'PREMIUM';
      }

      // travelers
      const travelerBoxes = document.querySelectorAll(
        '#info_type1 .box-primary'
      );
      const names: string[] = [];

      travelerBoxes.forEach((box: Element) => {
        let sur = '';
        let first = '';

        box.querySelectorAll('.info-list li').forEach((li: Element) => {
          const label = li.childNodes[0]?.textContent?.trim() ?? '';
          const value =
            li.querySelector('.pull-right b')?.textContent?.trim() ?? '';

          if (label.includes('Passport Surname')) sur = value;
          if (label.includes('Passport First Name')) first = value;
        });

        const full = `${sur} ${first}`.trim();
        if (full) names.push(full);
      });

      result.name = names.join('\n');

      // pax
      document.querySelectorAll('p.info-sub-list').forEach((el: Element) => {
        const txt = el.textContent ?? '';
        if (txt.includes('Adult')) {
          const m = txt.match(/Adult X (\d+)/);
          if (m) result.adults = Number(m[1]);
        }
        if (txt.includes('Child')) {
          const m = txt.match(/Child X (\d+)/);
          if (m) result.child = Number(m[1]);
        }
      });

      // prices
      document.querySelectorAll('.widget-price').forEach((el: Element) => {
        const m = el.textContent?.match(/([A-Z]{3})\s*([\d,]+)/);
        if (!m) return;
        result.prices[m[1]] = Number(m[2].replace(/,/g, ''));
      });

      return result;
    }, bookingId);
  }

  async buildFullBookingInfo(
    flightDetail: FlightDetail,
    bookingDate: string
  ): Promise<FinalRecord[]> {
    const result: FinalRecord[] = [];

    const common = {
      orderId: flightDetail.bookingId,
      name: flightDetail.name,
      adults: flightDetail.adults,
      children: flightDetail.child,
      contact: `="${flightDetail.contact}"`,
      serviceType: flightDetail.serviceType,
      bookingDate,
      prices: flightDetail.prices
    };

    // ARRIVAL
    if (flightDetail.arrival.flightNo) {
      const info = await fetchFlightInfoSmart(
        flightDetail.arrival.flightNo,
        false
      );

      result.push({
        ...common,
        flightNo: flightDetail.arrival.flightNo,
        arrival: 'Arrival',
        airport: info.airport,
        time: info.time,
        dateOfUse: flightDetail.arrival.date || flightDetail.dateOfUse || '',
        platform: PLATFORM.KKDAY
      });
    }

    // DEPARTURE
    if (flightDetail.departure.flightNo) {
      const info = await fetchFlightInfoSmart(
        flightDetail.departure.flightNo,
        true
      );

      result.push({
        ...common,
        flightNo: flightDetail.departure.flightNo,
        departure: 'Departure',
        airport: info.airport,
        time: info.time,
        dateOfUse: flightDetail.departure.date || flightDetail.dateOfUse || '',
        platform: PLATFORM.KKDAY
      });
    }

    return result;
  }

  async kkdayCrawl(
    orderId: string,
    page: Page,
    bookingDate: string
  ): Promise<void> {
    const flightDetail = await this.crawlOrderDetail(orderId, page);

    if (!orderId) return;

    const records = await this.buildFullBookingInfo(flightDetail, bookingDate);

    for (const r of records) {
      await this.saveToSheet(r, 'timehouse@');
    }
  }
}

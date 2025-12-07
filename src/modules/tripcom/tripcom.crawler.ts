import { Page, Frame } from 'puppeteer';
import fs from 'fs';
import path from 'path';
import { setTimeout as delay } from 'timers/promises';
import {
  CRAWLER_INFORMATION,
  LOGIN_SELECTOR,
  ORDER_DETAIL_SELECTOR,
  REGEX,
  TRIP_COM_URL
} from './tripcom.constant';
import { BrowserService } from '@modules/broswer/broswer';
import { PLATFORM } from 'src/config/platform/platform.constant';
import { BookingDetail } from './tripcom.types';
import { fetchFlightInfoSmart } from '@modules/flight/flight';
import { GoggleSheetService } from '@modules/google-sheet/google-sheet';
import { GoogleService } from '@modules/google/google';

export class TripComCrawler {
  private isLoggedIn = false;

  constructor(
    private readonly browser: BrowserService,
    private readonly googleSheet: GoggleSheetService,
    private readonly googleService: GoogleService
  ) {}

  initTripComBrowser(): Promise<Page> {
    return this.browser.newPage(PLATFORM.TRIP_COM);
  }

  private async acceptCookiesOnce(page: Page): Promise<void> {
    const btn = await page.$('#onetrust-accept-btn-handler');
    if (btn) {
      await btn.click();
      await delay(800);
    }
  }

  async loginIfNeeded(page: Page): Promise<void> {
    if (this.isLoggedIn) return;

    const testUrl = TRIP_COM_URL.ORDER_DETAIL + 'test';

    await page.goto(testUrl, { waitUntil: 'networkidle2' });

    if (page.url().includes('login')) {
      await this.performLogin(page);
    }

    this.isLoggedIn = true;
  }

  private async switchLanguageToEnglish(page: Page): Promise<void> {
    await this.acceptCookiesOnce(page);

    const langBtn = await page.$('.lang-switcher');
    if (!langBtn) return;

    await langBtn.click();
    await delay(800);

    const enBtn = await page.$('li[data-menu-id*="en-US"]');
    if (enBtn) {
      await enBtn.click();
      await delay(800);
    }
  }

  async performLogin(page: Page): Promise<void> {
    const username = process.env.TRIPCOM_USERNAME!;
    const password = process.env.TRIPCOM_PASSWORD!;

    const COOKIE_PATH = path.join(
      process.cwd(),
      '/cookies/tripcom/tripcom_cookies.json'
    );

    if (!username || !password) {
      throw new Error('TRIPCOM_USERNAME / TRIPCOM_PASSWORD not found!');
    }

    await page.goto(TRIP_COM_URL.LOGIN, { waitUntil: 'networkidle2' });
    await delay(1500);

    await this.switchLanguageToEnglish(page);
    await delay(1500);

    const loginFrame: Frame | Page =
      page
        .frames()
        .find(
          (f: Frame) =>
            f.url().includes('login') ||
            f.name().toLowerCase().includes('login')
        ) ?? page;

    await loginFrame.waitForSelector(LOGIN_SELECTOR.USERNAME_SELECTOR, {
      visible: true,
      timeout: 20000
    });

    await loginFrame.waitForSelector(LOGIN_SELECTOR.PASSWORD_SELECTOR, {
      visible: true,
      timeout: 21000
    });

    await loginFrame.type(LOGIN_SELECTOR.USERNAME_SELECTOR, username, {
      delay: 100
    });
    await loginFrame.type(LOGIN_SELECTOR.PASSWORD_SELECTOR, password, {
      delay: 150
    });

    const agreeExists = await page.$(LOGIN_SELECTOR.AGREE_CHECKBOX_SELECTOR);

    if (agreeExists) {
      // eslint-disable-next-line @typescript-eslint/typedef
      await page.evaluate((LOGIN_SELECTOR) => {
        const el = document.querySelector(
          LOGIN_SELECTOR.AGREE_CHECKBOX_SELECTOR
        ) as HTMLElement | null;
        if (el) el.click();

        const loginBtn = document.querySelector(
          LOGIN_SELECTOR.LOGIN_BUTTON_SELECTOR
        ) as HTMLElement | null;
        if (loginBtn) loginBtn.click();
      }, LOGIN_SELECTOR);

      await delay(500);
    }

    await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 60000 });

    const cookieDir = path.dirname(COOKIE_PATH);
    if (!fs.existsSync(cookieDir)) {
      fs.mkdirSync(cookieDir, { recursive: true });
    }

    const cookies = await page.cookies();
    fs.writeFileSync(COOKIE_PATH, JSON.stringify(cookies, null, 2));
  }

  async crawlBookingDetail(
    page: Page,
    orderId: string
  ): Promise<BookingDetail> {
    const url = TRIP_COM_URL.ORDER_DETAIL + orderId;
    await page.goto(url, { waitUntil: 'networkidle2' });

    await page.waitForSelector('.ant-table', { timeout: 15000 });

    const detail: BookingDetail = await this.parseBookingDetail(page, orderId);

    return detail;
  }

  async parseBookingDetail(
    page: Page,
    orderId: string
  ): Promise<BookingDetail> {
    await page.waitForFunction(
      // eslint-disable-next-line @typescript-eslint/typedef
      (ORDER_DETAIL_SELECTOR) => {
        const table = document.querySelector(
          ORDER_DETAIL_SELECTOR.TRAVELER.TABLE_SELECTOR
        );

        if (!table) return false;

        return (
          table.querySelectorAll(
            ORDER_DETAIL_SELECTOR.TRAVELER.HIDDEN_ROW_SELECTOR
          ).length > 0
        );
      },
      { timeout: 20000 },
      ORDER_DETAIL_SELECTOR
    );

    const { rows, totalAdults, arrival, departure, airport } =
      await page.evaluate(
        // eslint-disable-next-line @typescript-eslint/typedef
        (ORDER_DETAIL_SELECTOR, REGEX, CRAWLER_INFORMATION) => {
          let arrival = '';
          let departure = '';
          let service = '';
          let airport;

          const table = document.querySelector(
            ORDER_DETAIL_SELECTOR.TRAVELER.TABLE_SELECTOR
          );

          if (!table)
            return {
              rows: [],
              totalAdults: 0,
              arrival: '',
              departure: '',
              airport
            };

          const trs = Array.from(
            table.querySelectorAll(ORDER_DETAIL_SELECTOR.TRAVELER.ROW_SELECTOR)
          );

          const rows: string[] = [];
          let totalAdults = 0;

          trs.forEach((tr: Element, index: number) => {
            if (tr.getAttribute('aria-hidden') === 'true') {
              return;
            }

            const cells = Array.from(tr.querySelectorAll('td'));
            if (cells.length === 0) return;

            if (index === 0) {
              service = cells[1].innerText.trim();

              const airportMatch = service.match(REGEX.AIRPORT_REGEX);
              airport = airportMatch ? airportMatch[0] : '';

              if (service.includes(CRAWLER_INFORMATION.DEPARTURE)) {
                departure = CRAWLER_INFORMATION.DEPARTURE;
              }
              if (service.includes(CRAWLER_INFORMATION.ARRIVAL)) {
                arrival = CRAWLER_INFORMATION.ARRIVAL;
              }
            }

            const customerCell: HTMLElement | null =
              index === 0 ? cells[2] : cells[1];
            if (!customerCell) return;

            const div = customerCell.querySelector(
              ORDER_DETAIL_SELECTOR.TRAVELER.CUSTOMER_NAME_DIV_SELECTOR
            );
            if (!div) return;

            const cloned = div.cloneNode(true) as HTMLElement;
            cloned.querySelectorAll('div').forEach((d: Element) => d.remove());
            cloned.querySelectorAll('span').forEach((s: Element) => s.remove());

            const name = cloned.textContent?.trim();
            if (!name) return;

            rows.push(name);

            const adults = customerCell.innerText.includes('Adults') ? 1 : 0;
            totalAdults += adults;
          });

          return { rows, totalAdults, arrival, departure, airport };
        },
        ORDER_DETAIL_SELECTOR,
        REGEX,
        CRAWLER_INFORMATION
      );

    const fullName = rows.join('\n');
    const adults = totalAdults;

    const { serviceType, contact } = await page.evaluate(() => {
      const titleEl = document.querySelector('.item_content_title');
      let serviceType = '';

      if (titleEl) {
        const text = titleEl.textContent?.trim() || '';

        if (text.includes('[PREMIUM]')) {
          serviceType = 'PREMIUM';
        }
      }

      // Lấy Preferred Message App
      const messageLabel = Array.from(
        document.querySelectorAll('span.info_left')
      ).find((el: Element) =>
        el.textContent?.includes('Preferred Message App')
      );

      let contact = '';

      if (messageLabel) {
        contact = messageLabel.nextElementSibling?.textContent?.trim() || '';
      }

      return { serviceType, contact };
    });

    const flightNo = await page.evaluate(() => {
      const FLIGHT_REGEX = /[A-Z]{1,3}\s?\d{1,4}[A-Z]?/g;

      const label = Array.from(
        document.querySelectorAll('span.info_left')
      ).find((el: Element) => el.textContent?.trim() === 'Flight no.:');

      if (!label) return '';

      const text = label.nextElementSibling?.textContent ?? '';
      const match = text.match(FLIGHT_REGEX);

      return match ? match[0] : '';
    });

    const dateOfUse = await page.evaluate(() => {
      const dateCell = document.querySelector('td .two_line');
      return dateCell?.textContent?.trim() || '';
    });

    return {
      orderId,
      fullName,
      adults,
      children: 0,
      name: fullName,
      flightNo,
      arrival,
      departure,
      airport,
      serviceType,
      contact,
      dateOfUse
    };
  }

  async runCrawlTripCom(orderIds: string[], page: Page): Promise<void> {
    let flightInfo;
    for (const orderId of orderIds) {
      const detail = await this.crawlBookingDetail(page, orderId);

      if (detail.flightNo) {
        const isDeparture = detail.departure === 'Departure';
        flightInfo = await fetchFlightInfoSmart(detail.flightNo, isDeparture);
      }

      const googleAuth = await this.googleService.authorize();

      await this.googleSheet.appendToGoogleSheet(
        googleAuth,
        {
          ...detail,
          airport: flightInfo?.airport,
          time: flightInfo?.time
        },
        process.env.GOOGLE_SHEET_ID
      );
    }
  }
}

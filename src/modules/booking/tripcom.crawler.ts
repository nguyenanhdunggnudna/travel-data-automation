import puppeteer, { Browser, Page, Cookie, Frame } from 'puppeteer';
import fs from 'fs';
import path from 'path';
import { setTimeout as delay } from 'timers/promises';

const DETAIL_URL =
  'https://vbooking.ctrip.com/ticket_order/order/detail?orderId=';
const COOKIE_PATH = path.join(process.cwd(), 'tripcom_cookies.json');

export class TripcomCrawler {
  private browser: Browser | null = null;

  async initBrowser(headless = false): Promise<Browser> {
    if (this.browser) return this.browser;

    this.browser = await puppeteer.launch({
      headless,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    return this.browser;
  }

  async newPage(): Promise<Page> {
    const browser = await this.initBrowser();
    const page = await browser.newPage();

    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
        '(KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36'
    );

    if (fs.existsSync(COOKIE_PATH)) {
      const cookies: Cookie[] = JSON.parse(
        fs.readFileSync(COOKIE_PATH, 'utf8')
      );
      await page.setCookie(...cookies);
    }

    return page;
  }

  async loginIfNeeded(): Promise<void> {
    const page = await this.newPage();
    const testUrl = DETAIL_URL + 'test';
    await page.goto(testUrl, { waitUntil: 'networkidle2' });

    if (page.url().includes('login')) {
      await this.performLogin(page);
    } else {
      console.log('Already logged in with saved cookies.');
    }

    await page.close();
  }

  async switchLanguageToEnglish(page: Page): Promise<void> {
    await page.waitForSelector('.lang-switcher', { visible: true });
    await page.click('.lang-switcher');
    await delay(800);

    await page.waitForSelector('li[data-menu-id*="en-US"]', { visible: true });

    await page.click('li[data-menu-id*="en-US"]');

    await delay(1000);
  }

  async performLogin(page: Page): Promise<void> {
    const username = process.env.TRIPCOM_USERNAME!;
    const password = process.env.TRIPCOM_PASSWORD!;

    if (!username || !password) {
      throw new Error('TRIPCOM_USERNAME / TRIPCOM_PASSWORD not found!');
    }

    await page.goto('https://vbooking.ctrip.com/ivbk/accountV2/login', {
      waitUntil: 'networkidle2'
    });

    await delay(1500);

    this.switchLanguageToEnglish(page);

    await delay(1500);

    const loginFrame: Frame | Page =
      page
        .frames()
        .find(
          (f: any) =>
            f.url().includes('login') ||
            f.name().toLowerCase().includes('login')
        ) ?? page;

    const usernameSel =
      'input[placeholder="Please enter username/mobile number/email"]';
    const passwordSel = 'input[placeholder="Please enter password"]';

    await loginFrame.waitForSelector(usernameSel, {
      visible: true,
      timeout: 20000
    });

    await loginFrame.waitForSelector(passwordSel, {
      visible: true,
      timeout: 20000
    });

    await loginFrame.type(usernameSel, username, { delay: 100 });
    await loginFrame.type(passwordSel, password, { delay: 100 });

    const agreeSel = 'span.read-tips';
    const agreeExists = await page.$(agreeSel);
    if (agreeExists) {
      await page.evaluate(() => {
        const el = document.querySelector(
          'span.read-tips'
        ) as HTMLElement | null;
        if (el) el.click();

        const loginBtn = document.querySelector(
          'button.ant-btn.ant-btn-primary[style*="width:100%"]'
        ) as HTMLElement | null;
        if (loginBtn) loginBtn.click();
      });

      await delay(500);
    }

    await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 60000 });

    if (page.url().includes('login')) {
      console.log('⚠ Captcha / 2FA required. Waiting for manual solve…');
      await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 0 });
    }

    const cookies = await page.cookies();
    fs.writeFileSync(COOKIE_PATH, JSON.stringify(cookies, null, 2));
  }

  async crawlBookingDetail(orderId: string): Promise<string> {
    await this.loginIfNeeded();
    const page = await this.newPage();

    const url = DETAIL_URL + orderId;

    await page.goto(url, { waitUntil: 'networkidle2' });

    await page.waitForSelector('.ant-table', { timeout: 15000 });

    const content = await page.content();
    //await page.close();
    return content;
  }

  async closeBrowser(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }
}

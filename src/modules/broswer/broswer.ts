import path from 'path';
import fs from 'fs';
import puppeteer, { Browser, Page, Cookie } from 'puppeteer';
import { PLATFORM } from 'src/config/platform/platform.constant';

export class BrowserService {
  private browser: Browser | null = null;

  private async initBrowser(headless: boolean): Promise<Browser> {
    if (this.browser) return this.browser;

    this.browser = await puppeteer.launch({
      headless: headless,
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-zygote',
        '--single-process',
        '--disable-gpu'
      ]
    });

    return this.browser;
  }

  async newPage(platform: string): Promise<Page> {
    let COOKIE_PATH: string = '';

    const headless = process.env.HEADLESS === 'true';

    const browser = await this.initBrowser(headless);
    const page = await browser.newPage();

    if (platform === PLATFORM.TRIP_COM) {
      COOKIE_PATH = path.join(
        process.cwd(),
        '/cookies/tripcom/tripcom_cookies.json'
      );
    }

    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
        '(KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36'
    );

    if (COOKIE_PATH && fs.existsSync(COOKIE_PATH)) {
      const cookies: Cookie[] = JSON.parse(
        fs.readFileSync(COOKIE_PATH, 'utf8')
      );

      await page.setCookie(...cookies);
    }

    return page;
  }

  async closeBrowser(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }
}

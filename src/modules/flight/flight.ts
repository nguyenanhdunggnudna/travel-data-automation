import puppeteer, { Browser, Page } from 'puppeteer';
import { setTimeout as delay } from 'timers/promises';

interface FlightInfo {
  flightNo: string;
  status?: string;
  departure?: string;
  arrival?: string;
  route?: string;
  info: boolean;
}

export async function fetchFlightInfo(flightNo: string): Promise<FlightInfo> {
  const browser: Browser = await puppeteer.launch({ headless: true });
  const page: Page = await browser.newPage();

  try {
    // Tách flightNo thành airlineCode + flightNumber
    const match = flightNo.match(/^([A-Z]{2,3})(\d+)$/i);
    if (!match) throw new Error('Invalid flight number format');

    const airlineCode = match[1].toUpperCase();
    const flightNumber = match[2];

    const url = `https://www.flightstats.com/v2/flight-tracker/${airlineCode}/${flightNumber}`;

    await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });

    const acceptBtn = await page.$('#onetrust-accept-btn-handler');
    if (acceptBtn) {
      await acceptBtn.click();
      await delay(1000);
      console.log('Accepted cookies');
    }

    const notFound = await page.$('div.error__title');
    if (notFound) {
      await browser.close();
      return { flightNo, info: false };
    }

    await page
      .waitForSelector('.ticket-flight-status', { timeout: 10000 })
      .catch(() => null);

    const data = await page.evaluate(() => {
      const info: any = {};

      const flightEl = document.querySelector(
        '.ticket__FlightNumberContainer-sc-1rrbl5o-4'
      );
      if (flightEl) {
        const divs = flightEl.querySelectorAll(
          'div.text-helper__TextHelper-sc-8bko4a-0'
        );
        info.flightNo = divs[0]?.textContent?.trim() ?? '';
        info.airline = divs[1]?.textContent?.trim() ?? '';
      }

      // Status
      const statusEl = document.querySelector(
        '.ticket__StatusContainer-sc-1rrbl5o-17'
      );
      if (statusEl) {
        const divs = statusEl.querySelectorAll(
          'div.text-helper__TextHelper-sc-8bko4a-0'
        );
        info.status = divs[0]?.textContent?.trim() ?? '';
        info.onTime = divs[1]?.textContent?.trim() ?? '';
      }

      const depContainer = document.querySelectorAll(
        '.ticket__TicketCard-sc-1rrbl5o-7'
      )[0];
      if (depContainer) {
        info.departureDate =
          depContainer.querySelector('.cPBDDe')?.textContent?.trim() ?? '';
        info.departureTimeScheduled =
          depContainer.querySelector('.jtsqcj .kbHzdx')?.textContent?.trim() ??
          '';
        info.departureAirportFull =
          depContainer.querySelector('.cHdMkI')?.textContent?.trim() ?? '';
      }

      const arrContainer = document.querySelectorAll(
        '.ticket__TicketCard-sc-1rrbl5o-7'
      )[1];
      if (arrContainer) {
        info.arrivalDate =
          arrContainer.querySelector('.cPBDDe')?.textContent?.trim() ?? '';
        info.arrivalTimeScheduled =
          arrContainer.querySelector('.jtsqcj .kbHzdx')?.textContent?.trim() ??
          '';
        info.arrivalAirportFull =
          arrContainer.querySelector('.cHdMkI')?.textContent?.trim() ?? '';
      }

      return info;
    });

    await browser.close();

    if (!data.flightNo) return { flightNo, info: false };
    return { ...data, info: true };
  } catch (err) {
    console.error(err);
    await browser.close();
    return { flightNo, info: false };
  }
}

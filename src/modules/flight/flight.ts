import { FlightInfo } from '@modules/tripcom/tripcom.types';
import { setTripComLanguageToEnglish } from '@utils/switch-language-trip-flight';
import puppeteer, { Browser, Page } from 'puppeteer';
import { setTimeout as delay } from 'timers/promises';

async function fetchFlightInfo(
  flightNo: string,
  isDeparture?: boolean
): Promise<any> {
  const browser: Browser = await puppeteer.launch({ headless: true });
  const page: Page = await browser.newPage();

  try {
    const match = flightNo.match(/^([A-Z]{2,3})(\d+)$/i);
    if (!match) throw new Error('Invalid flight number format');

    const airlineCode = match[1].toUpperCase();
    const flightNumber = match[2];

    const url = `https://www.flightstats.com/v2/flight-tracker/${airlineCode}/${flightNumber}`;

    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });

    const notFound = await page.$('div.error__title');
    if (notFound) {
      await browser.close();
      return { info: false };
    }

    await page
      .waitForSelector('.ticket__FlightNumberContainer-sc-1rrbl5o-4', {
        timeout: 15000
      })
      .catch(() => null);

    const data = await page.evaluate(() => {
      const info: any = {};

      const routeCodes = Array.from(
        document.querySelectorAll(
          '.route-with-plane__AirportCodeLabel-sc-154xj1h-2 a'
        )
      ).map((a: any) => a.textContent?.trim() ?? '');

      info.routeFrom = routeCodes[0] ?? '';
      info.routeTo = routeCodes[1] ?? '';

      const depContainer = document.querySelectorAll(
        '.ticket__TicketCard-sc-1rrbl5o-7'
      )[0];
      if (depContainer) {
        info.departureTimeScheduled =
          depContainer.querySelector('.jtsqcj .kbHzdx')?.textContent?.trim() ??
          '';
      }

      const arrContainer = document.querySelectorAll(
        '.ticket__TicketCard-sc-1rrbl5o-7'
      )[1];
      if (arrContainer) {
        info.arrivalTimeScheduled =
          arrContainer.querySelector('.jtsqcj .kbHzdx')?.textContent?.trim() ??
          '';
      }

      return info;
    });

    await browser.close();

    if (!data.routeFrom || !data.routeTo) {
      return { info: false };
    }

    // =============================
    // CHUẨN HÓA DỮ LIỆU (giống TripCom)
    // =============================

    const fromCode = data.routeFrom.trim();
    const toCode = data.routeTo.trim();

    const depTime = data.departureTimeScheduled || '';
    const arrTime = data.arrivalTimeScheduled || '';

    return isDeparture
      ? {
          info: true,
          airport: fromCode, // Sân bay đi
          time: depTime // Giờ bay
        }
      : {
          info: true,
          airport: toCode, // Sân bay đến
          time: arrTime // Giờ đến
        };
  } catch (err) {
    console.error(err);
    await browser.close();
    return { info: false };
  }
}

async function fetchFlightInfoFromTripCom(
  flightNo: string,
  isDeparture?: boolean
): Promise<FlightInfo> {
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();

  try {
    const normalized = flightNo.replace(/\s+/g, '').toUpperCase(); // VJ842
    const url = `https://vn.trip.com/flights/status-${normalized}/?locale=en_xx`;

    await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });

    const notFound = await page.$('.empty-state, .no-data, .no-result');
    if (notFound) {
      await browser.close();
      return { info: false };
    }

    await page.waitForSelector('.flight-status-card-item-flight-container', {
      timeout: 10000
    });

    const data = await page.evaluate(() => {
      const info: any = {};

      const root = document.querySelector(
        '.flight-status-card-item-flight-container'
      );
      if (!root) return info;

      const dep = root.querySelector('.flight-status-card-item-flight-left');
      const mid = root.querySelector('.flight-status-card-item-flight-middle');
      const arr = root.querySelector('.flight-status-card-item-flight-right');

      // --- Departure ---
      info.routeFrom =
        dep
          ?.querySelector('[test-item="status_info_dep_city"]')
          ?.textContent?.trim() ?? '';
      info.departureTimeReal =
        dep
          ?.querySelector('[test-item="status_info_dep_time"]')
          ?.textContent?.trim() ?? '';
      info.departureTimeScheduled =
        dep
          ?.querySelector('[test-item="status_info_dep_scheduletime"]')
          ?.textContent?.replace('Scheduled:', '')
          .trim() ?? '';
      info.departureAirportFull =
        dep
          ?.querySelector('[test-item="status_info_dep_airport"]')
          ?.textContent?.trim() ?? '';

      // --- Middle section ---
      info.distance =
        mid
          ?.querySelector('[test-item="status_info_distance"]')
          ?.textContent?.trim() ?? '';
      info.duration =
        mid
          ?.querySelector('[test-item="status_info_duration"]')
          ?.textContent?.trim() ?? '';

      // --- Arrival ---
      info.routeTo =
        arr
          ?.querySelector('[test-item="status_info_arr_city"]')
          ?.textContent?.trim() ?? '';
      info.arrivalTimeReal =
        arr
          ?.querySelector('[test-item="status_info_arr_time"]')
          ?.textContent?.trim() ?? '';
      info.arrivalTimeScheduled =
        arr
          ?.querySelector('[test-item="status_info_arr_scheduletime"]')
          ?.textContent?.replace('Scheduled:', '')
          .trim() ?? '';
      info.arrivalAirportFull =
        arr
          ?.querySelector('[test-item="status_info_arr_airport"]')
          ?.textContent?.trim() ?? '';

      return info;
    });

    await browser.close();

    if (!data.routeFrom && !data.routeTo) {
      return { info: false };
    }

    // ================================
    //  ADD — PARSE DATA CHUẨN HOÁ
    // ================================

    // Lấy mã sân bay từ routeFrom → SGN
    const routeFromCode = data.routeFrom?.match(/\(([^)]+)\)/)?.[1] ?? '';

    // Lấy mã sân bay từ routeTo → DMK
    const routeToCode = data.routeTo?.match(/\(([^)]+)\)/)?.[1] ?? '';

    // Parse scheduled departure time
    let depTime = '';
    let depDate = '';

    if (data.departureTimeScheduled) {
      const timeMatch = data.departureTimeScheduled.match(/(\d{1,2}:\d{2})/);
      if (timeMatch) depTime = timeMatch[1];

      const dateMatch = data.departureTimeScheduled.match(
        /(\d{1,2})\s*thg\s*(\d{1,2})/
      );
      if (dateMatch) {
        depDate = `${dateMatch[1]}/${dateMatch[2]}`;
      }
    }

    const departureTime =
      data.departureTimeReal || data.departureTimeScheduled || '';

    const arrivalTime = data.arrivalTimeReal || data.arrivalTimeScheduled || '';

    return isDeparture
      ? {
          info: true,
          airport: routeFromCode, // Sân bay đi
          time: departureTime // Giờ khởi hành
        }
      : {
          info: true,
          airport: routeToCode, // Sân bay đến
          time: arrivalTime // Giờ hạ cánh
        };

    // return isDeparture
    //   ? {
    //       info: true,
    //       airport: routeToCode,
    //       time: depTime
    //     }
    //   : {
    //       info: true,
    //       airport: routeFromCode,
    //       time: data.arrivalTimeReal
    //     };
  } catch (err) {
    console.error(err);
    await browser.close();
    return { info: false };
  }
}

export async function fetchFlightInfoSmart(
  flightNo: string,
  isDeparture?: boolean
): Promise<FlightInfo> {
  const statsData = await fetchFlightInfo(flightNo);
  if (statsData.info === true) return statsData;

  const fallbackData = await fetchFlightInfoFromTripCom(flightNo, isDeparture);
  console.log('fallbackData: ', fallbackData);
  if (fallbackData.info === true) return fallbackData;

  return { info: false };
}

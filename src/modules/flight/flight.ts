import { FlightInfo } from '@modules/tripcom/tripcom.types';

import puppeteer, { Browser, Page } from 'puppeteer';

export const VN_AIRPORTS = new Set([
  // Miền Bắc
  'HAN', // Hà Nội – Nội Bài
  'HPH', // Hải Phòng – Cát Bi
  'DIN', // Điện Biên
  'THD', // Thanh Hóa – Thọ Xuân
  'VDO', // Vân Đồn (Quảng Ninh)

  // Miền Trung
  'VII', // Vinh
  'HUI', // Huế – Phú Bài
  'DAD', // Đà Nẵng
  'PXU', // Pleiku
  'TBB', // Tuy Hòa
  'CXR', // Cam Ranh (Nha Trang)
  'UIH', // Phù Cát (Quy Nhơn)

  // Tây Nguyên
  'BMV', // Buôn Ma Thuột
  'DLI', // Liên Khương (Đà Lạt)

  // Miền Nam
  'SGN', // TP.HCM – Tân Sơn Nhất
  'VCA', // Cần Thơ
  'PQC', // Phú Quốc
  'VKG', // Rạch Giá
  'CAH', // Cà Mau
  'VCS' // Côn Đảo
]);

async function getIataCode(airlineName: string): Promise<string | null> {
  const browser = await puppeteer.launch({
    headless: true,
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
  const page = await browser.newPage();
  try {
    const searchUrl = `https://www.iata.org/PublicationDetails/Search/?currentBlock=314383&currentPage=12572&airline.search=${encodeURIComponent(
      airlineName
    )}`;
    await page.goto(searchUrl, { waitUntil: 'networkidle2', timeout: 30000 });

    // lấy cột 3 (2-letter code) của bảng đầu tiên
    const code = await page.$eval(
      'table.datatable tbody tr td:nth-child(3)',
      (el: HTMLTableCellElement) => (el.textContent || '').trim()
    );

    console.log('code: ', code);

    await browser.close();
    return code || null;
  } catch (err) {
    console.error('Error fetching IATA code:', err);
    await browser.close();
    return null;
  }
}

async function normalizeFlightNo(raw: string): Promise<string | null> {
  const numMatch = raw.match(/\d{1,4}/);
  if (!numMatch) return null;
  const flightNumber = numMatch[0];

  const airlineNameMatch = raw.match(/^[^\d]+/);
  if (!airlineNameMatch) return null;
  const airlineName = airlineNameMatch[0].trim();

  const iataCode = await getIataCode(airlineName);
  if (!iataCode) return null;

  return `${iataCode}${flightNumber}`;
}

function pickVietnamSide(from: string, to: string): 'FROM' | 'TO' | null {
  if (VN_AIRPORTS.has(from)) return 'FROM';
  if (VN_AIRPORTS.has(to)) return 'TO';
  return null;
}

function parseScheduledTime(text?: string): string {
  if (!text) return '';

  const timeMatch = text.match(/(\d{1,2}:\d{2})/);
  return timeMatch ? timeMatch[1] : '';
}

async function fetchFlightInfo(flightNo: string): Promise<any> {
  let normalizedFlightNo = flightNo;
  const browser: Browser = await puppeteer.launch({
    headless: true,
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
  const page: Page = await browser.newPage();

  try {
    let match = flightNo.match(/^([A-Z]{2,3})(\d+)$/i);
    if (!match) {
      normalizedFlightNo = (await normalizeFlightNo(flightNo)) || '';
      match = normalizedFlightNo.match(/^([A-Z]{2,3})(\d+)$/i);
      if (!match) {
        return { info: false };
      }
    }

    const airlineCode = match[1].toUpperCase();
    const flightNumber = match[2];

    const url = `https://www.flightstats.com/v2/flight-tracker/${airlineCode}/${flightNumber}`;
    console.log('url chuyến bay: ', url);

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

    const fromCode = data.routeFrom.trim();
    const toCode = data.routeTo.trim();

    const depTime = parseScheduledTime(data.departureTimeScheduled);
    const arrTime = parseScheduledTime(data.arrivalTimeScheduled);

    const vnSide = pickVietnamSide(fromCode, toCode);
    if (!vnSide) {
      return { info: false };
    }

    const airportVN = vnSide === 'FROM' ? fromCode : toCode;
    const time = vnSide === 'FROM' ? depTime : arrTime;

    return {
      info: true,
      airport: airportVN,
      time
    };
  } catch (err) {
    console.error(err);
    await browser.close();
    return { info: false };
  }
}

async function fetchFlightInfoFromTripCom(
  flightNo: string
): Promise<FlightInfo> {
  const browser = await puppeteer.launch({
    headless: true,
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
  const page = await browser.newPage();

  try {
    const normalized = flightNo.replace(/\s+/g, '').toUpperCase(); // VJ842
    const url = `https://vn.trip.com/flights/status-${normalized}/?locale=en_xx`;
    console.log('url chuyến bay: ', url);

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

    depTime = parseScheduledTime(data.departureTimeScheduled);
    const arrTime = parseScheduledTime(data.arrivalTimeScheduled);

    const vnSide = pickVietnamSide(routeFromCode, routeToCode);
    if (!vnSide) {
      return { info: false };
    }

    const airportVN = vnSide === 'FROM' ? routeFromCode : routeToCode;
    const time = vnSide === 'FROM' ? depTime : arrTime;

    return {
      info: true,
      airport: airportVN,
      time
    };
  } catch (err) {
    await browser.close();
    return { info: false };
  }
}

export async function fetchFlightInfoSmart(
  flightNo: string | undefined,
  isDeparture?: boolean
): Promise<FlightInfo> {
  if (!flightNo) return { info: false };

  const tripComData = await fetchFlightInfoFromTripCom(flightNo);
  if (tripComData.info === true) {
    console.log('thông tin bay từ trip com: ', tripComData);
    return tripComData;
  }

  const statsData = await fetchFlightInfo(flightNo);
  if (statsData.info === true) {
    console.log('thông tin bay từ fetch Flight Info: ', statsData);
    return statsData;
  }

  return { info: false };
}

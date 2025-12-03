import { Page } from 'puppeteer';

export interface BookingDetail {
  orderId: string;
  fullName: string;
  adults: number;
  children: number;
  name: string;
  flightNo: string;
  [key: string]: any;
}

export async function parseBookingDetail(
  page: Page,
  orderId: string
): Promise<BookingDetail> {
  // Chờ bảng Traveler load xong
  await page.waitForFunction(
    () => {
      const table = document.querySelector(
        '#order-clientList + .innercard-content .ant-table-body table'
      );
      if (!table) return false;
      return (
        table.querySelectorAll('tr.ant-table-row:not([aria-hidden="true"])')
          .length > 0
      );
    },
    { timeout: 50000 }
  );

  // Crawl dữ liệu bên trong table Traveler
  const { rows, totalAdults, isArrival, isDeparture, airport } =
    await page.evaluate(() => {
      let isArrival = false;
      let isDeparture = false;
      let service = '';
      let airport;

      const table = document.querySelector(
        '#order-clientList + .innercard-content .ant-table-body table'
      );
      if (!table)
        return { rows: [], totalAdults: 0, isArrival, isDeparture, airport };

      const trs = Array.from(table.querySelectorAll('tr.ant-table-row'));
      const rows: string[] = [];
      let totalAdults = 0;

      trs.forEach((tr, index) => {
        if (tr.getAttribute('aria-hidden') === 'true') return;

        const cells = Array.from(tr.querySelectorAll('td'));
        if (cells.length === 0) return;

        if (index === 0) {
          service = cells[0].innerText.trim();
          const airportMatch = service.match(
            /([A-Za-z\s]+?)(?: Airport| International Airport)/i
          );
          airport = airportMatch ? airportMatch[0] : '';

          if (service.includes('Arrival')) isDeparture = true;
          if (service.includes('Departure')) isArrival = true;
        }

        const customerCell: HTMLElement | null =
          index === 0 ? cells[2] : cells[1];
        if (!customerCell) return;

        const div = customerCell.querySelector(
          'div[data-ignorecheckblock="true"]'
        );
        if (!div) return;

        // clone để loại bỏ div con và span "Adults"
        const cloned = div.cloneNode(true) as HTMLElement;
        cloned.querySelectorAll('div').forEach((d) => d.remove());
        cloned.querySelectorAll('span').forEach((s) => s.remove());

        const name = cloned.textContent?.trim();
        if (!name) return;

        rows.push(name);

        // Adults
        const adults = customerCell.innerText.includes('Adults') ? 1 : 0;
        totalAdults += adults;
      });

      return { rows, totalAdults, isArrival, isDeparture, airport };
    });

  const fullName = rows.join(', ');
  const adults = totalAdults;

  // Lấy flight number
  const flightNo: string = await page.evaluate(() => {
    const label = Array.from(document.querySelectorAll('span.info_left')).find(
      (el) => el.textContent?.trim() === 'Flight no.:'
    );
    if (!label) return '';
    const text = label.nextElementSibling?.textContent ?? '';
    const matches = text.match(/[A-Z]{1,3}\s?\d{1,4}[A-Z]?/);
    return matches ? matches[0] : '';
  });

  return {
    orderId,
    fullName,
    adults,
    children: 0,
    name: fullName,
    flightNo,
    isArrival,
    isDeparture,
    airport
  };
}

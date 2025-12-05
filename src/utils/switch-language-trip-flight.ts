import { Page } from 'puppeteer';

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export async function setTripComLanguageToEnglish(page: Page) {
  try {
    // 1. Chờ icon ngôn ngữ xuất hiện
    await page.waitForSelector('.locale-icon', { timeout: 5000 });

    // 2. Click icon để mở modal
    await page.click('.locale-icon');

    // 3. Đợi modal hiện ra
    await page.waitForSelector('.mc-lhd-modal-con', {
      visible: true,
      timeout: 8000
    });

    // 4. Click vào mục "English"
    await page.evaluate(() => {
      const items = Array.from(
        document.querySelectorAll('.mc-lhd-locale-selector-list-item-container')
      );

      for (const item of items) {
        const label = item.getAttribute('aria-label') || '';
        if (label.trim() === 'English') {
          (item as HTMLElement).click();
          break;
        }
      }
    });

    // 5. Chờ trang reload sau khi đổi ngôn ngữ
    await page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 15000 });

    console.log('Đã chuyển ngôn ngữ sang English.');
  } catch (err) {
    console.error('Không thể chuyển sang English:', err);
  }
}

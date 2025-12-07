import { BrowserService } from '@modules/broswer/broswer';
import { EmailService } from '@modules/email/email';
import { GoggleSheetService } from '@modules/google-sheet/google-sheet';
import { GoogleService } from '@modules/google/google';
import { KKdayCrawler } from '@modules/kkday/kkday.crawler';
import { TripComCrawler } from '@modules/tripcom/tripcom.crawler';
import 'dotenv/config';
import cron from 'node-cron';

const googleSheet = new GoggleSheetService();
const googleService = new GoogleService();
const browserKKdayService = new BrowserService();
const browserTripComService = new BrowserService();

async function main(): Promise<void> {
  const kkdayCrawler = new KKdayCrawler(
    googleSheet,
    googleService,
    browserKKdayService
  );

  const kkdayPage = await kkdayCrawler.runLoginFlow(
    'timehouse0915@gmail.com',
    'Vietnamkpeople0915!'
  );

  // TripCom crawler
  const tripComCrawler = new TripComCrawler(
    browserTripComService,
    googleSheet,
    googleService
  );

  const tripcomPage = await tripComCrawler.initTripComBrowser();

  await tripComCrawler.loginIfNeeded(tripcomPage);

  cron.schedule('*/1 * * * * ', async () => {
    try {
      const emailService = new EmailService(googleService);

      const orderIds = await emailService.getAllOrderIds();

      await tripComCrawler.runCrawlTripCom(orderIds, tripcomPage);

      // Get kkday booking
      const orderId = await kkdayCrawler.getLatestBookingFromMail();

      console.log('order id ngoài indexx: ', orderId);

      if (!orderId) return;

      if (orderId) {
        kkdayCrawler.kkdayCrawl(orderId, kkdayPage);
      }
    } catch (err) {
      console.error('❌ Error in cron job:', err);
    }
  });
}

main().catch((err: Error) => {
  console.error('❌ Error in main():', err);
});

import { BrowserService } from '@modules/broswer/broswer';
import { EmailService } from '@modules/email/email';
import { GoggleSheetService } from '@modules/google-sheet/google-sheet';
import { GoogleService } from '@modules/google/google';
import { KKdayCrawler } from '@modules/kkday/kkday.crawler';
import { TripComCrawler } from '@modules/tripcom/tripcom.crawler';
import 'dotenv/config';
import cron from 'node-cron';
import { LoggerService } from './logger/logger';
import { LabelService } from '@modules/google/gmail-label';

const googleSheet = new GoggleSheetService();
const googleService = new GoogleService();
const browserKKdayService = new BrowserService();
const browserTripComService = new BrowserService();
const loggerService = new LoggerService();

const emailService = new EmailService(googleService, loggerService);

async function main(): Promise<void> {
  const auth = await googleService.authorize();
  const labelService = new LabelService(auth);

  const kkdayCrawler = new KKdayCrawler(
    googleSheet,
    googleService,
    browserKKdayService,
    loggerService
  );

  const tripComCrawler = new TripComCrawler(
    browserTripComService,
    googleSheet,
    googleService,
    loggerService
  );

  const tripcomPage = await tripComCrawler.initTripComBrowser();
  await tripComCrawler.loginIfNeeded(tripcomPage);

  const kkdayPage = await kkdayCrawler.initBrowser();

  await kkdayCrawler.runLoginFlow(
    'timehouse0915@gmail.com',
    'Vietnamkpeople0915!',
    kkdayPage
  );

  const PENDING_LABEL_ID = await labelService.getOrCreateLabel('PENDING');
  const DONE_LABEL_ID = await labelService.getOrCreateLabel('DONE');
  const FAILED_LABEL_ID = await labelService.getOrCreateLabel('FAILED');

  // Login lại sau mỗi 30 phút
  cron.schedule('0 */30 * * * *', async () => {
    await kkdayCrawler.runLoginFlow(
      'timehouse0915@gmail.com',
      'Vietnamkpeople0915!',
      kkdayPage
    );
  });

  const processedMessageIds = new Set<string>(); // Lưu tất cả messageId đã DONE hoặc FAILED
  const processingSet = new Set<string>(); // Lưu messageId đang xử lý

  cron.schedule('*/30 * * * * *', async () => {
    try {
      // --- TripCom ---
      const mails = await emailService.getAllTripComOrderIds();

      for (const mail of mails) {
        if (
          processedMessageIds.has(mail.messageId) ||
          processingSet.has(mail.messageId)
        )
          continue;
        processingSet.add(mail.messageId);

        await labelService.addLabel(mail.messageId, PENDING_LABEL_ID);

        try {
          await tripComCrawler.runCrawlTripCom(
            mail.orderId,
            tripcomPage,
            mail.receivedAt
          );

          await labelService.removeLabel(mail.messageId, PENDING_LABEL_ID);
          await labelService.addLabel(mail.messageId, DONE_LABEL_ID);

          processedMessageIds.add(mail.messageId); // Đánh dấu DONE
        } catch (err) {
          loggerService.error(
            `TripCom crawl failed | orderId=${mail.orderId} | ${err}`
          );

          await labelService.removeLabel(mail.messageId, PENDING_LABEL_ID);
          await labelService.addLabel(mail.messageId, FAILED_LABEL_ID);

          processedMessageIds.add(mail.messageId); // Đánh dấu FAILED
        } finally {
          processingSet.delete(mail.messageId);
        }
      }

      // --- KKday ---
      const kkdayMails = await emailService.getAllKKdayOrderIds();
      console.log('KKday mails: ', kkdayMails);

      for (const mail of kkdayMails) {
        if (
          processedMessageIds.has(mail.messageId) ||
          processingSet.has(mail.messageId)
        )
          continue;
        processingSet.add(mail.messageId);

        await labelService.addLabel(mail.messageId, PENDING_LABEL_ID);

        try {
          await kkdayCrawler.kkdayCrawl(
            mail.orderId,
            kkdayPage,
            mail.receivedAt
          );

          await labelService.removeLabel(mail.messageId, PENDING_LABEL_ID);
          await labelService.addLabel(mail.messageId, DONE_LABEL_ID);

          processedMessageIds.add(mail.messageId);
        } catch (err) {
          loggerService.error(
            `KKday crawl failed | orderId=${mail.orderId} | ${err}`
          );
          await labelService.removeLabel(mail.messageId, PENDING_LABEL_ID);
          await labelService.addLabel(mail.messageId, FAILED_LABEL_ID);

          processedMessageIds.add(mail.messageId);
        } finally {
          processingSet.delete(mail.messageId);
        }
      }
    } catch (err) {
      loggerService.error(`Cronjob error: ${err}`);
    }
  });
}

main().catch((err: Error) => {
  loggerService.error(`Crash app: ${err}`);
});

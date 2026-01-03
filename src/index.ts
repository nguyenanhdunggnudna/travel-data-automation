import 'dotenv/config';

import cron, { ScheduledTask } from 'node-cron';

import { BrowserService } from '@modules/broswer/broswer';
import { EmailService } from '@modules/email/email';
import { GoggleSheetService } from '@modules/google-sheet/google-sheet';
import { GoogleService } from '@modules/google/google';
import { KKdayCrawler } from '@modules/kkday/kkday.crawler';
import { TripComCrawler } from '@modules/tripcom/tripcom.crawler';
import { LabelService } from '@modules/google/gmail-label';

import { LoggerService } from './logger/logger';
import { PLATFORM } from './config/platform/platform.constant';
import { google } from 'googleapis';

const loggerService = new LoggerService();

const googleSheet = new GoggleSheetService();

const kkdayGoogleService = new GoogleService(PLATFORM.KKDAY);
const tripComGoogleService = new GoogleService(PLATFORM.TRIP_COM);

const browserKKdayService = new BrowserService();
const browserTripComService = new BrowserService();

const emailService = new EmailService(
  kkdayGoogleService,
  tripComGoogleService,
  loggerService
);

const processedKKday = new Set<string>();
const processingKKday = new Set<string>();

const processedTrip = new Set<string>();
const processingTrip = new Set<string>();

let loginJob: ScheduledTask;
let crawlJob: ScheduledTask;

async function main(): Promise<void> {
  const kkdayAuth = await kkdayGoogleService.authorize();
  const tripComAuth = await tripComGoogleService.authorize();

  const labelKKDayService = new LabelService(kkdayAuth);
  const labelTripcomService = new LabelService(tripComAuth);

  const kkdayCrawler = new KKdayCrawler(
    googleSheet,
    kkdayGoogleService,
    browserKKdayService,
    loggerService
  );

  const tripComCrawler = new TripComCrawler(
    browserTripComService,
    googleSheet,
    tripComGoogleService,
    loggerService
  );

  const tripcomPage = await tripComCrawler.initTripComBrowser();
  await tripComCrawler.loginIfNeeded(tripcomPage);

  const kkdayPage = await kkdayCrawler.initBrowser();
  await kkdayCrawler.runLoginFlow(
    process.env.KKDAY_EMAIL!,
    process.env.KKDAY_PASSWORD!,
    kkdayPage
  );

  const KKDAY_PENDING = await labelKKDayService.getOrCreateLabel('PENDING');
  const KKDAY_DONE = await labelKKDayService.getOrCreateLabel('DONE');

  const TRIP_PENDING = await labelTripcomService.getOrCreateLabel('PENDING');
  const TRIP_DONE = await labelTripcomService.getOrCreateLabel('DONE');

  loginJob = cron.schedule('0 */30 * * * *', async () => {
    try {
      await kkdayCrawler.runLoginFlow(
        process.env.KKDAY_EMAIL!,
        process.env.KKDAY_PASSWORD!,
        kkdayPage
      );
    } catch (err) {
      loggerService.error(`Re-login failed: ${err}`);
    }
  });

  const sheets = google.sheets({ version: 'v4', auth: tripComAuth });

  crawlJob = cron.schedule('0 */5 * * * *', async () => {
    try {
      let hasNewData = false;

      /* ========= TRIPCOM ========= */
      const tripMails = await emailService.getAllTripComOrderIds();
      loggerService.info(`TripCom mails: ${tripMails.length}`);

      for (const mail of tripMails) {
        const exists = await googleSheet.isBookingExists(
          tripComAuth,
          mail.orderId
        );

        if (exists) {
          await labelTripcomService.addLabel(mail.messageId, TRIP_DONE);
          continue;
        }

        if (
          processedTrip.has(mail.messageId) ||
          processingTrip.has(mail.messageId)
        )
          continue;

        processingTrip.add(mail.messageId);
        await labelTripcomService.addLabel(mail.messageId, TRIP_PENDING);

        try {
          await tripComCrawler.runCrawlTripCom(
            mail.orderId,
            tripcomPage,
            mail.receivedAt
          );

          hasNewData = true;

          await labelTripcomService.removeLabel(mail.messageId, TRIP_PENDING);
          await labelTripcomService.addLabel(mail.messageId, TRIP_DONE);
          processedTrip.add(mail.messageId);
        } catch (err) {
          loggerService.error(`TripCom failed | ${err}`);
          await labelTripcomService.removeLabel(mail.messageId, TRIP_PENDING);
        } finally {
          processingTrip.delete(mail.messageId);
        }
      }

      /* ========= KKDAY ========= */
      const kkdayMails = await emailService.getAllKKdayOrderIds();
      loggerService.info(`KKDay mails: ${kkdayMails.length}`);

      for (const mail of kkdayMails) {
        const exists = await googleSheet.isBookingExists(
          kkdayAuth,
          mail.orderId
        );

        console.log(`${mail.orderId} - exists? ${exists}`);

        if (exists) {
          console.log('KKDAY có exist không');
          await labelKKDayService.addLabel(mail.messageId, KKDAY_DONE);
          continue;
        }

        if (
          processedKKday.has(mail.messageId) ||
          processingKKday.has(mail.messageId)
        )
          continue;

        processingKKday.add(mail.messageId);
        await labelKKDayService.addLabel(mail.messageId, KKDAY_PENDING);

        try {
          await kkdayCrawler.kkdayCrawl(
            mail.orderId,
            kkdayPage,
            mail.receivedAt
          );

          hasNewData = true;

          await labelKKDayService.removeLabel(mail.messageId, KKDAY_PENDING);
          await labelKKDayService.addLabel(mail.messageId, KKDAY_DONE);
          processedKKday.add(mail.messageId);
        } catch (err) {
          loggerService.error(`KKday failed | ${err}`);
          await labelKKDayService.removeLabel(mail.messageId, KKDAY_PENDING);
        } finally {
          processingKKday.delete(mail.messageId);
        }
      }

      /* ========= SORT 1 LẦN DUY NHẤT ========= */
      if (hasNewData) {
        await googleSheet.sortByDateOfUse(sheets, process.env.GOOGLE_SHEET_ID!);
        loggerService.info('✅ Sorted sheet after batch crawl');
      }

      processedKKday.clear();
      processedTrip.clear();
    } catch (err) {
      loggerService.error(`Cron error: ${err}`);
    }
  });

  loginJob.start();
  crawlJob.start();

  setInterval(() => {
    loggerService.error('🫀 Process alive');
  }, 60_000);
}

main().catch((err: Error) => {
  console.error('catch error: ', err);
  loggerService.error(`❌ App crashed: ${err}`);
  process.exit(1);
});

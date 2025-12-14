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

/* =======================
   BOOT LOG
======================= */
console.log('🚀 Travel Data Automation STARTED', new Date().toISOString());

/* =======================
   SERVICES
======================= */
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

/* =======================
   STATE
======================= */
const processedKKday = new Set<string>();
const processingKKday = new Set<string>();

const processedTrip = new Set<string>();
const processingTrip = new Set<string>();

/* =======================
   CRON HOLDERS
======================= */
let loginJob: ScheduledTask;
let crawlJob: ScheduledTask;

/* =======================
   MAIN
======================= */
async function main(): Promise<void> {
  loggerService.info('Init services...');

  /* ---------- AUTH ---------- */
  const kkdayAuth = await kkdayGoogleService.authorize();
  const tripComAuth = await tripComGoogleService.authorize();

  const labelKKDayService = new LabelService(kkdayAuth);
  const labelTripcomService = new LabelService(tripComAuth);

  /* ---------- CRAWLERS ---------- */
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

  /* ---------- INIT BROWSERS ---------- */
  const tripcomPage = await tripComCrawler.initTripComBrowser();
  await tripComCrawler.loginIfNeeded(tripcomPage);

  const kkdayPage = await kkdayCrawler.initBrowser();
  await kkdayCrawler.runLoginFlow(
    process.env.KKDAY_EMAIL!,
    process.env.KKDAY_PASSWORD!,
    kkdayPage
  );

  /* ---------- LABELS ---------- */
  const KKDAY_PENDING = await labelKKDayService.getOrCreateLabel('PENDING');
  const KKDAY_DONE = await labelKKDayService.getOrCreateLabel('DONE');
  const KKDAY_FAILED = await labelKKDayService.getOrCreateLabel('FAILED');

  const TRIP_PENDING = await labelTripcomService.getOrCreateLabel('PENDING');
  const TRIP_DONE = await labelTripcomService.getOrCreateLabel('DONE');
  const TRIP_FAILED = await labelTripcomService.getOrCreateLabel('FAILED');

  /* =======================
     CRON: LOGIN LẠI 30 PHÚT
  ======================= */
  loginJob = cron.schedule('0 */30 * * * *', async () => {
    try {
      loggerService.info('⏰ Re-login KKday');
      await kkdayCrawler.runLoginFlow(
        process.env.KKDAY_EMAIL!,
        process.env.KKDAY_PASSWORD!,
        kkdayPage
      );
    } catch (err) {
      loggerService.error(`Re-login failed: ${err}`);
    }
  });

  /* =======================
     CRON: CRAWL 3 PHÚT
  ======================= */
  crawlJob = cron.schedule('0 */3 * * * *', async () => {
    loggerService.info('⏰ Crawl cron triggered');

    try {
      /* ---------- TripCom ---------- */
      const tripMails = await emailService.getAllTripComOrderIds();
      loggerService.info(`TripCom mails: ${tripMails.length}`);

      for (const mail of tripMails) {
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

          await labelTripcomService.removeLabel(mail.messageId, TRIP_PENDING);
          await labelTripcomService.addLabel(mail.messageId, TRIP_DONE);

          processedTrip.add(mail.messageId);
        } catch (err) {
          loggerService.error(`TripCom failed | ${err}`);

          await labelTripcomService.removeLabel(mail.messageId, TRIP_PENDING);
          await labelTripcomService.addLabel(mail.messageId, TRIP_FAILED);
        } finally {
          processingTrip.delete(mail.messageId);
        }
      }

      /* ---------- KKday ---------- */
      const kkdayMails = await emailService.getAllKKdayOrderIds();
      loggerService.info(`KKday mails: ${kkdayMails.length}`);

      for (const mail of kkdayMails) {
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

          await labelKKDayService.removeLabel(mail.messageId, KKDAY_PENDING);
          await labelKKDayService.addLabel(mail.messageId, KKDAY_DONE);

          processedKKday.add(mail.messageId);
        } catch (err) {
          loggerService.error(`KKday failed | ${err}`);

          await labelKKDayService.removeLabel(mail.messageId, KKDAY_PENDING);
          await labelKKDayService.addLabel(mail.messageId, KKDAY_FAILED);
        } finally {
          processingKKday.delete(mail.messageId);
        }
      }
    } catch (err) {
      loggerService.error(`Cron error: ${err}`);
    }
  });

  /* ---------- START CRONS ---------- */
  loginJob.start();
  crawlJob.start();

  loggerService.info('✅ Cron jobs started');

  /* =======================
     KEEP PROCESS ALIVE (BẢO HIỂM)
  ======================= */
  setInterval(() => {
    loggerService.error('🫀 Process alive');
  }, 60_000);
}

/* =======================
   BOOT
======================= */
main().catch((err: Error) => {
  loggerService.error(`❌ App crashed: ${err}`);
  process.exit(1);
});

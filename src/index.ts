import 'dotenv/config';
import cron from 'node-cron';
import { RunCrawl } from '@modules/booking/email/email';

console.log('⏰ Cron job started, running every 30 seconds...');

cron.schedule('*/45 * * * * *', async () => {
  console.log('🔄 Running RunCrawl at', new Date().toLocaleTimeString());
  try {
    await RunCrawl();
  } catch (err) {
    console.error('❌ Error in RunCrawl:', err);
  }
});

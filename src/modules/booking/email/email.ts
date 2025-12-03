import { google, gmail_v1 } from 'googleapis';
import fs from 'fs';
import path from 'path';
import { GaxiosResponse } from 'gaxios';

import 'dotenv/config';
import { TripcomCrawler } from '../tripcom.crawler';
import { BookingDetail, parseBookingDetail } from '../tripcom.parse';

// --- Gmail OAuth setup ---
const CREDENTIALS_PATH = path.join(__dirname, 'credentials.json');
const TOKEN_PATH = path.join(__dirname, 'token.json');
const SCOPES = [
  'https://www.googleapis.com/auth/gmail.modify',
  'https://www.googleapis.com/auth/spreadsheets'
];

import readline from 'readline';
import { fetchFlightInfo } from '@modules/flight/flight';
import { formatDepartureDate } from '@utils/data';

function getNewToken(oAuth2Client: any): Promise<any> {
  const authUrl = oAuth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES
  });
  console.log('Authorize this app by visiting this url:', authUrl);

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  return new Promise((resolve) => {
    rl.question('Enter the code from that page here: ', (code) => {
      rl.close();
      oAuth2Client.getToken(code, (err: any, token: any) => {
        if (err) return console.error('Error retrieving access token', err);
        oAuth2Client.setCredentials(token);
        fs.writeFileSync(TOKEN_PATH, JSON.stringify(token));
        console.log('Token saved to', TOKEN_PATH);
        resolve(oAuth2Client);
      });
    });
  });
}

async function authorize(): Promise<any> {
  const content = fs.readFileSync(CREDENTIALS_PATH, 'utf-8');
  const credentials = JSON.parse(content);
  const { client_secret, client_id, redirect_uris } = credentials.installed;

  const oAuth2Client = new google.auth.OAuth2(
    client_id,
    client_secret,
    redirect_uris[0]
  );

  if (fs.existsSync(TOKEN_PATH)) {
    const token = fs.readFileSync(TOKEN_PATH, 'utf-8');
    oAuth2Client.setCredentials(JSON.parse(token));
    return oAuth2Client;
  }

  return getNewToken(oAuth2Client);
}

async function getAllOrderIds(auth: any): Promise<string[]> {
  const gmail = google.gmail({ version: 'v1', auth });

  const resList = await gmail.users.messages.list({
    userId: 'me',
    maxResults: 50, // tùy bạn
    q: 'from:"dinhquanghoa2009@gmail.com" to:"nguyenanhdunggnudna2@gmail.com" subject:"Trip.com ANT" is:unread'
  });

  const messages = resList.data.messages;
  if (!messages || messages.length === 0) return [];

  const orderIds: string[] = [];

  for (const msg of messages) {
    const resMsg = await gmail.users.messages.get({
      userId: 'me',
      id: msg.id!,
      format: 'full'
    });

    await gmail.users.messages.modify({
      userId: 'me',
      id: msg.id!,
      requestBody: {
        removeLabelIds: ['UNREAD']
      }
    });

    const headers = resMsg.data.payload?.headers || [];
    const subjectHeader = headers.find((h) => h.name === 'Subject');

    if (!subjectHeader?.value) continue;

    const match = subjectHeader.value.match(/\b\d{16}\b/);
    if (match) {
      orderIds.push(match[0]);
    }
  }

  return orderIds;
}

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
async function appendToGoogleSheet(
  auth: any,
  detail: BookingDetail,
  sheetId: string = process.env.GOOGLE_SHEET_ID || ''
) {
  const sheets = google.sheets({ version: 'v4', auth });

  const formatTime = (time?: string) => time?.split(' ')[0] ?? '';

  console.log('In4: ', detail);

  const formattedDate = formatDepartureDate(detail.flightInfo?.departureDate);

  const flightMissingFlag = !detail.flightInfo?.info ? '⚠️ Missing' : 'N/A';

  const row = [
    formattedDate || '',
    detail.flightNo,
    formatTime(detail.flightInfo?.departureTimeScheduled),
    detail.adults,
    detail.children,
    detail.airport || '',
    'CTRIP',
    detail.orderId,
    '',
    detail.name,
    flightMissingFlag,
    '',
    detail.arrival,
    detail.departure
  ];

  try {
    await sheets.spreadsheets.values.append({
      spreadsheetId: sheetId,
      range: 'Sheet1!A:Z',
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: [row]
      }
    });
  } catch (error) {
    console.error('Error appending to Google Sheet:', error);
  }

  console.log(`📤 Pushed to Google Sheet: ${detail.orderId}`);
}

// --- Main service ---
export async function RunCrawl(): Promise<void> {
  const auth = await authorize();

  const orderIds = await getAllOrderIds(auth);
  if (orderIds.length === 0) {
    console.log('No orderId found.');
    return;
  }

  console.log(`Found ${orderIds.length} orderIds:`, orderIds);

  const crawler = new TripcomCrawler();
  await crawler.initBrowser(false);

  for (const orderId of orderIds) {
    console.log(`\n===== Crawling orderId: ${orderId} =====`);

    const html: string = await crawler.crawlBookingDetail(orderId);
    const page = await crawler.newPage();
    await page.setContent(html, { waitUntil: 'domcontentloaded' });

    const detail: BookingDetail = await parseBookingDetail(page, orderId);

    if (detail.flightNo) {
      detail.flightInfo = await fetchFlightInfo(detail.flightNo);
    }

    const jsonPath = path.join(process.cwd(), `${orderId}.json`);
    fs.writeFileSync(jsonPath, JSON.stringify(detail, null, 2));

    //appendBookingToExcel(detail, `${orderId}.xlsx`);

    await appendToGoogleSheet(auth, detail, process.env.GOOGLE_SHEET_ID);

    await page.close();
  }

  await crawler.closeBrowser();

  console.log('✨ Done crawling all orderIds!');
}

import { OAuth2Client } from 'google-auth-library';
import path from 'path';
import readline from 'readline';
import fs from 'fs';
import { google } from 'googleapis';

export class GoogleService {
  CREDENTIALS_PATH = path.join(__dirname, 'credentials.json');
  TOKEN_PATH = path.join(__dirname, 'token.json');
  SCOPES = [
    'https://www.googleapis.com/auth/gmail.modify',
    'https://www.googleapis.com/auth/spreadsheets'
  ];

  getNewToken(oAuth2Client: OAuth2Client): Promise<OAuth2Client> {
    const url = oAuth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: this.SCOPES
    });

    console.log('Authorize this app by visiting this url:', url);

    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    return new Promise<OAuth2Client>(
      (
        resolve: (value: OAuth2Client | PromiseLike<OAuth2Client>) => void,
        reject: (reason?: unknown) => void
      ) => {
        rl.question(
          'Enter the code from that page here: ',
          async (code: string) => {
            rl.close();

            try {
              const { tokens } = await oAuth2Client.getToken(code);
              oAuth2Client.setCredentials(tokens);

              fs.writeFileSync(this.TOKEN_PATH, JSON.stringify(tokens));

              resolve(oAuth2Client);
            } catch (err) {
              reject(err);
            }
          }
        );
      }
    );
  }

  authorize(): OAuth2Client | Promise<OAuth2Client> {
    const content = fs.readFileSync(this.CREDENTIALS_PATH, 'utf-8');
    const credentials = JSON.parse(content);
    const { client_secret, client_id, redirect_uris } = credentials.installed;

    const oAuth2Client = new google.auth.OAuth2(
      client_id,
      client_secret,
      redirect_uris[0]
    );

    if (fs.existsSync(this.TOKEN_PATH)) {
      const token = fs.readFileSync(this.TOKEN_PATH, 'utf-8');
      oAuth2Client.setCredentials(JSON.parse(token));
      return oAuth2Client;
    }

    return this.getNewToken(oAuth2Client);
  }
}

import fs from 'fs';
import path from 'path';

export class LoggerService {
  private logDir: string;
  private retentionDays: number;

  constructor(logDir = 'logs', retentionDays = 7) {
    this.logDir = path.resolve(logDir);
    this.retentionDays = retentionDays;

    this.ensureLogDirectory();
    this.cleanupOldLogs();
  }

  private ensureLogDirectory(): void {
    if (!fs.existsSync(this.logDir)) {
      fs.mkdirSync(this.logDir, { recursive: true });
    }
  }

  private getLogFilePath(): string {
    const date = new Date().toISOString().split('T')[0];
    return path.join(this.logDir, `${date}.log`);
  }

  private write(level: string, message: string): void {
    const timestamp = new Date().toISOString();
    const formatted = `[${timestamp}] [${level.toUpperCase()}] ${message}\n`;
    fs.appendFileSync(this.getLogFilePath(), formatted);
  }

  private cleanupOldLogs(): void {
    const now = Date.now();

    const files = fs.readdirSync(this.logDir);

    for (const file of files) {
      if (!file.endsWith('.log')) continue;

      const filePath = path.join(this.logDir, file);
      const stats = fs.statSync(filePath);

      const ageDays = (now - stats.mtime.getTime()) / (1000 * 60 * 60 * 24);

      if (ageDays > this.retentionDays) {
        fs.unlinkSync(filePath);
      }
    }
  }

  info(message: string): void {
    this.write('INFO', message);
  }

  warn(message: string): void {
    this.write('WARN', message);
  }

  error(message: string): void {
    this.write('ERROR', message);
  }
}

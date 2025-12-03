import * as XLSX from 'xlsx';
import * as path from 'path';
import { BookingDetail } from '@modules/booking/tripcom.parse';

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export function appendBookingToExcel(
  detail: BookingDetail,
  fileName = 'booking.xlsx'
) {
  // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
  const formatTime = (time: string | undefined) => {
    if (!time) return '';
    return time.split(' ')[0];
  };

  const row = {
    DATE: detail.flightInfo?.departureDate || '',
    FLIGHT: detail.flightInfo?.flightNo || detail.flightNo,
    TIME: formatTime(detail.flightInfo?.departureTimeScheduled),
    ADULT: detail.adults,
    CHILD: detail.children,
    AIRPORT: detail.flightInfo?.departureAirportFull || '',
    BOOKING: 'Ctrip',
    ID_BOOKING: detail.orderId,
    NAME: detail.name
  };

  const excelPath = path.join(process.cwd(), fileName);
  let workbook, worksheet;

  // Nếu file đã tồn tại → load và append
  try {
    workbook = XLSX.readFile(excelPath);
    worksheet = workbook.Sheets['Booking'];
    const existingData = XLSX.utils.sheet_to_json(worksheet);

    existingData.push(row);
    const newSheet = XLSX.utils.json_to_sheet(existingData);

    workbook.Sheets['Booking'] = newSheet;
  } catch {
    // Nếu chưa có file → tạo mới
    workbook = XLSX.utils.book_new();
    worksheet = XLSX.utils.json_to_sheet([row]);
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Booking');
  }

  XLSX.writeFile(workbook, excelPath);
  console.log(`📘 Updated Excel: ${excelPath}`);
}

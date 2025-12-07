export const TRIP_COM_URL = {
  LOGIN: 'https://vbooking.ctrip.com/ivbk/accountV2/login',
  ORDER_DETAIL: 'https://vbooking.ctrip.com/ticket_order/order/detail?orderId='
};

export const LOGIN_SELECTOR = {
  USERNAME_SELECTOR:
    'input[placeholder="Please enter username/mobile number/email"]',
  PASSWORD_SELECTOR: 'input[placeholder="Please enter password"]',
  AGREE_CHECKBOX_SELECTOR: 'span.read-tips',
  LOGIN_BUTTON_SELECTOR: 'button.ant-btn.ant-btn-primary[style*="width:100%"]'
};

export const ORDER_DETAIL_SELECTOR = {
  TRAVELER: {
    TABLE_SELECTOR:
      '#order-clientList + .innercard-content .ant-table-body table',
    HIDDEN_ROW_SELECTOR: 'tr.ant-table-row:not([aria-hidden="true"])',
    ROW_SELECTOR: 'tr.ant-table-row',
    CUSTOMER_NAME_DIV_SELECTOR: 'div[data-ignorecheckblock="true"]'
  }
};

export const REGEX = {
  AIRPORT_REGEX: /([A-Za-z\s]+?)(?: Airport| International Airport)/i,
  FLIGHT_NUMBER_REGEX: /[A-Z]{1,3}\s?\d{1,4}[A-Z]?/
};

export const CRAWLER_INFORMATION = {
  DEPARTURE: 'Departure',
  ARRIVAL: 'Arrival',
  ADULTS: 'Adults',
  PREMIUM: 'Premium'
};

export interface FlightInfo {
  info?: boolean;
  departureDate?: string;
  departureTimeScheduled?: string;
  departureTimeActual?: string;
  arrivalTimeScheduled?: string;
  arrivalTimeActual?: string;
  routeFrom?: string;
  routeTo?: string;
  airport?: string;
  time?: string;
}

export interface BookingDetail {
  orderId: string;
  fullName?: string;
  adults: number;
  children: number;
  name?: string;
  platform?: string;
  flightNo?: string;
  arrival?: string;
  departure?: string;
  airport?: string | undefined;
  flightInfo?: FlightInfo;
  serviceType?: string;
  contact?: string;
  dateOfUse?: string;
  time?: string;
  bookingDate?: string;
  prices?: any;
}

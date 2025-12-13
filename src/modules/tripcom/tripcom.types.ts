export interface BookingInfo {
  no?: number;
  date: string; // DATE (Use date)
  flight: string; // FLIGHT number
  time: string; // TIME (arrival time)
  adult: number; // Number of adults
  child: number; // Number of children
  airport: string; // Airport extracted from product name
  booking: string; // Product name
  bookingId: string; // Booking ID (orderId)
  status: string; // Booking status
  notes: string; // Notes / Special request
  name: string; // Traveler name
}

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
}

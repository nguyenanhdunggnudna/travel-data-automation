// src/services/booking/tripcom.types.ts

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

import type { User, PlatformConnection, PaymentMethod } from "./user";
import type { BookingTask, Reservation } from "./task";
import type { Platform } from "./platform";
import type { AutocompleteResult, PlaceDetails } from "./restaurant";

// Auth
export interface RegisterRequest {
  email: string;
  password: string;
  name?: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  user: User;
}

export interface RefreshTokenRequest {
  refreshToken: string;
}

// Connections
export interface ConnectPlatformRequest {
  platform: Platform;
  authToken: string;
  email?: string;
  platformUserId?: string;
}

// Payment Methods
export interface AddPaymentMethodRequest {
  paymentMethodId: string; // Stripe PaymentMethod ID
}

// Tasks
export interface CreateTaskRequest {
  restaurantId: string; // Yelp business ID
  restaurantName: string;
  restaurantAddress?: string;
  restaurantLat?: number;
  restaurantLon?: number;
  platforms: Platform[];
  partySize: number;
  dateRangeStart: string; // "YYYY-MM-DD"
  dateRangeEnd: string; // "YYYY-MM-DD"
  timeWindowStart: string; // "HH:MM"
  timeWindowEnd: string; // "HH:MM"
  paymentMethodId?: string;
}

export interface UpdateTaskRequest {
  status?: "MONITORING" | "PAUSED";
  paymentMethodId?: string;
  timeWindowStart?: string;
  timeWindowEnd?: string;
}

// Restaurants
export interface RestaurantSearchRequest {
  query: string;
  sessionToken?: string;
}

// Generic responses
export interface ApiResponse<T> {
  data: T;
  message?: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface ErrorResponse {
  error: string;
  code?: string;
  statusCode: number;
}

// Compound responses
export type GetTasksResponse = PaginatedResponse<BookingTask>;
export type GetReservationsResponse = PaginatedResponse<Reservation>;
export type GetConnectionsResponse = ApiResponse<PlatformConnection[]>;
export type GetPaymentMethodsResponse = ApiResponse<PaymentMethod[]>;
export type SearchRestaurantsResponse = ApiResponse<AutocompleteResult[]>;
export type GetPlaceDetailsResponse = ApiResponse<PlaceDetails>;

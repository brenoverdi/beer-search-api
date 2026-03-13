import { z } from 'zod';

// ── Festival schemas ──────────────────────────────────────────────────────────

export const CONTINENTS = [
  'Europe',
  'North America', 
  'South America',
  'Asia',
  'Oceania',
  'Africa',
] as const;

export const FestivalFilterSchema = z.object({
  continent: z.enum(['all', ...CONTINENTS]).optional().default('all'),
});

export const CreateFestivalSchema = z.object({
  name: z.string().min(2).max(200),
  city: z.string().min(2).max(100),
  country: z.string().min(2).max(100),
  continent: z.enum(CONTINENTS),
  startDate: z.string().transform((s) => new Date(s)),
  endDate: z.string().transform((s) => new Date(s)),
  description: z.string().max(2000).optional(),
  website: z.string().url().optional(),
  imageUrl: z.string().url().optional(),
  latitude: z.number().optional(),
  longitude: z.number().optional(),
});

// ── Itinerary schemas ─────────────────────────────────────────────────────────

export const CreateItinerarySchema = z.object({
  festivalId: z.number().int().positive(),
  arrivalDate: z.string().transform((s) => new Date(s)),
  departureDate: z.string().transform((s) => new Date(s)),
});

// ── Response types ────────────────────────────────────────────────────────────

export interface FestivalResponse {
  id: number;
  name: string;
  city: string;
  country: string;
  continent: string;
  startDate: string;
  endDate: string;
  description: string | null;
  website: string | null;
  imageUrl: string | null;
  latitude: number | null;
  longitude: number | null;
}

export interface ItineraryDay {
  date: string;
  morning: string;
  afternoon: string;
  evening: string;
  notes?: string;
}

export interface GeneratedItinerary {
  overview: string;
  days: ItineraryDay[];
  beerSpots: {
    name: string;
    address: string;
    description: string;
    rating?: number;
  }[];
  hotels: {
    name: string;
    priceRange: string;
    bookingUrl: string;
    description: string;
  }[];
  tips: string[];
  [key: string]: unknown; // Index signature for Prisma JSON compatibility
}

export interface ItineraryResponse {
  id: number;
  festivalId: number;
  festival: FestivalResponse;
  arrivalDate: string;
  departureDate: string;
  generatedPlan: GeneratedItinerary;
  createdAt: string;
}

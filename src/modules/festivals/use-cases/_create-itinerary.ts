import { injectable } from 'tsyringe';
import { GoogleGenAI } from '@google/genai';
import { AppError } from '../../../middlewares/error.middleware';
import * as festivalsDb from '../../../services/db/festivals/festivals.db';
import * as authDb from '../../../services/db/auth/auth.db';
import { CreateItinerarySchema, GeneratedItinerary, ItineraryResponse } from '../festivals.model';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY ?? '' });

// Booking.com affiliate link format (replace YOUR_AFFILIATE_ID with actual ID)
const BOOKING_AFFILIATE_ID = process.env.BOOKING_AFFILIATE_ID || 'YOUR_AFFILIATE_ID';
const createBookingLink = (city: string, country: string, checkin: string, checkout: string) => {
  const destination = encodeURIComponent(`${city}, ${country}`);
  return `https://www.booking.com/searchresults.html?ss=${destination}&checkin=${checkin}&checkout=${checkout}&aid=${BOOKING_AFFILIATE_ID}`;
};

const calculateAge = (dateOfBirth: Date | null): number | null => {
  if (!dateOfBirth) return null;
  const today = new Date();
  let age = today.getFullYear() - dateOfBirth.getFullYear();
  const monthDiff = today.getMonth() - dateOfBirth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < dateOfBirth.getDate())) {
    age--;
  }
  return age;
};

const generateItineraryWithAI = async (
  festival: {
    name: string;
    city: string;
    country: string;
    startDate: Date;
    endDate: Date;
    description: string | null;
  },
  arrivalDate: Date,
  departureDate: Date,
  userAge: number | null,
  favoriteStyles: string[]
): Promise<GeneratedItinerary> => {
  if (!process.env.GEMINI_API_KEY) {
    throw new AppError(503, 'GEMINI_API_KEY is not configured');
  }

  const ageContext = userAge
    ? `The traveler is ${userAge} years old. ${userAge >= 21 ? 'They can legally drink alcohol in most countries.' : 'Note: They may be under legal drinking age in some countries.'}`
    : 'Age not provided.';

  const styleContext = favoriteStyles.length > 0
    ? `Their favorite beer styles are: ${favoriteStyles.join(', ')}.`
    : '';

  const numDays = Math.ceil((departureDate.getTime() - arrivalDate.getTime()) / (1000 * 60 * 60 * 24)) + 1;

  const prompt = `
You are a beer festival travel expert. Create a detailed itinerary for someone attending the "${festival.name}" beer festival in ${festival.city}, ${festival.country}.

Festival dates: ${festival.startDate.toLocaleDateString()} to ${festival.endDate.toLocaleDateString()}
Festival description: ${festival.description || 'A renowned beer festival'}

Travel dates:
- Arrival: ${arrivalDate.toLocaleDateString()}
- Departure: ${departureDate.toLocaleDateString()}
- Total days: ${numDays}

Traveler profile:
${ageContext}
${styleContext}

Create a comprehensive itinerary in JSON format with:
1. An overview paragraph (2-3 sentences)
2. Day-by-day breakdown with morning, afternoon, and evening activities
3. Recommended beer spots (breweries, craft beer bars, pubs) in ${festival.city} - places to visit outside festival hours
4. Hotel recommendations (budget, mid-range, luxury options)
5. Practical tips for the festival

For festival days, include festival activities. For non-festival days, suggest sightseeing and local beer experiences.

Return ONLY this JSON structure (no markdown):
{
  "overview": "string",
  "days": [
    {
      "date": "YYYY-MM-DD",
      "morning": "activity description",
      "afternoon": "activity description",
      "evening": "activity description",
      "notes": "optional tips for this day"
    }
  ],
  "beerSpots": [
    {
      "name": "spot name",
      "address": "approximate address",
      "description": "what makes it special",
      "rating": 4.5
    }
  ],
  "hotels": [
    {
      "name": "hotel name",
      "priceRange": "budget/mid-range/luxury",
      "bookingUrl": "https://booking.com/...",
      "description": "brief description"
    }
  ],
  "tips": ["tip 1", "tip 2", "tip 3"]
}`;

  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: prompt,
    config: { tools: [{ googleSearch: {} }] },
  });

  const text = (response.text ?? '').trim();
  const match = text.match(/\{[\s\S]*\}/);
  
  if (!match) {
    throw new AppError(500, 'Failed to generate itinerary');
  }

  try {
    const parsed = JSON.parse(match[0]) as GeneratedItinerary;
    
    // Add proper booking affiliate links to hotels
    const checkinStr = arrivalDate.toISOString().split('T')[0];
    const checkoutStr = departureDate.toISOString().split('T')[0];
    
    parsed.hotels = parsed.hotels.map((hotel) => ({
      ...hotel,
      bookingUrl: createBookingLink(festival.city, festival.country, checkinStr, checkoutStr),
    }));

    return parsed;
  } catch (error) {
    console.error('[CreateItinerary] Failed to parse AI response:', error);
    throw new AppError(500, 'Failed to parse generated itinerary');
  }
};

@injectable()
export class CreateItineraryUseCase {
  public async execute(userId: number, body: unknown): Promise<{ itinerary: ItineraryResponse }> {
    const { festivalId, arrivalDate, departureDate } = CreateItinerarySchema.parse(body);

    // Validate dates
    if (arrivalDate >= departureDate) {
      throw new AppError(400, 'Arrival date must be before departure date');
    }

    // Get festival
    const festival = await festivalsDb.findFestivalById(festivalId);
    if (!festival) {
      throw new AppError(404, 'Festival not found');
    }

    // Get user profile for personalization
    const user = await authDb.findUserById(userId);
    if (!user) {
      throw new AppError(404, 'User not found');
    }

    const userAge = calculateAge(user.dateOfBirth);
    const favoriteStyles = user.favoriteStyles || [];

    // Generate itinerary with AI
    const generatedPlan = await generateItineraryWithAI(
      festival,
      arrivalDate,
      departureDate,
      userAge,
      favoriteStyles
    );

    // Save to database
    const itinerary = await festivalsDb.createItinerary({
      userId,
      festivalId,
      arrivalDate,
      departureDate,
      generatedPlan,
    });

    return {
      itinerary: {
        id: itinerary.id,
        festivalId: itinerary.festivalId,
        festival: {
          id: itinerary.festival.id,
          name: itinerary.festival.name,
          city: itinerary.festival.city,
          country: itinerary.festival.country,
          continent: itinerary.festival.continent,
          startDate: itinerary.festival.startDate.toISOString(),
          endDate: itinerary.festival.endDate.toISOString(),
          description: itinerary.festival.description,
          website: itinerary.festival.website,
          imageUrl: itinerary.festival.imageUrl,
          latitude: itinerary.festival.latitude,
          longitude: itinerary.festival.longitude,
        },
        arrivalDate: itinerary.arrivalDate.toISOString(),
        departureDate: itinerary.departureDate.toISOString(),
        generatedPlan: itinerary.generatedPlan as GeneratedItinerary,
        createdAt: itinerary.createdAt.toISOString(),
      },
    };
  }
}

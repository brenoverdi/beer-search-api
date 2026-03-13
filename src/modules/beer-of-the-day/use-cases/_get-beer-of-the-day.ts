/* eslint-disable @typescript-eslint/no-unused-vars */
import { injectable, inject } from "tsyringe"
import { GoogleGenAI } from "@google/genai"
import { BeerOfTheDayDbService } from "../../../services/db/beer-of-the-day/beer-of-the-day.db"
import { AppError } from "../../../middlewares/error.middleware"

// List of amazing beers to feature
const FEATURED_BEERS = [
  "Westvleteren 12",
  "Pliny the Elder",
  "Heady Topper",
  "Toppling Goliath Kentucky Brunch",
  "3 Fonteinen Oude Geuze",
  "Hill Farmstead Edward",
  "Russian River Consecration",
  "Founders KBS",
  "Cigar City Hunahpu",
  "Cantillon Gueuze 100% Lambic",
  "De Molen Hel & Verdoemenis",
  "Rochefort 10",
  "Chimay Grande Réserve",
  "Orval",
  "Saison Dupont",
  "Mikkeller Beer Geek Brunch Weasel",
  "Stone Enjoy By IPA",
  "Sierra Nevada Pale Ale",
  "Samuel Adams Boston Lager",
  "Paulaner Hefe-Weißbier",
  "Augustiner Helles",
  "Pilsner Urquell",
  "Guinness Draught",
  "Duvel",
  "La Trappe Quadrupel",
  "Ayinger Celebrator",
  "Schneider Weisse Aventinus",
  "Anchor Steam Beer",
  "Brooklyn Lager",
  "Bell's Two Hearted Ale",
  "Dogfish Head 60 Minute IPA",
]

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY ?? "" })

@injectable()
export class GetBeerOfTheDayUseCase {
  constructor(
    @inject(BeerOfTheDayDbService)
    private beerOfTheDayDb: BeerOfTheDayDbService
  ) {}

  async execute() {
    // Check if we already have today's beer
    const existingBeer = await this.beerOfTheDayDb.getTodayBeer()
    if (existingBeer) {
      return {
        date: existingBeer.date.toISOString().split("T")[0],
        beer: existingBeer.beerData as Record<string, unknown>,
        funFact: existingBeer.funFact || "",
      }
    }

    // Pick a random beer from the list
    const randomIndex = Math.floor(Math.random() * FEATURED_BEERS.length)
    const beerName = FEATURED_BEERS[randomIndex]

    // Use Gemini to get beer details and fun fact
    const prompt = `You are a beer expert. Search for the beer "${beerName}" and provide:

1. Beer details in JSON format
2. A fun, interesting fact about this specific beer that beer lovers would enjoy

Return ONLY this JSON format (no markdown):
{
  "beer": {
    "name": "${beerName}",
    "brewery": "brewery name",
    "style": "beer style",
    "abv": 0.0,
    "ibu": 0,
    "country": "country of origin",
    "description": "brief tasting notes and description",
    "averageRating": 4.5
  },
  "funFact": "An interesting fact about this beer. Make it engaging and informative - could be about history, brewing process, awards, or unique ingredients."
}

IMPORTANT:
- abv should be a number (e.g., 10.2)
- ibu should be an integer (e.g., 65)
- averageRating should be between 1.0 and 5.0
- funFact should be 1-2 sentences, engaging and educational
- Output ONLY valid JSON, no explanation`

    try {
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: prompt,
        config: {
          tools: [{ googleSearch: {} }],
          temperature: 0.7,
        },
      })

      const text = response.text?.replace(/```json\n?|\n?```/g, "").trim() || ""
      let data: { beer: Record<string, unknown>; funFact: string }

      try {
        data = JSON.parse(text)
      } catch {
        // If JSON parsing fails, create default data
        data = {
          beer: {
            name: beerName,
            brewery: "Unknown",
            style: "Unknown",
            abv: null,
            ibu: null,
            country: "Unknown",
            description: "A highly acclaimed craft beer.",
            averageRating: null,
          },
          funFact: "This is one of the most sought-after beers in the world!",
        }
      }

      // Save to database
      const saved = await this.beerOfTheDayDb.createTodayBeer({
        beerName,
        beerData: data.beer,
        funFact: data.funFact,
      })

      return {
        date: saved.date.toISOString().split("T")[0],
        beer: saved.beerData as Record<string, unknown>,
        funFact: saved.funFact || "",
      }
    } catch (_error) {
      throw new AppError(500, "Failed to generate Beer of the Day")
    }
  }
}

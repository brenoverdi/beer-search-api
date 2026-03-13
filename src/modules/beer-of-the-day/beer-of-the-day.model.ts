import { z } from "zod"

export const BeerOfTheDaySchema = z.object({
  id: z.number(),
  date: z.date(),
  beerName: z.string(),
  beerData: z.object({
    name: z.string(),
    brewery: z.string().optional(),
    style: z.string().optional(),
    abv: z.number().optional(),
    ibu: z.number().optional(),
    country: z.string().optional(),
    description: z.string().optional(),
    averageRating: z.number().optional(),
    imageUrl: z.string().optional(),
  }),
  funFact: z.string().nullable(),
  createdAt: z.date(),
})

export type BeerOfTheDay = z.infer<typeof BeerOfTheDaySchema>

export const BeerOfTheDayResponseSchema = z.object({
  date: z.string(),
  beer: z.object({
    name: z.string(),
    brewery: z.string().optional(),
    style: z.string().optional(),
    abv: z.number().optional(),
    ibu: z.number().optional(),
    country: z.string().optional(),
    description: z.string().optional(),
    averageRating: z.number().optional(),
    imageUrl: z.string().optional(),
  }),
  funFact: z.string(),
})

export type BeerOfTheDayResponse = z.infer<typeof BeerOfTheDayResponseSchema>

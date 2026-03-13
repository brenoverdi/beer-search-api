import { z } from "zod"

export const BrewerySchema = z.object({
  id: z.string(),
  name: z.string(),
  brewery_type: z.string().nullable(),
  address_1: z.string().nullable(),
  address_2: z.string().nullable(),
  address_3: z.string().nullable(),
  city: z.string().nullable(),
  state_province: z.string().nullable(),
  postal_code: z.string().nullable(),
  country: z.string().nullable(),
  longitude: z.string().nullable(),
  latitude: z.string().nullable(),
  phone: z.string().nullable(),
  website_url: z.string().nullable(),
  state: z.string().nullable(),
  street: z.string().nullable(),
})

export type Brewery = z.infer<typeof BrewerySchema>

export const BrewerySearchParamsSchema = z.object({
  city: z.string().optional(),
  state: z.string().optional(),
  country: z.string().optional(),
  latitude: z.number().optional(),
  longitude: z.number().optional(),
  per_page: z.number().min(1).max(200).default(50),
})

export type BrewerySearchParams = z.infer<typeof BrewerySearchParamsSchema>

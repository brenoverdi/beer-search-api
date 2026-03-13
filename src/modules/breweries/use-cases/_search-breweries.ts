import { injectable } from "tsyringe"
import { breweryApiService } from "../../../services/brewery/brewery-api.service"
import { AppError } from "../../../middlewares/error.middleware"

@injectable()
export class SearchBreweriesUseCase {
  async execute(params: {
    latitude?: number
    longitude?: number
    city?: string
    state?: string
    country?: string
    limit?: number
  }) {
    // Validate at least one search criteria is provided
    if (
      params.latitude === undefined &&
      !params.city &&
      !params.state &&
      !params.country
    ) {
      throw new AppError(
        400,
        "At least one search criteria (coordinates, city, state, or country) is required"
      )
    }

    const breweries = await breweryApiService.searchByLocation({
      latitude: params.latitude,
      longitude: params.longitude,
      city: params.city,
      state: params.state,
      country: params.country,
      per_page: params.limit || 50,
    })

    // Filter out breweries without coordinates for map display
    const breweriesWithCoords = breweries.filter(
      (b) => b.latitude && b.longitude
    )

    return {
      total: breweries.length,
      withCoordinates: breweriesWithCoords.length,
      breweries: breweriesWithCoords.map((b) => ({
        id: b.id,
        name: b.name,
        type: b.brewery_type,
        address: [b.address_1, b.city, b.state_province, b.postal_code]
          .filter(Boolean)
          .join(", "),
        city: b.city,
        state: b.state_province || b.state,
        country: b.country,
        latitude: parseFloat(b.latitude!),
        longitude: parseFloat(b.longitude!),
        phone: b.phone,
        website: b.website_url,
      })),
    }
  }
}

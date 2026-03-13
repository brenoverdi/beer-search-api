import axios from "axios"
import { Brewery, BrewerySearchParams } from "../../modules/breweries/breweries.model"

const OPENBREWERYDB_BASE_URL = "https://api.openbrewerydb.org/v1/breweries"

export class BreweryApiService {
  /**
   * Search breweries by location (city, state, country or coordinates)
   */
  async searchByLocation(params: BrewerySearchParams): Promise<Brewery[]> {
    const queryParams = new URLSearchParams()

    if (params.latitude !== undefined && params.longitude !== undefined) {
      // Search by coordinates (uses dist endpoint)
      const url = `${OPENBREWERYDB_BASE_URL}?by_dist=${params.latitude},${params.longitude}&per_page=${params.per_page || 50}`
      const response = await axios.get(url)
      return response.data as Brewery[]
    }

    if (params.city) {
      queryParams.append("by_city", params.city.replace(/ /g, "_"))
    }
    if (params.state) {
      queryParams.append("by_state", params.state.replace(/ /g, "_"))
    }
    if (params.country) {
      queryParams.append("by_country", params.country.replace(/ /g, "_"))
    }
    queryParams.append("per_page", String(params.per_page || 50))

    const url = `${OPENBREWERYDB_BASE_URL}?${queryParams.toString()}`
    const response = await axios.get(url)
    return response.data as Brewery[]
  }

  /**
   * Get a single brewery by ID
   */
  async getById(id: string): Promise<Brewery | null> {
    try {
      const response = await axios.get(`${OPENBREWERYDB_BASE_URL}/${id}`)
      return response.data as Brewery
    } catch {
      return null
    }
  }

  /**
   * Search breweries by name
   */
  async searchByName(name: string, limit: number = 20): Promise<Brewery[]> {
    const url = `${OPENBREWERYDB_BASE_URL}?by_name=${encodeURIComponent(name)}&per_page=${limit}`
    const response = await axios.get(url)
    return response.data as Brewery[]
  }

  /**
   * Get random breweries
   */
  async getRandom(count: number = 10): Promise<Brewery[]> {
    const url = `${OPENBREWERYDB_BASE_URL}/random?size=${count}`
    const response = await axios.get(url)
    return response.data as Brewery[]
  }
}

export const breweryApiService = new BreweryApiService()

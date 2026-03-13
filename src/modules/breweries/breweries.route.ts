import { Router, Request, Response, NextFunction } from "express"
import { container } from "tsyringe"
import { SearchBreweriesUseCase } from "./use-cases/_search-breweries"

const router = Router()

// GET /breweries/search - Search breweries by location
router.get(
  "/search",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const {
        lat,
        lng,
        city,
        state,
        country,
        limit,
      } = req.query

      const useCase = container.resolve(SearchBreweriesUseCase)
      const result = await useCase.execute({
        latitude: lat ? parseFloat(lat as string) : undefined,
        longitude: lng ? parseFloat(lng as string) : undefined,
        city: city as string | undefined,
        state: state as string | undefined,
        country: country as string | undefined,
        limit: limit ? parseInt(limit as string, 10) : 50,
      })

      res.json(result)
    } catch (error) {
      next(error)
    }
  }
)

export default router

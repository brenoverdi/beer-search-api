import { Router, Request, Response, NextFunction } from "express"
import { container } from "tsyringe"
import { GetBeerOfTheDayUseCase } from "./use-cases/_get-beer-of-the-day"

const router = Router()

// GET /beer-of-the-day - Get today's featured beer
router.get("/", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const useCase = container.resolve(GetBeerOfTheDayUseCase)
    const result = await useCase.execute()
    res.json(result)
  } catch (error) {
    next(error)
  }
})

export default router

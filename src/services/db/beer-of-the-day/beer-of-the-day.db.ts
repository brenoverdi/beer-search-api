import { injectable } from "tsyringe"
import prismaClient from "../../../utils/prisma-client/prisma-client"

@injectable()
export class BeerOfTheDayDbService {
  async getTodayBeer() {
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    return prismaClient.beerOfTheDay.findUnique({
      where: { date: today },
    })
  }

  async createTodayBeer(data: {
    beerName: string
    beerData: object
    funFact: string
  }) {
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    return prismaClient.beerOfTheDay.create({
      data: {
        date: today,
        beerName: data.beerName,
        beerData: data.beerData,
        funFact: data.funFact,
      },
    })
  }

  async getRecentBeers(limit: number = 7) {
    return prismaClient.beerOfTheDay.findMany({
      orderBy: { date: "desc" },
      take: limit,
    })
  }
}

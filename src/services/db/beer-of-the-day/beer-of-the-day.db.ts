import { injectable } from "tsyringe"
import prismaClient from "../../prisma/index"

@injectable()
export class BeerOfTheDayDbService {
  async getTodayBeer() {
    const today = new Date()
    const utcDate = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()))

    return prismaClient.beerOfTheDay.findUnique({
      where: { date: utcDate },
    })
  }

  async createTodayBeer(data: {
    beerName: string
    beerData: object
    funFact: string
  }) {
    const today = new Date()
    const utcDate = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()))

    return prismaClient.beerOfTheDay.create({
      data: {
        date: utcDate,
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

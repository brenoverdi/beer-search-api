import prisma from '../../prisma/index';

// ── Types ────────────────────────────────────────────────────────────────────

export interface NormalizedBeer {
  id: string;
  query: string;
  beer_name: string;
  brewery: string;
  style: string;
  abv: number | null;
  ibu: number | null;
  check_ins: number | null;
  rating_score: number | null;
  rating_count: number | null;
  description: string | null;
}

// ── DB helpers ───────────────────────────────────────────────────────────────

export const slugify = (name: string): string =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 200);

export const upsertBeer = async (beer: NormalizedBeer) => {
  const id = slugify(beer.beer_name);
  return prisma.beer.upsert({
    where: { id },
    create: {
      id,
      beerName: beer.beer_name,
      brewery: beer.brewery,
      style: beer.style,
      abv: beer.abv,
      ibu: beer.ibu,
      checkIns: beer.check_ins,
      ratingScore: beer.rating_score,
      ratingCount: beer.rating_count,
      description: beer.description,
    },
    update: {
      brewery: beer.brewery,
      style: beer.style,
      abv: beer.abv,
      ibu: beer.ibu,
      checkIns: beer.check_ins,
      ratingScore: beer.rating_score,
      ratingCount: beer.rating_count,
      description: beer.description,
    },
  });
};

export const findBeersByIds = async (ids: string[]) =>
  prisma.beer.findMany({ where: { id: { in: ids } } });

export const recordSearchHistory = async (
  userId: number | null,
  query: string,
  source: string,
  resultCount: number,
) =>
  prisma.searchHistory.create({ data: { userId, query, source, resultCount } });

export const getPopularFromDb = async (limit = 10) =>
  prisma.beer.findMany({
    orderBy: [{ ratingScore: 'desc' }, { beerName: 'asc' }],
    take: limit,
  });

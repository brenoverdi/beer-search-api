/**
 * Clear Popular Beers Cache Script
 * 
 * Deletes popular beers from the database so they get re-fetched with updated scraper logic.
 * This is useful when the scraper has been fixed and you want fresh data.
 * 
 * Run with: npm run clear:popular
 */

import 'reflect-metadata';
import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';
import { POPULAR_NAMES } from '../modules/beers/beers.model';
import * as beersDb from '../services/db/beers/beers.db';

dotenv.config();

const prisma = new PrismaClient();

async function clearPopularCache() {
  console.log('🗑️  Clearing popular beers cache from database...\n');
  
  const slugIds = POPULAR_NAMES.map((n) => beersDb.slugify(n));
  
  console.log('📋 Popular beers to clear:');
  POPULAR_NAMES.forEach((name, i) => {
    console.log(`   ${i + 1}. ${name} (slug: ${slugIds[i]})`);
  });
  console.log();

  try {
    const result = await prisma.beer.deleteMany({
      where: {
        id: {
          in: slugIds,
        },
      },
    });

    console.log(`✅ Successfully deleted ${result.count} beer(s) from database`);
    console.log('\n💡 Next time you hit /api/beers/popular, fresh data will be fetched from Untappd!\n');
  } catch (error) {
    console.error('❌ Error clearing cache:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

clearPopularCache();

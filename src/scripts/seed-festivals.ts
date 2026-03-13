/**
 * Seed Festivals Script
 * 
 * Seeds the database with curated beer festivals from around the world.
 * Run with: npm run seed:festivals
 */

import 'reflect-metadata';
import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';
import { BEER_FESTIVALS } from '../data/festivals-data';

dotenv.config();

const prisma = new PrismaClient();

async function seedFestivals() {
  console.log('🍺 Starting festival seeding...\n');

  // Check if we already have festivals
  const existingCount = await prisma.festival.count();
  if (existingCount > 0) {
    console.log(`Found ${existingCount} existing festivals.`);
    const shouldForce = process.argv.includes('--force');
    if (!shouldForce) {
      console.log('Use --force flag to re-seed (will skip duplicates).');
      console.log('Exiting without changes.');
      return;
    }
  }

  let totalAdded = 0;
  let totalSkipped = 0;

  console.log(`📋 Processing ${BEER_FESTIVALS.length} festivals...\n`);

  for (const festival of BEER_FESTIVALS) {
    try {
      // Check if festival already exists
      const existing = await prisma.festival.findFirst({
        where: {
          name: festival.name,
          city: festival.city,
        },
      });

      if (existing) {
        console.log(`   ⏭️  Skipping "${festival.name}" (already exists)`);
        totalSkipped++;
        continue;
      }

      await prisma.festival.create({
        data: {
          name: festival.name,
          city: festival.city,
          country: festival.country,
          continent: festival.continent,
          startDate: new Date(festival.startDate),
          endDate: new Date(festival.endDate),
          description: festival.description,
          website: festival.website,
        },
      });

      console.log(`   ✅ Added "${festival.name}" (${festival.city}, ${festival.country})`);
      totalAdded++;
    } catch (error) {
      console.error(`   ❌ Failed to add "${festival.name}":`, error);
    }
  }

  console.log(`\n🎉 Seeding complete!`);
  console.log(`   Added: ${totalAdded} festivals`);
  console.log(`   Skipped: ${totalSkipped} festivals`);
  
  const finalCount = await prisma.festival.count();
  console.log(`   Total festivals in database: ${finalCount}`);
}

// Run the script
seedFestivals()
  .catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

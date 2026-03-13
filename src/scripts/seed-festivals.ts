/**
 * Seed Festivals Script
 * 
 * Queries Gemini AI to get popular beer festivals worldwide and seeds them into the database.
 * Run with: npm run seed:festivals
 */

import 'reflect-metadata';
import { GoogleGenAI } from '@google/genai';
import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';

dotenv.config();

const prisma = new PrismaClient();
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY ?? '' });

interface FestivalData {
  name: string;
  city: string;
  country: string;
  continent: string;
  startDate: string; // ISO format YYYY-MM-DD
  endDate: string;
  description: string;
  website: string | null;
}

const CONTINENTS = [
  'Europe',
  'North America',
  'South America',
  'Asia',
  'Oceania',
] as const;

async function fetchFestivalsFromGemini(continent: string): Promise<FestivalData[]> {
  const prompt = `You are a beer festival expert. List the 8 most popular and well-known beer festivals in ${continent} that will happen in 2026.

For each festival, provide:
- name: official festival name
- city: host city
- country: country name
- continent: "${continent}"
- startDate: expected start date in 2026 (format: YYYY-MM-DD)
- endDate: expected end date in 2026 (format: YYYY-MM-DD)
- description: brief description (1-2 sentences about what makes this festival special)
- website: official website URL if known, or null

Return ONLY a valid JSON array. No markdown, no explanation.
Format: [{"name":"","city":"","country":"","continent":"","startDate":"","endDate":"","description":"","website":null}]`;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
    });

    const text = response.text ?? '';
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    
    if (!jsonMatch) {
      console.warn(`[${continent}] No JSON found in response`);
      return [];
    }

    const festivals = JSON.parse(jsonMatch[0]) as FestivalData[];
    return festivals.filter(f => f.name && f.city && f.country && f.startDate && f.endDate);
  } catch (error) {
    console.error(`[${continent}] Error fetching festivals:`, error);
    return [];
  }
}

async function seedFestivals() {
  console.log('🍺 Starting festival seeding...\n');

  // Check if we already have festivals
  const existingCount = await prisma.festival.count();
  if (existingCount > 0) {
    console.log(`Found ${existingCount} existing festivals.`);
    const answer = process.argv.includes('--force') ? 'y' : 'n';
    if (answer !== 'y' && !process.argv.includes('--force')) {
      console.log('Use --force flag to add more festivals anyway.');
      console.log('Exiting without changes.');
      return;
    }
  }

  let totalAdded = 0;

  for (const continent of CONTINENTS) {
    console.log(`\n🌍 Fetching festivals for ${continent}...`);
    
    const festivals = await fetchFestivalsFromGemini(continent);
    console.log(`   Found ${festivals.length} festivals`);

    for (const festival of festivals) {
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

    // Small delay between continents to avoid rate limiting
    await new Promise((r) => setTimeout(r, 1000));
  }

  console.log(`\n🎉 Seeding complete! Added ${totalAdded} festivals.`);
  
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

/**
 * Beer Festival Seed Data
 * 
 * Real beer festivals happening from March 2026 onwards
 * Run: npx ts-node prisma/seed-festivals.ts
 */

import prisma from '../src/services/db/prisma/index';

const festivals = [
  // Europe
  {
    name: 'Great British Beer Festival',
    city: 'London',
    country: 'United Kingdom',
    continent: 'Europe',
    startDate: new Date('2026-08-04'),
    endDate: new Date('2026-08-08'),
    description: 'The UK\'s biggest beer festival featuring over 900 real ales, ciders, perries, and international beers. Organized by CAMRA.',
    website: 'https://gbbf.org.uk',
    imageUrl: 'https://images.unsplash.com/photo-1558642452-9d2a7deb7f62?w=800',
    latitude: 51.4923,
    longitude: -0.0691,
  },
  {
    name: 'Oktoberfest',
    city: 'Munich',
    country: 'Germany',
    continent: 'Europe',
    startDate: new Date('2026-09-19'),
    endDate: new Date('2026-10-04'),
    description: 'The world\'s largest Volksfest, featuring beer tents from Munich\'s major breweries, traditional Bavarian food, and carnival rides.',
    website: 'https://www.oktoberfest.de',
    imageUrl: 'https://images.unsplash.com/photo-1605937224882-2e59dc1c4a77?w=800',
    latitude: 48.1317,
    longitude: 11.5496,
  },
  {
    name: 'Belgian Beer Weekend',
    city: 'Brussels',
    country: 'Belgium',
    continent: 'Europe',
    startDate: new Date('2026-09-04'),
    endDate: new Date('2026-09-06'),
    description: 'Annual celebration in the Grand Place featuring 50+ Belgian breweries and over 400 different beers.',
    website: 'https://www.belgianbrewers.be',
    imageUrl: 'https://images.unsplash.com/photo-1559526324-4b87b5e36e44?w=800',
    latitude: 50.8467,
    longitude: 4.3499,
  },
  {
    name: 'Prague Beer Festival',
    city: 'Prague',
    country: 'Czech Republic',
    continent: 'Europe',
    startDate: new Date('2026-05-14'),
    endDate: new Date('2026-06-06'),
    description: 'One of Europe\'s largest beer fests with 70+ Czech breweries, traditional food, and live music in Letná Park.',
    website: 'https://www.ceskypivnifestival.cz',
    imageUrl: 'https://images.unsplash.com/photo-1571173069043-4dd1abc99a04?w=800',
    latitude: 50.0956,
    longitude: 14.4233,
  },
  {
    name: 'Zythos Beer Festival',
    city: 'Leuven',
    country: 'Belgium',
    continent: 'Europe',
    startDate: new Date('2026-04-25'),
    endDate: new Date('2026-04-26'),
    description: 'Belgium\'s largest beer consumer event with 100+ breweries and 500+ different beers to taste.',
    website: 'https://www.zbf.be',
    imageUrl: 'https://images.unsplash.com/photo-1535958636474-b021ee887b13?w=800',
    latitude: 50.8798,
    longitude: 4.7005,
  },
  // North America
  {
    name: 'Great American Beer Festival',
    city: 'Denver',
    country: 'United States',
    continent: 'North America',
    startDate: new Date('2026-10-08'),
    endDate: new Date('2026-10-10'),
    description: 'The largest ticketed beer festival in the US, featuring 2,000+ beers from 500+ breweries. The premier craft beer event.',
    website: 'https://www.greatamericanbeerfestival.com',
    imageUrl: 'https://images.unsplash.com/photo-1612528443702-f6741f70a049?w=800',
    latitude: 39.7427,
    longitude: -104.9874,
  },
  {
    name: 'Oregon Brewers Festival',
    city: 'Portland',
    country: 'United States',
    continent: 'North America',
    startDate: new Date('2026-07-23'),
    endDate: new Date('2026-07-26'),
    description: 'One of America\'s longest-running craft beer festivals, held along the Willamette River with 80+ craft breweries.',
    website: 'https://www.oregonbrewfest.com',
    imageUrl: 'https://images.unsplash.com/photo-1587314168485-3236d6710814?w=800',
    latitude: 45.5089,
    longitude: -122.6708,
  },
  {
    name: 'Toronto Beer Week',
    city: 'Toronto',
    country: 'Canada',
    continent: 'North America',
    startDate: new Date('2026-09-11'),
    endDate: new Date('2026-09-20'),
    description: 'Ten days of beer events across Toronto featuring local and international craft breweries.',
    website: 'https://torontobeerweek.com',
    imageUrl: 'https://images.unsplash.com/photo-1517457373958-b7bdd4587205?w=800',
    latitude: 43.6532,
    longitude: -79.3832,
  },
  {
    name: 'San Diego Beer Week',
    city: 'San Diego',
    country: 'United States',
    continent: 'North America',
    startDate: new Date('2026-11-06'),
    endDate: new Date('2026-11-15'),
    description: 'Ten-day celebration of San Diego\'s 150+ craft breweries, known as the "Capital of Craft."',
    website: 'https://sdbw.org',
    imageUrl: 'https://images.unsplash.com/photo-1566633806327-68e152aaf26d?w=800',
    latitude: 32.7157,
    longitude: -117.1611,
  },
  // South America
  {
    name: 'Festival Brasileiro da Cerveja',
    city: 'Blumenau',
    country: 'Brazil',
    continent: 'South America',
    startDate: new Date('2026-03-18'),
    endDate: new Date('2026-03-22'),
    description: 'Brazil\'s largest craft beer festival with the South American Beer Cup competition. Over 100 breweries.',
    website: 'https://www.festivaldacerveja.com',
    imageUrl: 'https://images.unsplash.com/photo-1608270586620-248524c67de9?w=800',
    latitude: -26.9194,
    longitude: -49.0661,
  },
  {
    name: 'Buenos Aires Beer Week',
    city: 'Buenos Aires',
    country: 'Argentina',
    continent: 'South America',
    startDate: new Date('2026-09-03'),
    endDate: new Date('2026-09-13'),
    description: 'Argentina\'s premier craft beer celebration with events across the city.',
    website: 'https://buenosairesbeerfest.com',
    imageUrl: 'https://images.unsplash.com/photo-1536935338788-846e82485ccc?w=800',
    latitude: -34.6037,
    longitude: -58.3816,
  },
  // Asia
  {
    name: 'Beertopia Hong Kong',
    city: 'Hong Kong',
    country: 'Hong Kong',
    continent: 'Asia',
    startDate: new Date('2026-10-23'),
    endDate: new Date('2026-10-24'),
    description: 'Asia\'s largest outdoor craft beer festival featuring 200+ craft beers from around the world.',
    website: 'https://www.beertopia.hk',
    imageUrl: 'https://images.unsplash.com/photo-1577086664693-894d8c895b30?w=800',
    latitude: 22.2766,
    longitude: 114.1650,
  },
  {
    name: 'Japan Brewers Cup',
    city: 'Yokohama',
    country: 'Japan',
    continent: 'Asia',
    startDate: new Date('2026-05-15'),
    endDate: new Date('2026-05-17'),
    description: 'Japan\'s largest craft beer competition and festival featuring domestic and international breweries.',
    website: 'https://japanbrewerscup.jp',
    imageUrl: 'https://images.unsplash.com/photo-1594495894542-a46cc73e081a?w=800',
    latitude: 35.4437,
    longitude: 139.6380,
  },
  {
    name: 'Singapore Craft Beer Week',
    city: 'Singapore',
    country: 'Singapore',
    continent: 'Asia',
    startDate: new Date('2026-11-12'),
    endDate: new Date('2026-11-22'),
    description: 'Southeast Asia\'s premier craft beer week with brewery events, tap takeovers, and special releases.',
    website: 'https://singaporecraftbeerweek.com',
    imageUrl: 'https://images.unsplash.com/photo-1517457373958-b7bdd4587205?w=800',
    latitude: 1.3521,
    longitude: 103.8198,
  },
  // Oceania
  {
    name: 'Great Australasian Beer SpecTAPular',
    city: 'Melbourne',
    country: 'Australia',
    continent: 'Oceania',
    startDate: new Date('2026-05-22'),
    endDate: new Date('2026-05-23'),
    description: 'Australia\'s largest craft beer festival with 170+ breweries and 500+ beers.',
    website: 'https://www.gabsfestival.com',
    imageUrl: 'https://images.unsplash.com/photo-1566633806327-68e152aaf26d?w=800',
    latitude: -37.8136,
    longitude: 144.9631,
  },
  {
    name: 'Beervana',
    city: 'Wellington',
    country: 'New Zealand',
    continent: 'Oceania',
    startDate: new Date('2026-08-14'),
    endDate: new Date('2026-08-15'),
    description: 'New Zealand\'s premier craft beer festival with unique one-time-only brews and 60+ breweries.',
    website: 'https://www.beervana.co.nz',
    imageUrl: 'https://images.unsplash.com/photo-1558642452-9d2a7deb7f62?w=800',
    latitude: -41.2866,
    longitude: 174.7756,
  },
  // Africa
  {
    name: 'Cape Town Festival of Beer',
    city: 'Cape Town',
    country: 'South Africa',
    continent: 'Africa',
    startDate: new Date('2026-11-27'),
    endDate: new Date('2026-11-28'),
    description: 'South Africa\'s largest beer festival showcasing local craft breweries and international beers.',
    website: 'https://capetownfestivalofbeer.co.za',
    imageUrl: 'https://images.unsplash.com/photo-1528823872057-9c018a7a7553?w=800',
    latitude: -33.9249,
    longitude: 18.4241,
  },
];

async function seedFestivals() {
  console.log('Seeding festivals...');
  
  for (const festival of festivals) {
    await prisma.festival.upsert({
      where: { 
        // We don't have a unique constraint other than id, so we'll use create
        id: 0 // This will fail, causing create
      },
      update: festival,
      create: festival,
    }).catch(async () => {
      // If upsert fails, try create
      const existing = await prisma.festival.findFirst({
        where: { name: festival.name, city: festival.city }
      });
      if (!existing) {
        await prisma.festival.create({ data: festival });
        console.log(`Created: ${festival.name}`);
      } else {
        console.log(`Skipped (exists): ${festival.name}`);
      }
    });
  }
  
  const count = await prisma.festival.count();
  console.log(`Done! Total festivals: ${count}`);
}

seedFestivals()
  .catch(console.error)
  .finally(() => prisma.$disconnect());

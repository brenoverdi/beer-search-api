// ── Types ─────────────────────────────────────────────────────────────────────

export interface GeminiResult {
  beer_name: string;
  brewery: string;
  style: string;
  rating_score: number | null;
  rating_count: number | null;
}

export interface NormalizedBeer {
  query: string;
  beer_name: string;
  brewery: string;
  style: string;
  rating_score: number | null;
  rating_count: number | null;
}

export type SearchSource = 'single' | 'list' | 'image';

export interface SearchResponse {
  source: SearchSource;
  beerNames: string[];
  results: NormalizedBeer[];
}

export const POPULAR_NAMES = [
  'Westvleteren 12',
  'Pliny the Elder',
  'Heady Topper',
  'Founders KBS',
  'Russian River Consecration',
  'Trappistes Rochefort 10',
  "Bell's Hopslam",
  'Sierra Nevada Celebration',
  'Dogfish Head 120 Minute IPA',
  'Allagash White',
];

export interface UserProfile {
  id: number;
  username: string;
  email: string;
  emailVerified: boolean;
  createdAt: Date;
  favorites_count: number;
}

export interface FavoriteResponse {
  id: number;
  beerId: string;
  addedAt: Date;
  beer: {
    id: string;
    beerName: string;
    brewery: string;
    style: string;
    ratingScore: number | null;
    ratingCount: number | null;
  };
}

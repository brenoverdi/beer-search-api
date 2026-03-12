# 🍺 Beer Search API

Backend API for the Beer Search application - search, discover, and track your favorite craft beers powered by Google Gemini AI.

## 🚀 Features

- **AI-Powered Search**: Leverages Google Gemini 2.5 Flash with Google Search grounding to extract accurate beer data from Untappd
- **Multi-Input Search**: 
  - Single beer name
  - Batch list of beers
  - Image recognition (extract beer names from photos)
- **User Management**: JWT-based authentication with email verification via Resend
- **Favorites & Lists**: Save favorite beers and organize them into custom lists
- **Smart Caching**: DB-first caching with NeonDB + in-memory cache for optimal performance
- **Rate Limiting**: Intelligent retry logic with exponential backoff for Gemini API calls

## 🛠 Tech Stack

- **Runtime**: Node.js 18+ with TypeScript
- **Framework**: Express.js 4
- **Database**: PostgreSQL (NeonDB) with Prisma ORM 6.19.2
- **AI**: Google Gemini 2.5 Flash (`@google/genai`)
- **Auth**: JWT + bcryptjs
- **Email**: Resend
- **File Upload**: Multer
- **Cache**: Node-cache (in-memory)
- **Deployment**: Vercel Serverless

## 📦 Installation

### Prerequisites

- Node.js 18+
- PostgreSQL database (or NeonDB account)
- Google Gemini API key
- Resend API key

### Setup

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd beer-search-api
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Configure environment variables**
   
   Create a `.env` file in the root:
   ```env
   # Database
   DATABASE_URL="postgresql://user:password@host:5432/database?sslmode=require"
   
   # API Keys
   GEMINI_API_KEY="your-google-gemini-api-key"
   RESEND_API_KEY="your-resend-api-key"
   
   # JWT
   JWT_SECRET="your-super-secret-jwt-key-min-32-chars"
   
   # Frontend
   FRONTEND_URL="http://localhost:5173"
   
   # Email
   FROM_EMAIL="noreply@yourdomain.com"
   
   # Server
   PORT=3000
   ```

4. **Generate Prisma client**
   ```bash
   npm run prisma:generate
   ```

5. **Run database migrations**
   ```bash
   npm run prisma:migrate
   ```

6. **Start development server**
   ```bash
   npm run dev
   ```

The API will be available at `http://localhost:3000`

## 📡 API Endpoints

### Health
- `GET /api/health` - API health check

### Authentication
- `POST /api/auth/register` - Register new user
- `POST /api/auth/verify-email` - Verify email with OTP
- `POST /api/auth/login` - Login user
- `POST /api/auth/refresh` - Refresh JWT token
- `GET /api/auth/me` - Get current user (requires auth)

### Beers
- `POST /api/beers/search` - Search beers (single, list, or image)
  - Body: `{ beers: string | string[] }` or `FormData` with `image` field
  - Returns: `{ source, beerNames, results[] }`
- `GET /api/beers/popular` - Get popular beers (cached)
- `GET /api/beers/:id` - Get beer details

### Users
- `GET /api/users/:id` - Get user profile
- `PUT /api/users/:id` - Update user profile (requires auth)

### Lists & Favorites
- `GET /api/users/:userId/favorites` - Get user favorites
- `POST /api/users/:userId/favorites` - Add to favorites
- `DELETE /api/users/:userId/favorites/:beerId` - Remove from favorites
- `GET /api/users/:userId/lists` - Get user lists
- `POST /api/users/:userId/lists` - Create new list
- `GET /api/users/:userId/lists/:listId` - Get list details
- `PUT /api/users/:userId/lists/:listId` - Update list
- `DELETE /api/users/:userId/lists/:listId` - Delete list
- `POST /api/users/:userId/lists/:listId/items` - Add beer to list
- `DELETE /api/users/:userId/lists/:listId/items/:beerId` - Remove beer from list

## 🧪 Development

```bash
# Run in development mode with hot reload
npm run dev

# Build for production
npm run build

# Start production server
npm start

# Run linter
npm run lint

# Fix linting issues
npm run lint:fix

# Open Prisma Studio (DB GUI)
npm run prisma:studio
```

## 🚢 Deployment

### Vercel

1. **Install Vercel CLI**
   ```bash
   npm i -g vercel
   ```

2. **Deploy**
   ```bash
   vercel
   ```

3. **Set environment variables** in Vercel dashboard:
   - `DATABASE_URL`
   - `GEMINI_API_KEY`
   - `RESEND_API_KEY`
   - `JWT_SECRET`
   - `FRONTEND_URL`
   - `FROM_EMAIL`

The `vercel-build` script will automatically run Prisma generation and TypeScript compilation.

## 📁 Project Structure

```
beer-search-api/
├── prisma/
│   └── schema.prisma      # Database schema
├── src/
│   ├── middlewares/       # Express middlewares
│   ├── modules/
│   │   ├── auth/          # Authentication logic
│   │   ├── beers/         # Beer search & data
│   │   ├── users/         # User management
│   │   └── lists/         # Lists & favorites
│   ├── services/
│   │   ├── cache/         # In-memory caching
│   │   └── db/            # Database helpers
│   ├── api.ts             # Express app setup
│   └── server.ts          # Server entry point
├── uploads/               # Temporary image uploads
└── package.json
```

## 🔐 Security

- JWT tokens with secure httpOnly cookies
- Helmet.js for HTTP headers security
- CORS configured for specific origins
- Rate limiting on authentication endpoints
- Password hashing with bcryptjs
- SQL injection protection via Prisma

## 🤖 AI Integration

The API uses Google Gemini 2.5 Flash with **Google Search grounding** to extract beer metadata from Untappd:

- **Parallel processing**: Beers processed in chunks of 4 concurrent calls
- **Retry logic**: Exponential backoff on 429/503 errors
- **Caching**: DB-first approach minimizes API calls
- **Image extraction**: Gemini 2.0 Flash for beer name recognition from photos

Expected search time for 20 beers: ~40 seconds (5 rounds × 8s each)

## 📝 License

MIT

---

**Author**: Breno Verdi

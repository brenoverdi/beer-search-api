-- AlterTable
ALTER TABLE "users" ADD COLUMN     "bio" TEXT,
ADD COLUMN     "country" VARCHAR(100),
ADD COLUMN     "date_of_birth" DATE,
ADD COLUMN     "favorite_styles" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "gender" VARCHAR(20);

-- CreateTable
CREATE TABLE "festivals" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "city" VARCHAR(100) NOT NULL,
    "country" VARCHAR(100) NOT NULL,
    "continent" VARCHAR(50) NOT NULL,
    "start_date" DATE NOT NULL,
    "end_date" DATE NOT NULL,
    "description" TEXT,
    "website" VARCHAR(500),
    "image_url" VARCHAR(500),
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "festivals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_itineraries" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "festival_id" INTEGER NOT NULL,
    "arrival_date" DATE NOT NULL,
    "departure_date" DATE NOT NULL,
    "generated_plan" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_itineraries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "beer_of_the_day" (
    "id" SERIAL NOT NULL,
    "date" DATE NOT NULL,
    "beer_name" VARCHAR(200) NOT NULL,
    "beer_data" JSONB NOT NULL,
    "fun_fact" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "beer_of_the_day_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "beer_of_the_day_date_key" ON "beer_of_the_day"("date");

-- AddForeignKey
ALTER TABLE "user_itineraries" ADD CONSTRAINT "user_itineraries_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_itineraries" ADD CONSTRAINT "user_itineraries_festival_id_fkey" FOREIGN KEY ("festival_id") REFERENCES "festivals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

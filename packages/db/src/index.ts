import dotenv from "dotenv";
import { existsSync } from "fs";
import { resolve } from "path";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const envPaths = [
  resolve(process.cwd(), "packages/db/.env"),
  resolve(process.cwd(), "../../packages/db/.env"),
];

dotenv.config({
  path: envPaths.find((path) => existsSync(path)),
});

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL is not set");
}

const adapter = new PrismaPg({
  connectionString,
});

export const prismaClient = new PrismaClient({
  adapter,
});

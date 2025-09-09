// backend/src/mongo.ts
import { MongoClient, Db } from "mongodb";

const mongoUrl = process.env.MONGO_URL || "mongodb://127.0.0.1:27017";
const dbName = process.env.MONGO_DB || "voiceapp";

let client: MongoClient | null = null;

export async function connectMongo(): Promise<Db> {
  if (client) {
    // For MongoDB driver v4+, the client is reused if it exists and is not closed.
    return client.db(dbName);
  }
  client = new MongoClient(mongoUrl);
  await client.connect();
  console.log("✅ MongoDB connected:", mongoUrl);
  return client.db(dbName);
}

import Redis from "ioredis";

// Publisher (sends messages into Redis channel)
export const pub = new Redis({
  host: process.env.REDIS_HOST || "127.0.0.1",
  port: Number(process.env.REDIS_PORT) || 6379,
});

// Subscriber (listens to Redis channel)
export const sub = new Redis({
  host: process.env.REDIS_HOST || "127.0.0.1",
  port: Number(process.env.REDIS_PORT) || 6379,
});

sub.on("connect", () => console.log("Redis subscriber connected"));
pub.on("connect", () => console.log("Redis publisher connected"));

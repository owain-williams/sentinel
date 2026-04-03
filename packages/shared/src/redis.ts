import { Redis } from "ioredis";
import {
  NormalisedEventSchema,
  SignalEventSchema,
  type NormalisedEvent,
  type SignalEvent,
} from "./types/events.ts";

export type RedisClient = Redis;

export function createRedisClient(url: string): RedisClient {
  return new Redis(url, { maxRetriesPerRequest: 3 });
}

export async function publishEvent(
  redis: RedisClient,
  streamKey: string,
  event: NormalisedEvent,
): Promise<string> {
  const messageId = await redis.xadd(streamKey, "*", "data", JSON.stringify(event));
  if (!messageId) throw new Error("Failed to publish event to Redis stream");
  return messageId;
}

async function ensureConsumerGroup(
  redis: RedisClient,
  streamKey: string,
  groupName: string,
): Promise<void> {
  try {
    await redis.xgroup("CREATE", streamKey, groupName, "0", "MKSTREAM");
  } catch (err: unknown) {
    // Group already exists — that's fine
    if (err instanceof Error && err.message.includes("BUSYGROUP")) {
      return;
    }
    throw err;
  }
}

export async function consumeEvents(
  redis: RedisClient,
  streamKey: string,
  groupName: string,
  consumerName: string,
  count: number,
): Promise<NormalisedEvent[]> {
  await ensureConsumerGroup(redis, streamKey, groupName);

  const results = (await redis.xreadgroup(
    "GROUP",
    groupName,
    consumerName,
    "COUNT",
    count,
    "BLOCK",
    100,
    "STREAMS",
    streamKey,
    ">",
  )) as [string, [string, string[]][]][] | null;

  if (!results) {
    return [];
  }

  const events: NormalisedEvent[] = [];
  const messageIds: string[] = [];

  for (const [, messages] of results) {
    for (const [messageId, fields] of messages) {
      const dataIndex = fields.indexOf("data");
      if (dataIndex === -1) continue;

      const raw = JSON.parse(fields[dataIndex + 1]);
      const event = NormalisedEventSchema.parse(raw);
      events.push(event);
      messageIds.push(messageId);
    }
  }

  // Acknowledge all consumed messages
  if (messageIds.length > 0) {
    await redis.xack(streamKey, groupName, ...messageIds);
  }

  return events;
}

export async function consumeSignals(
  redis: RedisClient,
  streamKey: string,
  groupName: string,
  consumerName: string,
  count: number,
): Promise<SignalEvent[]> {
  await ensureConsumerGroup(redis, streamKey, groupName);

  const results = (await redis.xreadgroup(
    "GROUP",
    groupName,
    consumerName,
    "COUNT",
    count,
    "BLOCK",
    100,
    "STREAMS",
    streamKey,
    ">",
  )) as [string, [string, string[]][]][] | null;

  if (!results) {
    return [];
  }

  const signals: SignalEvent[] = [];
  const messageIds: string[] = [];

  for (const [, messages] of results) {
    for (const [messageId, fields] of messages) {
      messageIds.push(messageId);
      const dataIndex = fields.indexOf("data");
      if (dataIndex === -1) continue;

      try {
        const raw = JSON.parse(fields[dataIndex + 1]);
        const signal = SignalEventSchema.parse(raw);
        signals.push(signal);
      } catch {
        // Skip malformed signals — ack them so they don't block the stream
      }
    }
  }

  if (messageIds.length > 0) {
    await redis.xack(streamKey, groupName, ...messageIds);
  }

  return signals;
}

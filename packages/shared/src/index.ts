export {
  NormalisedEventSchema,
  SignalEventSchema,
  DataSource,
  EventCategory,
  type NormalisedEvent,
  type SignalEvent,
} from "./types/events.ts";

export {
  createRedisClient,
  publishEvent,
  consumeEvents,
  consumeSignals,
  type RedisClient,
} from "./redis.ts";

export { createDatabase, type SentinelDatabase } from "./db/index.ts";
export * as dbSchema from "./db/schema.ts";

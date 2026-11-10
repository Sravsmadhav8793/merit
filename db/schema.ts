import {
  mysqlTable,
  bigint,
  serial,
  varchar,
  decimal,
  timestamp,
  boolean,
  mysqlEnum,
  text,
} from "drizzle-orm/mysql-core";
export const watchlist = mysqlTable('watchlist', {
  id: serial('id').primaryKey(), symbol: varchar('symbol',{length:12}).notNull().unique(), createdAt: timestamp('created_at').defaultNow().notNull(),
});
export const holdings = mysqlTable('holdings', {
  id: serial('id').primaryKey(), symbol: varchar('symbol',{length:12}).notNull().unique(), shares: decimal('shares',{precision:14,scale:4}).notNull(), averageCost: decimal('average_cost',{precision:14,scale:4}).notNull(), updatedAt: timestamp('updated_at').defaultNow().notNull(),
});
export const transactions = mysqlTable('transactions', {
  id: serial('id').primaryKey(), symbol: varchar('symbol',{length:12}).notNull(), side: varchar('side',{length:4}).notNull(), shares: decimal('shares',{precision:14,scale:4}).notNull(), price: decimal('price',{precision:14,scale:4}).notNull(), createdAt: timestamp('created_at').defaultNow().notNull(),
});
export const priceAlerts = mysqlTable('price_alerts', {
  id: serial('id').primaryKey(), symbol: varchar('symbol',{length:12}).notNull(), direction: varchar('direction',{length:6}).notNull(), target: decimal('target',{precision:18,scale:4}).notNull(), active: boolean('active').default(true).notNull(), triggeredAt: timestamp('triggered_at'), createdAt: timestamp('created_at').defaultNow().notNull(),
});
export const researchNotes = mysqlTable('research_notes', {
  id: serial('id').primaryKey(), symbol: varchar('symbol',{length:12}).notNull().unique(), note: varchar('note',{length:1200}).notNull(), updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const users = mysqlTable("users", {
  id: serial("id").primaryKey(),
  unionId: varchar("unionId", { length: 255 }).notNull().unique(),
  name: varchar("name", { length: 255 }),
  email: varchar("email", { length: 320 }),
  avatar: text("avatar"),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt")
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date()),
  lastSignInAt: timestamp("lastSignInAt").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

export const passkeyCredentials = mysqlTable("passkey_credentials", {
  id: varchar("id", { length: 255 }).primaryKey(),
  account: varchar("account", { length: 16 }).default("owner").notNull(),
  publicKey: text("public_key").notNull(),
  counter: bigint("counter", { mode: "number", unsigned: true }).default(0).notNull(),
  transports: text("transports").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  lastUsedAt: timestamp("last_used_at"),
});

export const brokerageConnections = mysqlTable('brokerage_connections', {
  id: serial('id').primaryKey(),
  userUnionId: varchar('user_union_id',{length:255}).notNull().unique(),
  upstoxUserId: varchar('upstox_user_id',{length:100}),
  upstoxUserName: varchar('upstox_user_name',{length:255}),
  encryptedAccessToken: text('encrypted_access_token').notNull(),
  tokenExpiresAt: timestamp('token_expires_at').notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const brokerageOauthStates = mysqlTable('brokerage_oauth_states', {
  state: varchar('state',{length:64}).primaryKey(),
  userUnionId: varchar('user_union_id',{length:255}).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const brokerageOrders = mysqlTable('brokerage_orders', {
  id: serial('id').primaryKey(),
  userUnionId: varchar('user_union_id',{length:255}).notNull(),
  idempotencyKey: varchar('idempotency_key',{length:80}).notNull().unique(),
  kind: varchar('kind',{length:12}).notNull(),
  action: varchar('action',{length:12}).notNull(),
  instrumentToken: varchar('instrument_token',{length:100}),
  brokerOrderIds: text('broker_order_ids'),
  requestSummary: text('request_summary').notNull(),
  status: varchar('status',{length:20}).notNull(),
  brokerMessage: text('broker_message'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

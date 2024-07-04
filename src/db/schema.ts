import { pgTable, serial, text, jsonb, timestamp, integer } from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  waid: text('waid'),
  name: text('name'),
  phone: text('phone'),
  locationName: text('location_name'),
  location: jsonb('location'),
  settings: jsonb('settings'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const messages = pgTable('messages', {
  id: serial('id').primaryKey(),
  body: text('body'),
  wamid: text('wamid'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  userId: integer('user_id').references(() => users.id),
});
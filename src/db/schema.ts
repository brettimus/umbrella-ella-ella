import { pgTable, serial, text, jsonb, timestamp } from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  name: text('name'),
  phone: text('phone'),
  locationName: text('location_name'),
  location: jsonb('location'),
  settings: jsonb('settings'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});
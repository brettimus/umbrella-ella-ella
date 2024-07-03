import { Hono } from 'hono';
import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import { users } from './db/schema';

import { createHonoMiddleware } from '@fiberplane/hono';

type Bindings = {
  DATABASE_URL: string;
  WHATSAPP_TOKEN: string;
  WHATSAPP_PHONE_NUMBER_ID: string;
};

const app = new Hono<{ Bindings: Bindings }>()

app.use(createHonoMiddleware(app));

app.get('/', (c) => {
  return c.text('Hello Hono!')
})

app.get('/api/users', async (c) => {
  const sql = neon(c.env.DATABASE_URL)
  const db = drizzle(sql);

  return c.json({
    users: await db.select().from(users)
  })
})

app.post('/message/test', async (c) => {
  // const sql = neon(c.env.DATABASE_URL)
  // const db = drizzle(sql);

  const WHATSAPP_TOKEN = c.env.WHATSAPP_TOKEN;
  const WHATSAPP_PHONE_NUMBER_ID = c.env.WHATSAPP_PHONE_NUMBER_ID;

  const messageResponse = await sendWhatsAppMessage({
    to: '31655527989',
    body: 'Hello, world!',
    accessToken: WHATSAPP_TOKEN,
    phoneNumberId: WHATSAPP_PHONE_NUMBER_ID
  });

  return c.json({
    messageResponse
  })
})

export default app

async function sendWhatsAppMessage(options: { to: string, body: string, accessToken: string, phoneNumberId: string }) {
  const { to, body, accessToken, phoneNumberId } = options;

  const url = `https://graph.facebook.com/v19.0/${phoneNumberId}/messages`

  const params = {
    messaging_product: 'whatsapp',
    to,
    // Free form
    // text: { body },

    // Template
    type: "template", 
    template: {
      name: "hello_world",
      language: { code: "en_US" }
    }
  }


  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(params)
  })

  return response.json()
}
import { Hono } from 'hono';
import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import { users } from './db/schema';

import { createHonoMiddleware } from '@fiberplane/hono';

type Bindings = {
  DATABASE_URL: string;
  WHATSAPP_TOKEN: string;
  WHATSAPP_PHONE_NUMBER_ID: string;
  WEBHOOK_VERIFY_TOKEN: string;
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

// Verification endpoint for the webhook
app.get('/webhook', (c) => {
  const mode = c.req.query('hub.mode');
  const token = c.req.query('hub.verify_token');
  // TODO - What happens if hub.challenge is not defined?
  const challenge = c.req.query('hub.challenge') ?? "";

  if (mode && token === c.env.WEBHOOK_VERIFY_TOKEN) {
    return c.text(challenge, 200);
  }

  return c.text('Forbidden', 403);
});


// Webhook endpoint to handle incoming messages
app.post('/webhook', async (c) => {
  const data = await c.req.json();
  const messageBody = data.entry[0].changes[0].value.messages[0].text.body;
  const fromNumber = data.entry[0].changes[0].value.messages[0].from;

  const responseMessage = `Hello! You said: ${messageBody}`;

  const messageResponse = await sendWhatsAppMessage({
    to: fromNumber,
    body: responseMessage,
    accessToken: c.env.WHATSAPP_TOKEN,
    phoneNumberId: c.env.WHATSAPP_PHONE_NUMBER_ID
  });

  return c.json({
    messageResponse
  });
});


export default app

async function sendWhatsAppMessage(options: { to: string, body: string, accessToken: string, phoneNumberId: string }) {
  const { to, body, accessToken, phoneNumberId } = options;

  const url = `https://graph.facebook.com/v19.0/${phoneNumberId}/messages`

  const params = {
    messaging_product: 'whatsapp',
    to,
    // Free form messages just require a body
    text: { body },

    // Example of using a Template
    //
    // type: "template",
    // template: {
    //   name: "hello_world",
    //   language: { code: "en_US" }
    // }
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
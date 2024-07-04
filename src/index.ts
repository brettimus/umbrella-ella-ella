import { Hono } from 'hono';
import { neon } from '@neondatabase/serverless';
import { type NeonHttpDatabase, drizzle } from 'drizzle-orm/neon-http';
import { users, messages } from './db/schema';

import { createHonoMiddleware } from '@fiberplane/hono';
import { eq } from 'drizzle-orm';
import { cleanPrompt, respond } from './ai';

type Bindings = {
  DATABASE_URL: string;
  WHATSAPP_TOKEN: string;
  WHATSAPP_PHONE_NUMBER_ID: string;
  WEBHOOK_VERIFY_TOKEN: string;
  OPENAI_API_KEY: string;
  OPEN_WEATHER_MAP_API_KEY: string;
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
  const messageId = data?.entry?.[0]?.changes?.[0]?.value?.messages?.[0]?.id;
  const messageBody = data?.entry?.[0]?.changes?.[0]?.value?.messages?.[0]?.text?.body;
  const fromNumber = data?.entry?.[0]?.changes?.[0]?.value?.messages?.[0]?.from;


  if (!messageBody) {
    console.debug("Received a webhook update with no message body", data);
    return c.text("OK");
  }

  const sql = neon(c.env.DATABASE_URL)
  const db = drizzle(sql);

  const name = data?.entry?.[0]?.changes?.[0]?.value?.contacts?.[0]?.profile?.name;
  const waid = data?.entry?.[0]?.changes?.[0]?.value?.contacts?.[0]?.waid;

  const user = await createUserIfNotExists(db, fromNumber, name, waid);

  // TODO - Use this to make sure we don't double-reply
  await db.insert(messages).values({
    wamid: messageId,
    userId: user?.id,
  });

  const responseMessage = await respond(c.env.OPENAI_API_KEY, {
    prompt: cleanPrompt(`
      You got a message from phone ${fromNumber}. ${name ? `The user's name is ${name}.` : ""}
      
      ${
        user?.locationName 
          ? `The user's location is ${user?.locationName}.`
          : "We do not know the user's location yet."
      }

      Here is their message:

      ${messageBody}
    `)
  });

  if (typeof responseMessage === "string" ) {
    const messageResponse = await sendWhatsAppMessage({
      to: fromNumber,
      body: responseMessage,
      accessToken: c.env.WHATSAPP_TOKEN,
      phoneNumberId: c.env.WHATSAPP_PHONE_NUMBER_ID
    });

    console.debug("Textual Message response", messageResponse);
  } else if (responseMessage?.name === "saveLocation") {
    console.log("Tool call!", responseMessage);
    const location = responseMessage?.parsedArgs;
    const updatedUser = await saveLocation(db, user?.id, location);
    const weather = await getWeather(c.env.OPEN_WEATHER_MAP_API_KEY, location);
    const body = `${updatedUser?.locationName}, you say? My sources tell me... ${
      weather?.chanceOfRain === "Yes"
        ? "rainnnn ☔️"
        : "no rainnnn 🌞"
    }`;
    const messageResponse = await sendWhatsAppMessage({
      to: fromNumber,
      body,
      accessToken: c.env.WHATSAPP_TOKEN,
      phoneNumberId: c.env.WHATSAPP_PHONE_NUMBER_ID
    });
    console.debug("Tool call message response", messageResponse);

  } else {
    console.log("Unknown response from ai....", responseMessage);
  }

  return c.text("OK");
});


export default app

async function createUserIfNotExists(
  db: NeonHttpDatabase<Record<string, never>>, phone: string, name?: string, waid?: string) {
  const user = await db.select().from(users).where(eq(users.phone, phone));
  if (user?.[0]) {
    return user?.[0];
  }

  const newUser = await db.insert(users).values({
    phone,
    name,
    waid
  }).returning();

  return newUser?.[0];
}

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

async function saveLocation(db: NeonHttpDatabase<Record<string, never>>, userId: number, locationData: { cityName: string, stateName: string; countryName: string; }) {
  const locationName = locationData.stateName ? `${locationData.cityName}, ${locationData.stateName}, ${locationData.countryName}` : `${locationData.cityName}, ${locationData.countryName}`;
  const updatedUser = await db.update(users).set({ locationName, location: locationData }).where(eq(users.id, userId)).returning();
  return updatedUser?.[0];
  // const url = `https://api.openweathermap.org/data/2.5/weather?q=${locationName}&appid=${OPEN_WEATHER_MAP_API_KEY}`
}

async function getWeather(apiKey: string, location: { cityName: string, stateName: string; countryName: string; }) {
  const locationName = location.stateName ? `${location.cityName}, ${location.stateName}, ${location.countryName}` : `${location.cityName}, ${location.countryName}`;
  const url = `https://api.openweathermap.org/data/2.5/weather?q=${locationName}&appid=${apiKey}&units=metric`
  const response = await fetch(url);
  const data = await response.json();
  const chanceOfRain = data?.weather?.[0]?.main === 'Rain' ? 'Yes' : 'No';
  console.log(`Chance of rain in ${locationName}: ${chanceOfRain}`);

  return {
    chanceOfRain,
    temperature: data?.main?.temp,
    feelsLike: data?.main?.feels_like,
    humidity: data?.main?.humidity,
  }
}
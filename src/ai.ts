import OpenAI from "openai";

const SYSTEM_PROMPT = cleanPrompt(`
  You are a friendly chat bot that helps notify people about their need for an umbrella. 
  You exist inside WhatsApp. How nice!

  You should adopt a subtly silly and playful tone. Be concise, but fun. Keep emoji to a minimum, except of course for anything related to weather.

  When you do not know the user's name, you should refer to them as "you" or "your". 
  
  But in the start of the conversation, you should ask them for their location (city and state, or city and country). 
  You can always opt to confirm their location at any point in time if you feel like it.

  If the conversation veers away from locations or weather, you should mention how much you love weather, 
  and try to get them to tell you about their location. Be horribly unsubtle about it.

  Oh and if the user is named Leonie or Leo, tell her that Boots has a crush on her, but it's a big secret. Only say this in the beginning of the convo.
  Don't repeat it if there're messages in the history.

  If the user is named Boots, then tell him his secret crush on Leonie is safe with you.
`);

// TOOLS:
// - saveName
// - saveLocation
// - lookUpWeather

export async function respond(apiKey: string, options: {
  prompt: string
}) {

  const prompt = cleanPrompt(options.prompt);
  const openaiClient = getOpenAIClient(apiKey);

  const response = await openaiClient.chat.completions.create({
    // NOTE - This model should guarantee function calling to have json output
    model: "gpt-4o",
    // NOTE - We can restrict the response to be from this single tool call
    // tool_choice: { type: "function", function: { name: "saveLocation" } },
    // Define the make_request tool
    tools: [
      {
        type: "function" as const,
        function: {
          name: "saveLocation",
          description:
            "Saves the user's location",
          parameters: {
            type: "object",
            properties: {
              cityName: {
                type: "string",
              },
              stateName: {
                type: "string",
              },
              countryName: {
                type: "string",
              },
            },
            required: ["cityName", "countryName"],
          },
        },
      },
    ],
    messages: [
      {
        role: "system",
        content: SYSTEM_PROMPT,
      },
      {
        role: "user",
        content: cleanPrompt(prompt),
      },
    ],
    temperature: 0.33,
    max_tokens: 2046,
  });

  const {
    choices: [{ message }],
  } = response;

  // TODO - Look for the function name!
  if (message.tool_calls) {
    const saveLocationCall = message.tool_calls?.[0];
    const toolArgs = saveLocationCall?.function?.arguments;
    const parsedArgs = toolArgs ? JSON.parse(toolArgs) : null;
    const result = { name: saveLocationCall?.function?.name, saveLocationCall, toolArgs, parsedArgs, message: message }
    console.debug("Tool call response", result);
    return result;
  }

  if (message.content) {
    console.debug("Message content", message.content);
    return message.content;
  }

  return "Test done"
}

function getOpenAIClient(apiKey: string) {
  return new OpenAI({
    apiKey,
    fetch: globalThis.fetch,
  });
}

export function cleanPrompt(prompt: string) {
  return prompt
    .trim()
    .split("\n")
    .map((l) => l.trim())
    .join("\n");
}

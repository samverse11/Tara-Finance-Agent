import 'dotenv/config';
import { generateText } from 'ai';
import { createGoogleGenerativeAI } from '@ai-sdk/google';

async function main() {
  const google = createGoogleGenerativeAI({
    apiKey: process.env.GEMINI_API_KEY,
  });

  const result = await generateText({
    model: google('gemini-2.0-flash'),
    prompt: 'Say hello',
  });

  console.log(result.text);
}

main().catch(console.error);
// src/lib/openaiService.ts
// OpenAI service for summarizing, extracting clauses, and redlining contracts

const OPENAI_API_KEY = import.meta.env.VITE_OPENAI_API_KEY;
const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions';
const MODEL = 'gpt-3.5-turbo'; // Change to gpt-4 if needed

interface OpenAIResponse {
  choices: { message: { content: string } }[];
}

async function callOpenAI(prompt: string): Promise<string> {
  if (!OPENAI_API_KEY) throw new Error('OpenAI API key not set');

  const response = await fetch(OPENAI_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.2,
      max_tokens: 1500,
    })
  });
  if (!response.ok) throw new Error('OpenAI API error');
  const data = await response.json() as OpenAIResponse;
  return data.choices[0].message.content.trim();
}

// Summarize contract
export async function summarizeContract(text: string) {
  const prompt = `Summarize the following contract in simple bullet points.\n\nContract:\n${text}`;
  return callOpenAI(prompt);
}

// Extract key clauses
export async function extractKeyClauses(text: string) {
  const prompt = `Extract key legal clauses such as Termination, Confidentiality, Governing Law, and Limitation of Liability from the following contract. List each clause with its original wording.\n\nContract:\n${text}`;
  return callOpenAI(prompt);
}

// Redline/flag risky or missing terms
export async function redlineContract(text: string) {
  const prompt = `Read this contract and identify any ambiguous, risky, or missing terms. Redline and comment key sections. List the line or section, suggestion for rewording, and a short comment.\n\nContract:\n${text}`;
  return callOpenAI(prompt);
}

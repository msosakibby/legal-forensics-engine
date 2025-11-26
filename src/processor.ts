// src/processor.ts
import OpenAI from 'openai';
import axios from 'axios';
import FormData from 'form-data'; // Use the npm 'form-data' package for Node.js

const openai = new OpenAI();
const LLAMA_CLOUD_URL = "https://api.cloud.llamaindex.ai/api/parsing";

// --- LANE A: FINANCIAL (LlamaParse) ---
export async function processFinancial(buffer: Buffer, filename: string) {
  console.log("Starting Financial Processing (LlamaParse)...");
  
  // 1. Get Markdown from LlamaCloud
  const markdown = await llamaParseUpload(buffer, filename);
  
  // 2. Use GPT to convert Markdown Table -> JSON for SQL
  // We truncate to 15k chars to save tokens, assuming the summary/totals are at the top/bottom
  const completion = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [
      { role: "system", content: "Extract all financial transactions into a JSON object with key 'transactions' (array of {date, description, amount})." },
      { role: "user", content: markdown.substring(0, 15000) }
    ],
    response_format: { type: "json_object" }
  });
  
  const content = completion.choices[0].message.content || "{}";
  return { markdown, data: JSON.parse(content) };
}

// --- LANE B: VISION / HANDWRITING (GPT-4o Vision) ---
export async function processHandwritten(buffer: Buffer) {
  console.log("Starting Handwritten Processing (Vision)...");
  
  // Convert Buffer to Base64
  const base64Image = buffer.toString('base64');

  const completion = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: "Transcribe this handwritten document. Be precise with numbers and names." },
          { type: "image_url", image_url: { url: `data:image/jpeg;base64,${base64Image}` } }
        ],
      },
    ],
  });

  return { markdown: completion.choices[0].message.content || "", data: {} };
}

// --- HELPER: LLAMA PARSE API ---
async function llamaParseUpload(buffer: Buffer, filename: string): Promise<string> {
  const apiKey = process.env.LLAMA_CLOUD_KEY;
  if (!apiKey) throw new Error("Missing LLAMA_CLOUD_KEY");

  // 1. Upload
  const form = new FormData();
  form.append("file", buffer, { filename: filename, contentType: 'application/pdf' });

  const uploadRes = await axios.post(`${LLAMA_CLOUD_URL}/upload`, form, {
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      ...form.getHeaders()
    }
  });

  const jobId = uploadRes.data.id;
  console.log(`LlamaParse Job ID: ${jobId}`);

  // 2. Poll for Completion
  let status = "PENDING";
  let attempts = 0;
  
  while (status !== "SUCCESS" && attempts < 30) { // Timeout after ~30-60 seconds
    await new Promise(r => setTimeout(r, 2000)); // Wait 2s
    const jobRes = await axios.get(`${LLAMA_CLOUD_URL}/job/${jobId}`, {
      headers: { 'Authorization': `Bearer ${apiKey}` }
    });
    status = jobRes.data.status;
    attempts++;
  }

  if (status !== "SUCCESS") throw new Error("LlamaParse timed out or failed");

  // 3. Get Result
  const resultRes = await axios.get(`${LLAMA_CLOUD_URL}/job/${jobId}/result/markdown`, {
    headers: { 'Authorization': `Bearer ${apiKey}` }
  });

  return resultRes.data.markdown;
}

// --- CLASSIFIER ROUTER ---
export async function determineDocType(buffer: Buffer): Promise<'FINANCIAL' | 'HANDWRITTEN' | 'LEGAL'> {
  // Simple heuristic for now: 
  // In a real scenario, we would send the first page image to GPT-4o to classify.
  // For now, default to FINANCIAL to test the pipeline.
  return 'FINANCIAL'; 
}


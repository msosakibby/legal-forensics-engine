import OpenAI from 'openai';
import { S3 } from 'aws-sdk';
import axios from 'axios';

const openai = new OpenAI();
const s3 = new S3();

// --- LANE A: FINANCIAL (LlamaParse) ---
export async function processFinancial(buffer: Buffer, filename: string) {
  // Use LlamaCloud to extract Markdown Tables
  const formData = new FormData();
  formData.append("file", new Blob([buffer]), filename);
  
  // Call LlamaParse API (simplified for brevity)
  // In prod: Polling loop required
  const markdown = await llamaParseUpload(buffer, filename); 
  
  // Use GPT to convert Markdown Table -> JSON for SQL
  const completion = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [
      { role: "system", content: "Extract all transactions into JSON." },
      { role: "user", content: markdown.substring(0, 15000) }
    ],
    response_format: { type: "json_object" }
  });
  
  return { markdown, data: JSON.parse(completion.choices[0].message.content!) };
}

// --- LANE B: VISION / HANDWRITING (GPT-4o Vision) ---
export async function processHandwritten(buffer: Buffer) {
  // Convert PDF page 1 to Base64 Image (Logic omitted: use 'pdf-lib' or 'sharp')
  const base64Image = buffer.toString('base64'); 

  const completion = await openai.chat.completions.create({
    model: "gpt-4o", 
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: "Transcribe this handwritten document. Be precise with numbers and names. If it is a Plat Book or Deed, extract the legal description." },
          { type: "image_url", image_url: { url: `data:image/jpeg;base64,${base64Image}` } }
        ],
      },
    ],
  });

  return { markdown: completion.choices[0].message.content, data: {} };
}

// --- CLASSIFIER ROUTER ---
export async function determineDocType(buffer: Buffer): Promise<'FINANCIAL' | 'HANDWRITTEN' | 'LEGAL'> {
  // Look at first 2kb of text to guess
  // Or send first page image to GPT-4o for classification
  return 'FINANCIAL'; // Placeholder logic
}


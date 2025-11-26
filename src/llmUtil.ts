// src/llmUtil.ts
import OpenAI from 'openai';
import * as fs from 'fs';
import * as path from 'path';

const openai = new OpenAI();

// Minimal interface to satisfy TS without touching the OpenAI types
interface VectorStoreFilesClient {
  create: (vectorStoreId: string, body: { file_id: string }) => Promise<unknown>;
}

interface VectorStoresClient {
  files: VectorStoreFilesClient;
}

interface BetaClient {
  vectorStores?: VectorStoresClient;
}

export async function syncToTypingMind(buffer: Buffer, filename: string) {
  try {
    console.log(`Syncing ${filename} to OpenAI Vector Store...`);

    // 1. OpenAI requires a File stream. In Lambda, we write to /tmp first.
    const tempPath = path.join('/tmp', filename);
    fs.writeFileSync(tempPath, buffer);

    // 2. Upload the file to OpenAI Storage
    const file = await openai.files.create({
      file: fs.createReadStream(tempPath),
      purpose: 'assistants',
    });

    // 3. Attach to the Vector Store (The "Brain" of TypingMind)
    const vectorStoreId = process.env.VECTOR_STORE_ID;
    if (vectorStoreId) {
      const beta = openai.beta as BetaClient;

      if (beta.vectorStores?.files) {
        await beta.vectorStores.files.create(vectorStoreId, { file_id: file.id });
      } else {
        console.warn(
          'Vector Stores API not available on OpenAI client (beta.vectorStores.files missing). Skipping vector sync.'
        );
      }
    } else {
      console.warn('VECTOR_STORE_ID not set. Skipping vector sync.');
    }

    // Cleanup
    fs.unlinkSync(tempPath);
    console.log(`Synced ${filename} successfully.`);
  } catch (error) {
    console.error('Error syncing to TypingMind:', error);
    // Don't throw, so the rest of the pipeline (SQL saving) still finishes
  }
}


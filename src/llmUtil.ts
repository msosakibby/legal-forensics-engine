// src/llmUtil.ts
import OpenAI from 'openai';
import * as fs from 'fs';
import * as path from 'path';

const openai = new OpenAI();

export async function syncToTypingMind(buffer: Buffer, filename: string) {
  try {
    console.log(`Syncing ${filename} to OpenAI Vector Store...`);

    // 1. OpenAI requires a File object (or path). In Lambda, we write to /tmp first.
    const tempPath = path.join('/tmp', filename);
    fs.writeFileSync(tempPath, buffer);

    // 2. Upload the file to OpenAI Storage
    const file = await openai.files.create({
      file: fs.createReadStream(tempPath),
      purpose: "assistants",
    });

    // 3. Attach to the Vector Store (The "Brain" of TypingMind)
    if (process.env.VECTOR_STORE_ID) {
      await openai.beta.vectorStores.files.create(
        process.env.VECTOR_STORE_ID,
        { file_id: file.id }
      );
    }

    // Cleanup /tmp
    fs.unlinkSync(tempPath);
    console.log(`Synced ${filename} successfully.`);
    
  } catch (error) {
    console.error("Error syncing to TypingMind:", error);
    // We don't throw here because we don't want to fail the whole pipeline 
    // just because the chat sync failed.
  }
}


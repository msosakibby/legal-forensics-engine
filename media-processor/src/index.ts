import { Storage } from '@google-cloud/storage';
import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { exec } from 'child_process';
import util from 'util';

const execPromise = util.promisify(exec);

// Initialize Clients
const storage = new Storage();
const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_KEY!
);
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

async function main() {
  console.log('Starting Media Processor Job (Lane D)...');

  const bucketName = process.env.INPUT_BUCKET;
  const fileName = process.env.INPUT_FILE;

  if (!bucketName || !fileName) {
    throw new Error("Missing required environment variables: INPUT_BUCKET, INPUT_FILE");
  }

  try {
    // 1. Create DB Record (Multimedia treats the whole file as one doc)
    const { data: docRecord, error: dbError } = await supabase
      .from('documents')
      .insert({ 
        filename: fileName, 
        status: 'processing',
        doc_type: 'media'
      })
      .select()
      .single();

    if (dbError || !docRecord) throw new Error(`DB Init Failed: ${dbError?.message}`);
    console.log(`Processing Media Doc ID: ${docRecord.id}`);

    // 2. Download File
    const localFilePath = path.join(os.tmpdir(), fileName);
    await storage.bucket(bucketName).file(fileName).download({ destination: localFilePath });

    // 3. Extract Audio (if video) or Convert to MP3
    // We use ffmpeg to ensure the file is in a format Whisper accepts (mp3, wav)
    // and to strip video tracks to save upload bandwidth to OpenAI.
    const audioFilePath = path.join(os.tmpdir(), `${path.parse(fileName).name}_audio.mp3`);
    
    console.log('Extracting/Converting Audio via FFmpeg...');
    // -y: overwrite, -vn: no video, -ac 1: mono (saves tokens/size)
    await execPromise(`ffmpeg -y -i "${localFilePath}" -vn -ac 1 "${audioFilePath}"`);

    // 4. OpenAI Whisper (Transcribe)
    console.log('Sending to OpenAI Whisper...');
    const transcription = await openai.audio.transcriptions.create({
      file: fs.createReadStream(audioFilePath),
      model: "whisper-1",
      response_format: "text" // or "verbose_json" for timestamps
    });

    const transcriptText = String(transcription); // Ensure string

    // 5. Save to Evidence Logs (Lane C/D Table)
    await supabase.from('evidence_logs').insert({
      doc_id: docRecord.id,
      log_type: 'audio_transcript',
      content: transcriptText
    });

    // 6. Save Transcript to Bucket (Archive)
    const archivePath = `TRANSCRIPTS/${fileName}.txt`;
    await storage.bucket(process.env.ARCHIVE_BUCKET || 'forensics-archive-ev').file(archivePath).save(transcriptText);

    // 7. Mark Document Complete
    await supabase.from('documents').update({
        status: 'archived',
        archive_path: archivePath
    }).eq('id', docRecord.id);

    console.log(`Media Processing Complete. Transcript Length: ${transcriptText.length}`);

    // Cleanup
    if (fs.existsSync(localFilePath)) fs.unlinkSync(localFilePath);
    if (fs.existsSync(audioFilePath)) fs.unlinkSync(audioFilePath);

  } catch (err) {
    const error = err as Error;
    console.error(`Media Processing Error: ${error.message}`);
    process.exit(1);
  }
}

main();

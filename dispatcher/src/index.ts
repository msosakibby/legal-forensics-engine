import express from 'express';
import { JobsClient } from '@google-cloud/run';

const app = express();
const PORT = process.env.PORT || 8080;
const runClient = new JobsClient();

app.use(express.json());

// --- HELPER: Parse Pub/Sub Message ---
function parseEvent(req: any) {
  if (!req.body.message || !req.body.message.data) {
    throw new Error('Bad Request: Missing Pub/Sub message data');
  }
  const dataStr = Buffer.from(req.body.message.data, 'base64').toString();
  return JSON.parse(dataStr);
}

// --- 1. INGEST ROUTER (The Traffic Controller) ---
app.post('/trigger-splitter', async (req: any, res: any) => {
  try {
    const fileEvent = parseEvent(req);
    const bucket = fileEvent.bucket;
    const name = fileEvent.name;
    
    if (!bucket || !name) {
      console.error("Invalid Event Payload:", fileEvent);
      res.status(400).send("Invalid Payload");
      return;
    }

    const lowerName = name.toLowerCase();
    const projectId = await runClient.getProjectId();
    const region = process.env.REGION || 'us-central1';

    console.log(`[Ingest] Detected File: ${name}`);

    // === LANE D: MULTIMEDIA (Audio/Video) ===
    // Expanded list of formats for forensic completeness
    const mediaExts = ['.mov', '.mp3', '.wav', '.m4a', '.mp4', '.avi', '.wma', '.aac', '.flac'];
    if (mediaExts.some(ext => lowerName.endsWith(ext))) {
        console.log(">>> Routing to LANE D: Media Processor");
        
        const mediaJobName = process.env.MEDIA_PROCESSOR_JOB_NAME;
        if (!mediaJobName) throw new Error("MEDIA_PROCESSOR_JOB_NAME env var missing");

        await runClient.runJob({
            name: `projects/${projectId}/locations/${region}/jobs/${mediaJobName}`,
            overrides: {
                containerOverrides: [{
                    env: [
                        { name: "INPUT_BUCKET", value: bucket },
                        { name: "INPUT_FILE", value: name },
                        // Pass global config
                        { name: "ARCHIVE_BUCKET", value: process.env.ARCHIVE_BUCKET! },
                        { name: "SUPABASE_URL", value: process.env.SUPABASE_URL! },
                        { name: "SUPABASE_KEY", value: process.env.SUPABASE_KEY! },
                        { name: "OPENAI_API_KEY", value: process.env.OPENAI_API_KEY! }
                    ]
                }]
            }
        });
        res.status(200).send('Dispatched to Media Lane');
        return;
    }

    // === LANES A-C: DOCUMENT FORENSICS ===
    console.log(">>> Routing to LANE A-C: Document Splitter");
    const splitterJobName = process.env.SPLITTER_JOB_NAME;
    if (!splitterJobName) throw new Error("SPLITTER_JOB_NAME env var missing");

    await runClient.runJob({
        name: `projects/${projectId}/locations/${region}/jobs/${splitterJobName}`,
        overrides: {
            containerOverrides: [{
                env: [
                    { name: "INPUT_BUCKET", value: bucket },
                    { name: "FILE_NAME", value: name },
                    { name: "PROCESSING_BUCKET", value: process.env.PROCESSING_BUCKET! },
                    { name: "TOPIC_NAME", value: process.env.TOPIC_NAME! },
                    { name: "SUPABASE_URL", value: process.env.SUPABASE_URL! },
                    { name: "SUPABASE_KEY", value: process.env.SUPABASE_KEY! }
                ]
            }]
        }
    });
    res.status(200).send('Dispatched to Splitter');

  } catch (err: any) {
    console.error('[Ingest Router Error]:', err.message);
    res.status(500).send(err.message);
  }
});

// --- 2. PROCESSOR TRIGGER (Page Level) ---
app.post('/trigger-processor', async (req: any, res: any) => {
  try {
    const eventData = parseEvent(req);
    console.log(`[Processor Trigger] Page Ready: ${eventData.file}`);

    const projectId = await runClient.getProjectId();
    const region = process.env.REGION || 'us-central1';
    const jobName = process.env.PROCESSOR_JOB_NAME;

    await runClient.runJob({
      name: `projects/${projectId}/locations/${region}/jobs/${jobName}`,
      overrides: {
        containerOverrides: [{
          env: [
            { name: "BUCKET", value: eventData.bucket },
            { name: "FILE", value: eventData.file },
            { name: "DOC_ID", value: eventData.docId },
            { name: "PAGE_INDEX", value: String(eventData.pageIndex) },
            // Inject Secrets needed for Forensic Analysis
            { name: "SUPABASE_URL", value: process.env.SUPABASE_URL! },
            { name: "SUPABASE_KEY", value: process.env.SUPABASE_KEY! },
            { name: "GOOGLE_CLOUD_PROJECT", value: process.env.GOOGLE_CLOUD_PROJECT! },
            { name: "REGION", value: process.env.REGION! },
            { name: "LLAMA_CLOUD_API_KEY", value: process.env.LLAMA_CLOUD_API_KEY! }
          ]
        }]
      }
    });
    res.status(200).send('Processor Started');
  } catch (err: any) {
    console.error('[Processor Trigger Error]:', err.message);
    res.status(500).send(err.message);
  }
});

// --- 3. AGGREGATOR TRIGGER (Document Level) ---
app.post('/trigger-aggregator', async (req: any, res: any) => {
  try {
    const eventData = parseEvent(req);
    console.log(`[Aggregator Trigger] Consolidating Doc: ${eventData.docId}`);

    const projectId = await runClient.getProjectId();
    const region = process.env.REGION || 'us-central1';
    const jobName = process.env.AGGREGATOR_JOB_NAME;

    await runClient.runJob({
      name: `projects/${projectId}/locations/${region}/jobs/${jobName}`,
      overrides: {
        containerOverrides: [{
          env: [
            { name: "DOC_ID", value: eventData.docId },
            { name: "INPUT_BUCKET", value: process.env.INPUT_BUCKET! },
            { name: "PROCESSING_BUCKET", value: process.env.PROCESSING_BUCKET! },
            { name: "ARCHIVE_BUCKET", value: process.env.ARCHIVE_BUCKET! },
            { name: "SUPABASE_URL", value: process.env.SUPABASE_URL! },
            { name: "SUPABASE_KEY", value: process.env.SUPABASE_KEY! },
            { name: "GOOGLE_CLOUD_PROJECT", value: process.env.GOOGLE_CLOUD_PROJECT! },
            { name: "REGION", value: process.env.REGION! }
          ]
        }]
      }
    });
    res.status(200).send('Aggregator Started');
  } catch (err: any) {
    console.error('[Aggregator Trigger Error]:', err.message);
    res.status(500).send(err.message);
  }
});

app.listen(PORT, () => console.log(`Dispatcher Service listening on port ${PORT}`));
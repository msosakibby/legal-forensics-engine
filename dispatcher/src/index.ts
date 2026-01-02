// dispatcher/src/index.ts

import express from 'express';
import { JobsClient } from '@google-cloud/run';

const app = express();
const PORT = process.env.PORT || 8080;
const runClient = new JobsClient();

app.use(express.json());

// --- 1. INGEST ROUTER (Smart Dispatch) ---
app.post('/trigger-splitter', async (req, res) => {
  try {
    if (!req.body.message || !req.body.message.data) {
      res.status(400).send('Bad Request: Missing message data'); return;
    }

    const dataStr = Buffer.from(req.body.message.data, 'base64').toString();
    const fileEvent = JSON.parse(dataStr);
    
    const bucket = fileEvent.bucket;
    const name = fileEvent.name;
    const lowerName = name.toLowerCase();

    console.log(`Ingest Event Received: ${name}`);

    const projectId = await runClient.getProjectId();
    const region = process.env.REGION || 'us-central1';

    // === LANE D CHECK: MULTIMEDIA ===
    if (lowerName.endsWith('.mov') || lowerName.endsWith('.mp3') || lowerName.endsWith('.wav') || lowerName.endsWith('.m4a') || lowerName.endsWith('.mp4')) {
        console.log("Multimedia detected. Routing to Media Processor.");
        
        const mediaJobName = process.env.MEDIA_PROCESSOR_JOB_NAME;
        if (!mediaJobName) {
            console.error("MEDIA_PROCESSOR_JOB_NAME env var not set");
            res.status(500).send("Configuration Error");
            return;
        }

        const jobFullName = `projects/${projectId}/locations/${region}/jobs/${mediaJobName}`;
        console.log(`Triggering Media Job: ${jobFullName}`);

        await runClient.runJob({
            name: jobFullName,
            overrides: {
                containerOverrides: [{
                    env: [
                        { name: "INPUT_BUCKET", value: bucket },
                        { name: "INPUT_FILE", value: name }
                    ]
                }]
            }
        });
        
        res.status(200).send('Routed to Media Lane');
        return;
    }

    // === LANES A, B, C: DOCUMENT SPLITTER ===
    console.log("Document detected. Routing to Splitter.");
    const splitterJobName = process.env.SPLITTER_JOB_NAME;
    
    const jobFullName = `projects/${projectId}/locations/${region}/jobs/${splitterJobName}`;
    console.log(`Triggering Splitter Job: ${jobFullName}`);
    
    await runClient.runJob({
        name: jobFullName,
        overrides: {
            containerOverrides: [{
                env: [
                    { name: "INPUT_BUCKET", value: bucket },
                    { name: "FILE_NAME", value: name }
                ]
            }]
        }
    });

    res.status(200).send('Routed to Splitter Lane');

  } catch (err) {
    console.error('Error in Ingest Router:', err);
    res.status(500).send('Internal Server Error');
  }
});

// --- 2. TRIGGER PROCESSOR (Pass-through) ---
app.post('/trigger-processor', async (req, res) => {
  try {
    if (!req.body.message || !req.body.message.data) {
      res.status(400).send('Bad Request'); return;
    }
    const dataStr = Buffer.from(req.body.message.data, 'base64').toString();
    const eventData = JSON.parse(dataStr);

    console.log(`Received Page Ready: ${eventData.file}`);

    const projectId = await runClient.getProjectId();
    const region = process.env.REGION || 'us-central1';
    const jobName = process.env.PROCESSOR_JOB_NAME;
    const jobFullName = `projects/${projectId}/locations/${region}/jobs/${jobName}`;

    await runClient.runJob({
      name: jobFullName,
      overrides: {
        containerOverrides: [{
          env: [
            { name: "BUCKET", value: eventData.bucket },
            { name: "FILE", value: eventData.file },
            { name: "DOC_ID", value: eventData.docId },
            { name: "PAGE_INDEX", value: String(eventData.pageIndex) }
          ]
        }]
      }
    });

    res.status(200).send('Processor Triggered');
  } catch (err) {
    console.error('Error in Processor Trigger:', err);
    res.status(500).send('Error');
  }
});

// --- 3. TRIGGER AGGREGATOR (Pass-through) ---
app.post('/trigger-aggregator', async (req, res) => {
  try {
    if (!req.body.message || !req.body.message.data) {
      res.status(400).send('Bad Request'); return;
    }
    const dataStr = Buffer.from(req.body.message.data, 'base64').toString();
    const eventData = JSON.parse(dataStr);

    console.log(`Received Aggregation Request for Doc: ${eventData.docId}`);

    const projectId = await runClient.getProjectId();
    const region = process.env.REGION || 'us-central1';
    const jobName = process.env.AGGREGATOR_JOB_NAME;
    const jobFullName = `projects/${projectId}/locations/${region}/jobs/${jobName}`;

    await runClient.runJob({
      name: jobFullName,
      overrides: {
        containerOverrides: [{
          env: [{ name: "DOC_ID", value: eventData.docId }]
        }]
      }
    });

    res.status(200).send('Aggregator Triggered');
  } catch (err) {
    console.error('Error in Aggregator Trigger:', err);
    res.status(500).send('Error');
  }
});

app.listen(PORT, () => console.log(`Dispatcher Service listening on port ${PORT}`));
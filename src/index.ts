import { S3 } from 'aws-sdk';
import { determineDocType, processFinancial, processHandwritten } from './processor';
import { saveForensicData } from './dbUtil';
import { syncToTypingMind } from './llmUtil'; // Assumed from previous steps

const s3 = new S3();

export const handler = async (event: any) => {
  const bucket = event.Records[0].s3.bucket.name;
  const key = decodeURIComponent(event.Records[0].s3.object.key.replace(/\+/g, ' '));

  console.log(`Processing: ${key}`);
  const obj = await s3.getObject({ Bucket: bucket, Key: key }).promise();
  const buffer = obj.Body as Buffer;

  // 1. Determine Lane
  const docType = await determineDocType(buffer);
  
  let result;
  
  // 2. Execute Lane Logic
  if (docType === 'FINANCIAL') {
    result = await processFinancial(buffer, key);
    await saveForensicData('STATEMENT', result.data); // Save numbers to SQL
  } else if (docType === 'HANDWRITTEN') {
    result = await processHandwritten(buffer);
    // Handwritten ledgers might also need SQL saving
  } else {
    // Standard Legal Processing
    // result = await processLegal(buffer);
  }

  // 3. Sync Text/Markdown to TypingMind (Vector Store)
  if (result?.markdown) {
    await syncToTypingMind(Buffer.from(result.markdown), key);
  }

  return { statusCode: 200, body: "Processed" };
};


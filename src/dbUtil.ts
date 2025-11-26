import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_KEY!);

export async function saveForensicData(type: string, data: any) {
  // 1. Receipts (Expense Tracking)
  if (type === 'RECEIPT') {
    await supabase.from('receipts').insert({
      vendor: data.vendor,
      amount: data.amount,
      date: data.date,
      card_last_4: data.card_last_4, // CRITICAL for linking
      category: data.category,
      filename: data.filename
    });
  } 
  // 2. Statements (Source of Truth)
  else if (type === 'STATEMENT') {
    // Bulk insert statement lines
    const lines = data.transactions.map((t: any) => ({
      ...t,
      source_file: data.filename
    }));
    await supabase.from('statement_lines').insert(lines);
  }
  // 3. Communications (Call/Text Logs)
  else if (type === 'COMMS') {
    await supabase.from('comm_logs').insert(data.logs); // { sender, receiver, timestamp, content }
  }
}


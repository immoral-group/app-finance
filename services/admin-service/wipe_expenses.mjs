// Script to delete all actual expenses and expense custom rows
import { createClient } from '@supabase/supabase-js';
const s = createClient('https://vhfdxyzobwjbfvhhqnbx.supabase.co','eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZoZmR4eXpvYndqYmZ2aGhxbmJ4Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2OTg3NzA2MCwiZXhwIjoyMDg1NDUzMDYwfQ.w6QzInk5NrfgQoHKjG0UFlRwA6B4dWRQN04otFkquj8');

async function cleanExpenses() {
    console.log('--- Wiping all P&L custom expense rows ---');
    const { error: err2, count: c2 } = await s.from('pl_custom_rows')
        .delete({ count: 'exact' })
        .eq('block_type', 'expense');
    if (err2) console.error('Error deleting custom rows:', err2.message);
    else console.log(`Deleted ${c2} custom rows.`);
    
    console.log('Done.');
}
cleanExpenses();

import { createClient } from '@supabase/supabase-js';
const s = createClient('https://vhfdxyzobwjbfvhhqnbx.supabase.co','eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZoZmR4eXpvYndqYmZ2aGhxbmJ4Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2OTg3NzA2MCwiZXhwIjoyMDg1NDUzMDYwfQ.w6QzInk5NrfgQoHKjG0UFlRwA6B4dWRQN04otFkquj8');

const { data: cats } = await s.from('expense_categories').select('id, name, code, parent_category_id, is_general').order('display_order');

// Count parents vs children
const withParent = cats.filter(c => c.parent_category_id);
const noParent = cats.filter(c => !c.parent_category_id);
console.log(`Total: ${cats.length}, With parent: ${withParent.length}, Without parent: ${noParent.length}`);

// Show all categories with parent info
console.log('\nALL CATEGORIES:');
for (const c of cats) {
    if (c.parent_category_id) {
        const parent = cats.find(p => p.id === c.parent_category_id);
        console.log(`  [CHILD] "${c.name}" code=${c.code} → parent="${parent?.name || '???'}"`);
    } else {
        console.log(`  [GROUP] "${c.name}" code=${c.code} is_general=${c.is_general}`);
    }
}

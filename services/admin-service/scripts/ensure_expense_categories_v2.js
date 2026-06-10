
import supabase from '../src/config/supabase.js';

const EXPENSE_STRUCTURE = {
    personalItems: [
        { dept: 'Immedia', items: ['Alba', 'Andrés', 'Leidy', 'Yure'] },
        { dept: 'Imcontent', items: ['Flor', 'Bruno', 'Grego', 'Silvia', 'Angie'] },
        { dept: 'Immoralia', items: ['David', 'Manel'] },
        { dept: 'Immoral', items: ['Daniel', 'Mery', 'Yure', 'Marco', 'Externos puntuales'] },
        { dept: 'Immedia', items: ['Externos'] },
        { dept: 'Imcontent', items: ['Externos'] },
        { dept: 'Immoralia', items: ['Externos'] },
        { dept: 'Imsales', items: ['Jorge Orts'] },
    ],
    comisionesItems: [
        { dept: 'Imfilms', items: ['The connector'] },
        { dept: 'Imcontent', items: ['Marc'] },
        { dept: 'Imseo', items: ['Christian'] },
        { dept: 'Imfashion', items: ['Gemelos'] },
        { dept: 'Imsales', items: ['Jorge'] },
        { dept: 'Imfilms', items: ['Olga'] },
    ],
    marketingItems: [
        { dept: 'Imfilms', items: ['Marketing'] },
        { dept: 'Imcontent', items: ['Marketing'] },
        { dept: 'Immedia', items: ['Marketing'] },
        { dept: 'Immoralia', items: ['Marketing'] },
        { dept: 'Imsales', items: ['Marketing'] },
        { dept: 'Immoral', items: ['Marketing'] },
        { dept: 'Imfashion', items: ['Marketing'] },
    ],
    formacionItems: [
        { dept: 'Imcontent', items: ['Formación'] },
        { dept: 'Immedia', items: ['Formación'] },
        { dept: 'Immoralia', items: ['Formación'] },
        { dept: 'Imsales', items: ['Formación'] },
        { dept: 'Immoral', items: ['Formación'] },
        { dept: 'Imfashion', items: ['Formación'] },
    ],
    softwareItems: [
        { dept: 'Immoral', items: ['Software'] },
        { dept: 'Immedia', items: ['Software'] },
        { dept: 'Imcontent', items: ['Software'] },
        { dept: 'Immoralia', items: ['Software'] },
        { dept: 'Imsales', items: ['Software'] },
    ],
    gastosOpItems: [
        { dept: 'Immoral', items: ['Alquiler', 'Asesoría', 'Suministros', 'Viajes y reuniones', 'Coche de empresa', 'Otras compras', 'Financiamiento (Línea de crédito)'] },
    ],
    adspentItems: [
        { dept: 'Immedia', items: ['Adspent'] },
        { dept: 'Imcontent', items: ['Adspent Nutfruit', 'Influencers'] },
    ]
};

async function ensureCategories() {
    console.log('Ensuring all expense categories exist (Retry with shorter codes)...');

    // Flatten all items
    const allItems = new Set();
    Object.values(EXPENSE_STRUCTURE).forEach(categoryGroup => {
        categoryGroup.forEach(group => {
            group.items.forEach(item => allItems.add(item));
        });
    });

    const categoriesArray = Array.from(allItems);
    console.log(`Checking ${categoriesArray.length} unique expense items...`);

    // Fetch existing
    const { data: existing, error } = await supabase.from('expense_categories').select('name');
    if (error) { console.error(error); return; }

    const existingNames = new Set(existing.map(c => c.name));
    const toCreate = categoriesArray.filter(name => !existingNames.has(name));

    if (toCreate.length === 0) {
        console.log('All categories exist.');
        return;
    }

    console.log(`Creating ${toCreate.length} missing categories:`, toCreate);

    for (const name of toCreate) {
        // Truncate code to 20 chars
        const code = name.toUpperCase().replace(/[^A-Z0-9]/g, '_').substring(0, 19);
        const { error: insertError } = await supabase.from('expense_categories').insert({
            name,
            code: code,
            is_active: true,
            is_general: false
        });
        if (insertError) console.error(`Failed to create ${name}:`, insertError.message);
        else console.log(`Created: ${name}`);
    }
}

ensureCategories();


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

async function diagnose() {
    console.log('--- START DIAGNOSIS ---');

    // 1. Check Departments
    console.log('\nChecking Departments...');
    const { data: depts, error: deptErr } = await supabase.from('departments').select('name, id');
    if (deptErr) { console.error('Error fetching depts:', deptErr); return; }
    const deptMap = new Map(depts.map(d => [d.name, d.id]));
    console.log(`Found ${depts.length} departments.`);

    // 2. Check Categories
    console.log('\nChecking Expense Categories...');
    const { data: cats, error: catErr } = await supabase.from('expense_categories').select('name, id');
    if (catErr) { console.error('Error fetching categories:', catErr); return; }
    const catMap = new Map(cats.map(c => [c.name, c.id]));
    console.log(`Found ${cats.length} categories.`);

    // 3. dry-run save for all items
    console.log('\nSimulating resolution for all items in structure...');
    let failures = 0;
    let successes = 0;

    for (const [groupName, groupItems] of Object.entries(EXPENSE_STRUCTURE)) {
        for (const group of groupItems) {
            const deptName = group.dept;
            const deptId = deptMap.get(deptName);

            if (!deptId) {
                console.error(`[FAIL] Department not found: "${deptName}"`);
                failures += group.items.length;
                continue;
            }

            for (const item of group.items) {
                const catId = catMap.get(item);
                if (!catId) {
                    console.error(`[FAIL] Category not found: "${item}" (in dept ${deptName})`);
                    failures++;
                } else {
                    // Try to fetch existing line to check RLS/Permissions indirectly?
                    // Or just log success
                    // console.log(`[OK] ${deptName} - ${item}`);
                    successes++;
                }
            }
        }
    }

    console.log(`\n--- SUMMARY ---`);
    console.log(`Successes: ${successes}`);
    console.log(`Failures: ${failures}`);

    if (failures === 0) {
        console.log('\nALL CONFIGURATION CHECKS PASSED.');
        console.log('Trying an actual WRITE test for a generated item...');

        // Pick last item
        const lastGroup = EXPENSE_STRUCTURE.adspentItems[0];
        const testItem = lastGroup.items[0];
        const testDept = lastGroup.dept;

        const catId = catMap.get(testItem);
        const deptId = deptMap.get(testDept);

        console.log(`Inserting Budget Line for ${testDept} - ${testItem} (Year 2030)...`);

        const { data, error } = await supabase.from('budget_lines').insert({
            fiscal_year: 2030,
            department_id: deptId,
            expense_category_id: catId,
            line_type: 'expense',
            jan: 123.45,
            notes: 'Diagnosis Test'
        }).select();

        if (error) console.error('WRITE FAILED:', error);
        else console.log('WRITE SUCCESS:', data);

        // Cleanup
        if (data) {
            await supabase.from('budget_lines').delete().eq('id', data[0].id);
            console.log('Cleanup successful.');
        }

    }
}

diagnose();

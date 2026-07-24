const url = 'https://ksstpdookwscquegqsij.supabase.co';
const key = 'sb_publishable_Y4wMfbd6vBFqEOFFlpdC9A_BbRpPF_H';

async function clearTable(table) {
    // Fetch all IDs
    const resGet = await fetch(`${url}/rest/v1/${table}?select=id`, {
        method: 'GET',
        headers: {
            'apikey': key,
            'Authorization': `Bearer ${key}`
        }
    });
    
    if (!resGet.ok) {
        console.log(`Table ${table} GET failed:`, await resGet.text());
        return;
    }
    
    const rows = await resGet.json();
    if (rows.length === 0) {
        console.log(`Table ${table} is already empty.`);
        return;
    }
    
    // Delete rows one by one or by ID (in case bulk delete requires specific RLS)
    for (const row of rows) {
        if (!row.id) continue;
        const resDel = await fetch(`${url}/rest/v1/${table}?id=eq.${row.id}`, {
            method: 'DELETE',
            headers: {
                'apikey': key,
                'Authorization': `Bearer ${key}`
            }
        });
        if (!resDel.ok) {
            console.error(`Failed to delete ID ${row.id} from ${table}:`, await resDel.text());
        }
    }
    console.log(`Table ${table} cleared! Deleted ${rows.length} rows.`);
}

async function main() {
    console.log('Starting cleanup of demo data...');
    // Delete child tables first to avoid foreign key constraints
    await clearTable('payments');
    await clearTable('messages');
    // Then parent tables
    await clearTable('tontines');
    await clearTable('profiles');
    console.log('Cleanup finished!');
}

main();

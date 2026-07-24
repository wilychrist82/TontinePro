const fs = require('fs');
let content = fs.readFileSync('app.js', 'utf8');

// 1. Remove duplicate switchTab listeners
content = content.replace(/if \(btnQuickViewReports\) \{\s*btnQuickViewReports\.addEventListener\('click', \(\) => switchTab\('reports'\)\);\s*\}/g, '');
content = content.replace(/const btnGoToReports = document\.querySelectorAll\('\.btn-go-to-reports'\);[\s\S]*?\}\);\s*\}\);/g, '');

// 2. Ensure Supabase is initialized at the top of app.js (as user requested)
const supabaseInitCode = `
// --- SUPABASE INIT ---
let supabaseClient = null;
if (typeof window !== 'undefined' && window.ENV) {
    const { NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY } = window.ENV;
    if (window.supabase) {
        supabaseClient = window.supabase.createClient(NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY);
    }
}
window.supabaseClient = supabaseClient;
// ---------------------
`;

if (!content.includes('SUPABASE INIT')) {
    content = supabaseInitCode + '\n' + content;
}

// 3. Fix the empty table bug: Ensure DataService doesn't crash if stats fail
content = content.replace(/const stats = await DataService\.getDashboardStats\(\);/g, 'const stats = await DataService.getDashboardStats().catch(()=>null);');
content = content.replace(/const tontines = await DataService\.getTontines\(\);/g, 'const tontines = await DataService.getTontines().catch(()=>[]);');
content = content.replace(/const messages = await DataService\.getRecentMessages\(\);/g, 'const messages = await DataService.getRecentMessages().catch(()=>[]);');
content = content.replace(/const members = await DataService\.getMembers\(\);/g, 'const members = await DataService.getMembers().catch(()=>[]);');
content = content.replace(/const transactions = await DataService\.getTransactions\(\);/g, 'const transactions = await DataService.getTransactions().catch(()=>[]);');

fs.writeFileSync('app.js', content, 'utf8');
console.log('Done rewriting app.js');

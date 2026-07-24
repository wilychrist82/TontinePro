const fs = require('fs');

const transcriptPath = 'C:/Users/wilfriedbusiness.com/.gemini/antigravity-ide/brain/912c5df3-462f-423f-9e5b-93c78f0e9511/.system_generated/logs/transcript_full.jsonl';
const transcript = fs.readFileSync(transcriptPath, 'utf8');
const lines = transcript.split('\n');

let foundAppJs = '';

for (let line of lines) {
    if (!line.trim()) continue;
    try {
        const obj = JSON.parse(line);
        if (obj.source === 'TOOL' && obj.content && obj.content[0] && obj.content[0].text) {
            const text = obj.content[0].text;
            // The file starts with /* ==========================================
            // Tontine Pro - Logic & Interactivity
            if (text.includes('/* ==========================================') && text.includes('Tontine Pro - Logic & Interactivity')) {
                const startIdx = text.indexOf('/* ==========================================');
                foundAppJs = text.substring(startIdx);
                // The cat command output usually ends with the file content
            }
        }
    } catch(e) {
        // ignore parse errors
    }
}

if (foundAppJs) {
    fs.writeFileSync('f:/SAAS/Tontine Pro/app_restored.js', foundAppJs);
    console.log('Successfully recovered app.js! Length:', foundAppJs.length);
} else {
    console.log('Could not find the content in the transcript.');
}

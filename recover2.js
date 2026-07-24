const fs = require('fs');
const path = 'C:/Users/wilfriedbusiness.com/.gemini/antigravity-ide/brain/f3589558-5902-4a78-9fda-2e31c6267d69/.system_generated/logs/transcript_full.jsonl';
const transcript = fs.readFileSync(path, 'utf8');
const lines = transcript.split('\n');

let foundAppJs = '';

for (let line of lines) {
    if (!line.trim()) continue;
    try {
        const obj = JSON.parse(line);
        // Check for replace_file_content or write_to_file
        if (obj.tool_calls) {
            for (let tc of obj.tool_calls) {
                if (tc.tool_name === 'default_api:write_to_file' || tc.tool_name === 'default_api:multi_replace_file_content') {
                    if (tc.tool_args && tc.tool_args.TargetFile && tc.tool_args.TargetFile.includes('app.js')) {
                        if (tc.tool_args.CodeContent) {
                            foundAppJs = tc.tool_args.CodeContent;
                        }
                    }
                }
            }
        }
    } catch(e) {}
}

if (foundAppJs) {
    fs.writeFileSync('f:/SAAS/Tontine Pro/app_recovered.js', foundAppJs);
    console.log('Successfully recovered app.js! Length:', foundAppJs.length);
} else {
    console.log('Could not find CodeContent for app.js in the previous transcript.');
}

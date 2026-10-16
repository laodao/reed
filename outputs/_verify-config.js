const fs = require('fs');
const p = 'C:\\Users\\daoge\\AppData\\Roaming\\the_bot\\data-path-config.json';
const raw = fs.readFileSync(p, 'utf8');
console.log('raw:', JSON.stringify(raw));
try {
  const cfg = JSON.parse(raw);
  console.log('parsed path:', cfg.customDataPath);
  console.log('exists:', fs.existsSync(cfg.customDataPath));
} catch (e) {
  console.log('PARSE FAILED:', e.message);
}

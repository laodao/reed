const fs = require('fs');
const targets = {
  'the-bot root': 'C:\\Users\\daoge\\the-bot\\_probe_x.tmp',
  home: 'C:\\Users\\daoge\\_probe_x.tmp',
  Documents: 'C:\\Users\\daoge\\Documents\\_probe_x.tmp',
  Desktop: 'C:\\Users\\daoge\\Desktop\\_probe_x.tmp',
  project: 'C:\\Users\\daoge\\code\\project\\the-bot\\.local\\_probe_x.tmp',
  C_root: 'C:\\_probe_x.tmp',
};
const label = process.argv[2] || 'anon';
for (const [k, p] of Object.entries(targets)) {
  try {
    fs.writeFileSync(p, 'x');
    fs.unlinkSync(p);
    console.log(`[${label}] OK    ${k}`);
  } catch (e) {
    console.log(`[${label}] FAIL(${e.code}) ${k}`);
  }
}

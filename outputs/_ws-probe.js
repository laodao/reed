const fs = require('fs');
const path = require('path');
const bases = [
  'C:\\Users\\daoge\\code\\project\\the-bot',
  'C:\\Users\\daoge\\code\\project\\the-bot\\.local\\app-data',
  'C:\\Users\\daoge\\code\\project\\the-bot\\.local\\tmp',
];
for (const b of bases) {
  const p = path.join(b, '_p.txt');
  try {
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, 'x');
    fs.unlinkSync(p);
    console.log('OK  ', b);
  } catch (e) {
    console.log('FAIL', e.code, b);
  }
}

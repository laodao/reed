const fs = require('fs');
const path = require('path');

// 读取数据
const tablesPath = path.join(__dirname, 'db_tables.txt');
const columnsPath = path.join(__dirname, 'db_columns.txt');

const tables = fs.readFileSync(tablesPath, 'utf-8').trim().split('\n')
  .map(line => line.split('|'));

const columns = fs.readFileSync(columnsPath, 'utf-8').trim().split('\n')
  .map(line => line.split('|'));

// 按表名组织字段
const columnsByTable = {};
columns.forEach(([table, column, comment]) => {
  if (!columnsByTable[table]) columnsByTable[table] = [];
  columnsByTable[table].push({ column, comment });
});

// 生成 Markdown
let md = `# 数据库结构文档

> 本文档自动生成，记录所有数据库表和字段的中文注释。

生成时间：${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}

---

`;

// 分组
const groups = {
  '长文写作模块 (lw_*)': tables.filter(t => t[0].startsWith('lw_')),
  '知识库模块': tables.filter(t => t[0].startsWith('kb_') || t[0] === 'knowledge_bases'),
  '对话模块': tables.filter(t => ['dialogs', 'messages', 'attachments'].includes(t[0])),
  'AI Provider 模块': tables.filter(t => ['api_keys', 'providers'].includes(t[0]) || t[0].startsWith('provider')),
  '其他模块': tables.filter(t => {
    return !t[0].startsWith('lw_') &&
           !t[0].startsWith('kb_') &&
           t[0] !== 'knowledge_bases' &&
           !['dialogs', 'messages', 'attachments', 'api_keys', 'providers'].includes(t[0]) &&
           !t[0].startsWith('provider');
  })
};

for (const [groupName, groupTables] of Object.entries(groups)) {
  if (groupTables.length === 0) continue;

  md += `## ${groupName}\n\n`;

  groupTables.forEach(([table, comment]) => {
    md += `### ${table}\n\n`;
    md += `**表说明**：${comment}\n\n`;
    md += `| 字段名 | 中文注释 |\n`;
    md += `|--------|----------|\n`;

    const tableColumns = columnsByTable[table] || [];
    tableColumns.forEach(({ column, comment }) => {
      md += `| ${column} | ${comment} |\n`;
    });
    md += `\n`;
  });
}

// 统计信息
md += `---\n\n`;
md += `## 统计信息\n\n`;
md += `- 表总数：${tables.length}\n`;
md += `- 字段总数：${columns.length}\n`;

const outputPath = path.join(__dirname, '../docs/database-structure.md');
fs.writeFileSync(outputPath, md);
console.log('文档已生成: docs/database-structure.md');
console.log(`共 ${tables.length} 个表, ${columns.length} 个字段`);
// 人格工坊预检脚本：交付前运行 `npm run check`，拦截会在运行时炸掉的常见问题。
// 覆盖：语法、工具名非法字符（模型 API 限制）、外部 import、client bundle id 一致性。
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const root = path.join(__dirname, '..');
let bad = 0;
const fail = (msg) => { console.error('✗ ' + msg); bad++; };
const ok = (msg) => console.log('✓ ' + msg);

// 1. 语法检查
try { execFileSync(process.execPath, ['--check', path.join(root, 'lib/client.js')]); ok('lib/client.js 语法'); }
catch { fail('lib/client.js 语法'); }
try { execFileSync(process.execPath, ['--input-type=module', '--check'], { input: fs.readFileSync(path.join(root, 'lib/index.js')) }); ok('lib/index.js 语法'); }
catch { fail('lib/index.js 语法'); }

// 2. 工具名检查：模型 API 要求 ^[a-zA-Z0-9_-]+$，最常见的坑是含点号（如 persona.adjust_intimacy）
const host = fs.readFileSync(path.join(root, 'lib/index.js'), 'utf8');
const nameRe = /name:\s*'([^']+)'/g;
let m;
let toolNames = [];
while ((m = nameRe.exec(host))) {
  const n = m[1];
  if (!/^[a-zA-Z0-9_-]+$/.test(n)) {
    // prompt section 名允许冒号（如 persona-studio:persona），工具名不允许——只拦含点号的
    if (n.includes('.')) { fail('工具名含非法字符(点号): ' + n); }
    else { toolNames.push(n); }
  } else { toolNames.push(n); }
}
ok('name 字段扫描完成（' + toolNames.length + ' 处）');

// 3. 外部 import 检查（符号链接安装时 import @deepseek-ai/* 会解析失败）
if (/^import\s/m.test(host)) fail('lib/index.js 含 import 语句（符号链接安装可能解析失败，应手工构造）');
else ok('lib/index.js 零外部 import');

// 4. client bundle id 与包名一致（不一致会导致浏览器端加载失败）
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const client = fs.readFileSync(path.join(root, 'lib/client.js'), 'utf8');
if (client.includes('id: "' + pkg.name + '"')) ok('client bundle id 与包名一致 (' + pkg.name + ')');
else fail('client bundle id 与包名不一致（应为 ' + pkg.name + '）');

console.log(bad === 0 ? '\n✅ 全部通过，可以重启加载' : '\n❌ 发现 ' + bad + ' 个问题，先修复再重启');
process.exit(bad === 0 ? 0 : 1);

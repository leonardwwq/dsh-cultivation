// 人格工坊预检脚本：交付前运行 `npm run check`，拦截会在运行时 / 安装时炸掉的常见问题。
// 覆盖：语法、工具名非法字符（模型 API 限制）、外部 import、client bundle id 一致性、
//       dsh.bundle 声明（决定安装后是否作为 profile 层加载）、展示资源（locale / icon）。
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const root = path.join(__dirname, '..');
let bad = 0;
const fail = (msg) => { console.error('✗ ' + msg); bad++; };
const ok = (msg) => console.log('✓ ' + msg);
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));

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

// 3. 外部 import 检查（符号链接安装时 import @deepseek-ai/* 会解析失败，应手工构造；
//    相对导入（./core.js）在同包内解析，不受影响；node: 内置模块不受符号链接影响，放行；
//    core.js 作为纯函数模块必须零导入）
const core = fs.readFileSync(path.join(root, 'lib/core.js'), 'utf8');
const importSpecRe = /^\s*import\s+(?:[^'"]*?\s+from\s+)?['"]([^'"]+)['"]/gm;
let extBad = 0;
for (const m of host.matchAll(importSpecRe)) {
  const spec = m[1];
  if (!(spec.startsWith('./') || spec.startsWith('../') || spec.startsWith('node:'))) {
    fail('lib/index.js 含外部 import（仅允许相对导入与 node: 内置）: ' + spec);
    extBad++;
  }
}
if (extBad === 0) ok('lib/index.js 无外部 import（允许相对导入与 node: 内置）');
if (/^import\s/m.test(core)) fail('lib/core.js 不得含 import（纯函数模块）');
else ok('lib/core.js 零 import');

// 4. client bundle id 与包名一致（不一致会导致浏览器端加载失败），且声明了 web 客户端
const client = fs.readFileSync(path.join(root, 'lib/client.js'), 'utf8');
if (client.includes('id: "' + pkg.name + '"')) ok('client bundle id 与包名一致 (' + pkg.name + ')');
else fail('client bundle id 与包名不一致（应为 ' + pkg.name + '）');
if (pkg.dsh && pkg.dsh.client && pkg.dsh.client.platform === 'web') ok('声明 dsh.client.platform = web');
else fail('package.json 缺少 dsh.client.platform = web（Web 端不会加载客户端模块）');
if (pkg.exports && pkg.exports['./client']) ok('exports 暴露 ./client');
else fail('exports 未暴露 ./client（浏览器端无法解析客户端入口）');

// 5. bundle 声明：DSH 安装器只把声明了 dsh.bundle.patch 的包登记为 profile 层；
//    缺了它，`dsh plugin add` / pnpm 安装只会变成普通依赖（"declares no dsh.bundle —
//    installed as a plain dependency, not a profile layer"），插件行不会插入、能力不会挂载。
const files = Array.isArray(pkg.files) ? pkg.files : [];
const inFiles = (rel) => files.some((entry) => {
  if (entry === rel) return true;
  if (entry.endsWith('/*')) return rel.startsWith(entry.slice(0, -1));
  return rel.startsWith(entry + '/');
});

const bundle = pkg.dsh && pkg.dsh.bundle;
const patchList = bundle ? (Array.isArray(bundle.patch) ? bundle.patch : [bundle.patch]) : [];
if (!bundle || patchList.length === 0 || patchList.some((p) => typeof p !== 'string')) {
  fail('package.json 缺少 dsh.bundle.patch（安装后不会作为 profile 层加载，插件不会被挂载）');
} else {
  ok('package.json 声明 dsh.bundle.patch（' + patchList.join(', ') + '）');
  const rowRe = new RegExp('name:\\s*[\'"]?' + pkg.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '[\'"]?\\s*$', 'm');
  for (const raw of patchList) {
    const rel = raw.replace(/^\.\//, '');
    const abs = path.join(root, rel);
    if (!fs.existsSync(abs)) { fail('bundle patch 文件不存在: ' + rel); continue; }
    const yml = fs.readFileSync(abs, 'utf8');
    if (rowRe.test(yml)) ok('bundle patch 含 ' + pkg.name + ' 装载行: ' + rel);
    else fail('bundle patch 未包含 name: ' + pkg.name + ' 的装载行: ' + rel);
    if (inFiles(rel)) ok('files 包含 ' + rel);
    else fail('files 未包含 ' + rel + '（npm 发布后安装会缺 patch）');
  }
}

// 6. 展示资源：插件管理器 / 设置页读取导出的 locale meta 与 icon，缺了会退回默认标题和默认图。
const locales = ['locale/en.json', 'locale/zh.json'];
for (const rel of locales) {
  const abs = path.join(root, rel);
  if (!fs.existsSync(abs)) { fail('缺少展示文案: ' + rel); continue; }
  try {
    const doc = JSON.parse(fs.readFileSync(abs, 'utf8'));
    if (doc.meta && doc.meta.title && doc.meta.description) ok('展示文案完整: ' + rel);
    else fail('展示文案缺少 meta.title / meta.description: ' + rel);
  } catch (e) { fail('展示文案不是合法 JSON: ' + rel); }
}
if (pkg.exports && pkg.exports['./locale/*.json']) ok('exports 暴露 ./locale/*.json');
else fail('exports 未暴露 ./locale/*.json');
if (pkg.exports && pkg.exports['./icon'] && fs.existsSync(path.join(root, 'icon.svg'))) ok('exports 暴露 ./icon');
else fail('缺少 icon.svg 或 exports["./icon"]');
if (inFiles('icon.svg')) ok('files 包含 icon.svg');
else fail('files 未包含 icon.svg');

console.log(bad === 0 ? '\n✅ 全部通过，可以重启加载' : '\n❌ 发现 ' + bad + ' 个问题，先修复再重启');
process.exit(bad === 0 ? 0 : 1);

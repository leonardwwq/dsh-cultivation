// 原子写测试（Test 7）：写入异常时主文件不损坏
// 使用可注入的 fake fs 验证 temp → rename 语义与失败路径；
// 运行时 ctx.fs 无 rename 时走 atomicWriteText 的 writeText 回退（dsh-fs 后端本身原子发布）。
// 运行：node --test tests/
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { atomicWriteText } from '../lib/core.js'

// 内存版 fake fs：记录写入与 rename，可注入失败
function makeFakeFs({ failWrite = null, failRename = null } = {}) {
  const files = new Map() // path -> text（含主文件与临时文件）
  const calls = { writeText: [], rename: [], unlink: [] }
  return {
    files, calls,
    async writeText(path, text) {
      calls.writeText.push(path)
      if (failWrite && failWrite(path)) throw new Error('write failed')
      files.set(path, text)
    },
    async rename(from, to) {
      calls.rename.push([from, to])
      if (failRename && failRename(from, to)) throw new Error('rename failed')
      if (files.has(from)) { files.set(to, files.get(from)); files.delete(from) }
    },
    async unlink(path) {
      calls.unlink.push(path)
      files.delete(path)
    }
  }
}

function snapshot(fs) {
  const out = {}
  for (const [k, v] of fs.files) out[k] = v
  return out
}

test('Test 7a：正常写入 — temp 写入后 rename 发布，主文件被替换', async () => {
  const fs = makeFakeFs()
  fs.files.set('/data/main.json', 'old')
  await atomicWriteText(fs, '/data/main.json', 'new-content')
  assert.equal(fs.files.get('/data/main.json'), 'new-content')
  assert.equal(fs.calls.rename.length, 1)
  // 临时文件已被 rename 移走，不存在残留
  assert.ok(![...fs.files.keys()].some((p) => p.includes('.tmp-')))
})

test('Test 7b：writeText（临时文件阶段）失败 — 主文件保持原样', async () => {
  const fs = makeFakeFs({ failWrite: (p) => p.includes('.tmp-') })
  fs.files.set('/data/main.json', 'old-good')
  await assert.rejects(() => atomicWriteText(fs, '/data/main.json', 'bad'), /write failed/)
  assert.equal(fs.files.get('/data/main.json'), 'old-good') // 主文件未被触碰
})

test('Test 7c：rename 失败 — 主文件保持原样、临时文件被清理、错误上抛', async () => {
  const fs = makeFakeFs({ failRename: () => true })
  fs.files.set('/data/main.json', 'old-good')
  await assert.rejects(() => atomicWriteText(fs, '/data/main.json', 'new'), /rename failed/)
  assert.equal(fs.files.get('/data/main.json'), 'old-good') // 主文件完好
  assert.ok(![...fs.files.keys()].some((p) => p.includes('.tmp-')), '临时文件应被清理')
  assert.equal(fs.calls.unlink.length, 1)
})

test('Test 7d：无 rename 的 fs（如 ctx.fs）回退 writeText，主文件直接原子替换', async () => {
  // 模拟 ctx.fs：只有 writeText，无 rename/unlink
  const files = new Map()
  const fs = {
    files,
    async writeText(path, text) { files.set(path, text) }
  }
  files.set('/data/main.json', 'old')
  await atomicWriteText(fs, '/data/main.json', 'new')
  assert.equal(files.get('/data/main.json'), 'new')
})

test('Test 7e：序列化失败不触碰磁盘（saveData 语义：JSON.stringify 在写盘前完成）', () => {
  // 模拟 data 含循环引用 → JSON.stringify 抛错；确认没有发生任何写操作
  const fs = makeFakeFs()
  const circular = { a: 1 }
  circular.self = circular
  assert.throws(() => JSON.stringify(circular, null, 2), TypeError)
  assert.equal(fs.calls.writeText.length, 0)
  assert.deepEqual(snapshot(fs), {})
})

test('Test 7f：空 fs/缺参防御', async () => {
  await atomicWriteText(null, '/x', 'y') // 不抛
  const noTarget = makeFakeFs()
  await atomicWriteText(noTarget, '', 'y') // 不抛
  assert.equal(noTarget.calls.writeText.length, 0)
})

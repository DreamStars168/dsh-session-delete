#!/usr/bin/env node
/**
 * 发布前静态检查：语法、清单完整性、以及"仓库里不该有的东西"。
 *
 * 跑：node scripts/check-syntax.mjs
 */
import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const problems = []

/** 需要过 `node --check` 的入口文件。 */
const ENTRIES = ['lib/index.js', 'lib/delete.js', 'lib/paths.js', 'lib/server.js', 'bin/dsh-session-delete.js']

for (const entry of ENTRIES) {
  try {
    execFileSync(process.execPath, ['--check', join(root, entry)], { stdio: 'pipe' })
    console.log(`ok   syntax  ${entry}`)
  } catch (error) {
    problems.push(`语法错误 ${entry}: ${String(error.stderr || error.message).trim()}`)
  }
}

/* client.js 是浏览器 bundle，顶层调用了 window.__ModuleLoader__，不能直接 --check 执行，
   但可以做纯语法解析：交给 vm 以脚本模式编译（不执行）。 */
try {
  const source = readFileSync(join(root, 'client.js'), 'utf8')
  new Function(source.replace(/^window\.__ModuleLoader__\.load\(/, 'void ('))
  console.log('ok   syntax  client.js')
} catch (error) {
  problems.push(`语法错误 client.js: ${error.message}`)
}

/* 清单自检。 */
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
const required = ['name', 'version', 'description', 'license', 'main', 'dsh']
for (const field of required) {
  if (pkg[field] === undefined) problems.push(`package.json 缺少字段: ${field}`)
}
if (pkg.private === true) problems.push('package.json 仍标记 private: true')
for (const field of ['description', 'name', 'author', 'repository']) {
  const text = typeof pkg[field] === 'object' ? JSON.stringify(pkg[field]) : String(pkg[field] ?? '')
  if (/C:\\\\Users\\\\|HOME_USER|[A-Za-z]:\\\\dsh\\\\/i.test(text)) problems.push(`package.json 字段含本机路径: ${field}`)
}
if (pkg.dsh?.bundle?.patch && !existsSync(join(root, pkg.dsh.bundle.patch))) {
  problems.push(`bundle patch 不存在: ${pkg.dsh.bundle.patch}`)
}
if (pkg.main && !existsSync(join(root, pkg.main))) problems.push(`main 不存在: ${pkg.main}`)
console.log('ok   manifest')

/* 隐私与密钥扫描：仓库里不该出现绝对用户路径、令牌、私钥。
   `/home/<name>/` 只在排除测试样例名后才算命中 —— 单测里需要构造假路径。 */
const SAMPLE_USERS = new Set(['me', 'user', 'example', 'test', 'alice', 'bob', 'someone', 'you'])
const SENSITIVE = [
  { pattern: /[A-Za-z]:\\\\Users\\\\[^\\\s'"`]+/i, label: '本机用户目录绝对路径' },
  {
    pattern: /\/home\/([a-z0-9_-]+)\/(?!\.dsh)/i,
    label: '疑似本机 home 绝对路径',
    ignore: (match) => SAMPLE_USERS.has(match[1].toLowerCase()),
  },
  { pattern: /sk-[A-Za-z0-9]{16,}/, label: '疑似 API Key' },
  { pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----/, label: '私钥' },
  { pattern: /ghp_[A-Za-z0-9]{20,}/, label: 'GitHub token' },
  { pattern: /AKIA[0-9A-Z]{16}/, label: 'AWS Access Key' },
]
const SKIP_DIRS = new Set(['node_modules', '.git', 'coverage'])
const TEXT_EXT = /\.(js|mjs|cjs|json|md|yml|yaml|txt|html|css)$/i

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue
    const full = join(dir, name)
    if (statSync(full).isDirectory()) walk(full, out)
    else if (TEXT_EXT.test(name)) out.push(full)
  }
  return out
}

for (const file of walk(root)) {
  const text = readFileSync(file, 'utf8')
  for (const rule of SENSITIVE) {
    const global = new RegExp(rule.pattern.source, rule.pattern.flags.includes('g') ? rule.pattern.flags : rule.pattern.flags + 'g')
    for (const match of text.matchAll(global)) {
      if (rule.ignore && rule.ignore(match)) continue
      problems.push(`${relative(root, file)} 命中「${rule.label}」: ${match[0].slice(0, 60)}`)
      break
    }
  }
}
console.log(`ok   privacy-scan (${walk(root).length} files)`)

if (problems.length > 0) {
  console.error('\n发现问题:')
  for (const problem of problems) console.error(' - ' + problem)
  process.exit(1)
}
console.log('\n全部检查通过。')

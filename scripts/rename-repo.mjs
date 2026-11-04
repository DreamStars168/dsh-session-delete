#!/usr/bin/env node
/**
 * 把仓库里的 YOUR_GITHUB_NAME 占位符一次性替换成你的 GitHub 账号。
 *
 * 用法：
 *   node scripts/rename-repo.mjs <你的GitHub用户名> [--repo <仓库名>] [--dry]
 *
 * 例：
 *   node scripts/rename-repo.mjs octocat
 *   node scripts/rename-repo.mjs octocat --repo dsh-session-delete
 *
 * 只改这几类文件：package.json、README*.md、CHANGELOG.md、CONTRIBUTING.md。
 * 改之前会打印每一处命中，`--dry` 只看不改。
 */
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const PLACEHOLDER = 'YOUR_GITHUB_NAME'
const TARGET_EXT = /\.(json|md)$/i
const SKIP_DIRS = new Set(['node_modules', '.git', 'coverage', 'release'])

const argv = process.argv.slice(2)
const owner = argv.find((arg) => !arg.startsWith('--') && argv[argv.indexOf(arg) - 1] !== '--repo')
const repoIndex = argv.indexOf('--repo')
const repo = repoIndex !== -1 ? argv[repoIndex + 1] : 'dsh-session-delete'
const dry = argv.includes('--dry')

if (!owner) {
  console.error('用法: node scripts/rename-repo.mjs <你的GitHub用户名> [--repo <仓库名>] [--dry]')
  process.exit(2)
}
if (!/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/.test(owner)) {
  console.error(`不是合法的 GitHub 用户名: ${owner}`)
  process.exit(2)
}

/** 收集需要处理的文本文件。 */
function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue
    const full = join(dir, name)
    if (statSync(full).isDirectory()) walk(full, out)
    else if (TARGET_EXT.test(name) && name !== 'package-lock.json') out.push(full)
  }
  return out
}

const files = walk(root)
let totalHits = 0
let touched = 0

for (const file of files) {
  const text = readFileSync(file, 'utf8')
  if (!text.includes(PLACEHOLDER)) continue
  const hits = text.split(PLACEHOLDER).length - 1
  totalHits += hits
  touched += 1
  const label = relative(root, file)
  console.log(`${dry ? 'would change' : 'changing'} ${label}: ${hits} 处`)

  if (dry) continue

  /* 先把仓库名占位一并处理：URL 里的仓库段可能与本仓库名不同。 */
  let next = text.split(PLACEHOLDER).join(owner)
  next = next.replace(new RegExp(`${owner}/dsh-session-delete`, 'g'), `${owner}/${repo}`)
  writeFileSync(file, next, 'utf8')
}

console.log('')
if (totalHits === 0) {
  console.log('没有找到占位符，可能已经替换过了。')
  process.exit(0)
}
console.log(`${dry ? '将改动' : '已改动'} ${totalHits} 处，涉及 ${touched} 个文件。`)
if (!dry) {
  console.log('')
  console.log('下一步：')
  console.log(`  1. 在 GitHub 建仓库 ${owner}/${repo}`)
  console.log('  2. git init && git add -A && git commit -m "feat: initial release"')
  console.log(`  3. git remote add origin https://github.com/${owner}/${repo}.git && git push -u origin main`)
  console.log('  4. 确认 package.json 的 dsh.install 里三个 URL 都指向你的仓库')
}

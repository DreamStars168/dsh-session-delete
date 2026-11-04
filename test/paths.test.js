/**
 * 路径编码与主目录解析的单测。
 *
 * 跑：node test/paths.test.js
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { dshHome, encodeSegment, projectKey, projectionRoot } from '../lib/paths.js'

test('encodeSegment 放行安全字符', () => {
  assert.equal(encodeSegment('session-abc_1.2'), 'session-abc_1.2')
})

test('encodeSegment 特判 . 与 ..', () => {
  assert.equal(encodeSegment('.'), '~002E')
  assert.equal(encodeSegment('..'), '~002E~002E')
})

test('encodeSegment 转义冒号与斜杠', () => {
  assert.equal(encodeSegment('a:b'), 'a~003Ab')
  assert.equal(encodeSegment('a/b'), 'a~002Fb')
  assert.equal(encodeSegment('a b'), 'a~0020b')
})

test('encodeSegment 转义波浪号自身', () => {
  assert.equal(encodeSegment('a~b'), 'a~007Eb')
})

test('encodeSegment 拒绝空串', () => {
  assert.throws(() => encodeSegment(''), /empty path segment/)
})

test('encodeSegment 处理非 ASCII', () => {
  assert.equal(encodeSegment('会'), '~4F1A')
})

test('projectKey 包在双横线之间且去前导连字符', () => {
  assert.equal(projectKey('/home/me/proj'), '--home-me-proj--')
  assert.equal(projectKey('C:\\work\\demo'), '--C-work-demo--')
})

test('projectKey 压缩连续分隔符', () => {
  assert.equal(projectKey('/a//b///c'), '--a-b-c--')
})

test('projectKey 兜底 root', () => {
  assert.equal(projectKey('/'), '--root--')
})

test('projectKey 拒绝空路径', () => {
  assert.throws(() => projectKey(''), /empty project path/)
})

test('dshHome 优先读 DSH_HOME', () => {
  assert.equal(dshHome({ DSH_HOME: '/tmp/x' }), '/tmp/x')
})

test('dshHome 回退用户主目录下的 .dsh', () => {
  const home = dshHome({})
  assert.ok(home.endsWith('.dsh'), home)
})

test('projectionRoot 支持独立重定向', () => {
  assert.equal(projectionRoot({ DSH_HOME_PROJECTION_DIR: '/tmp/p' }), '/tmp/p')
})

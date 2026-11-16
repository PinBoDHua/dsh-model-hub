import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
const files = ['../tests/dsh.test.mjs', '../tests/dsh-multi.test.mjs'].map((f) => fileURLToPath(new URL(f, import.meta.url)))
const child = spawn(process.execPath, ['--test', '--test-concurrency=1', ...files], { stdio: 'inherit' })
child.on('error', (e) => { console.error(e.message); process.exitCode = 1 })
child.on('exit', (code) => { process.exitCode = code ?? 1 })
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
const child = spawn(process.execPath, ['--test', '--test-concurrency=1', fileURLToPath(new URL('../tests/dsh.test.mjs', import.meta.url))], { stdio: 'inherit' })
child.on('error', (e) => { console.error(e.message); process.exitCode = 1 })
child.on('exit', (code) => { process.exitCode = code ?? 1 })
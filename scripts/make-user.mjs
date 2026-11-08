#!/usr/bin/env node
// Usage: node scripts/make-user.mjs [--id 1] [--reset]
// Prints one SQL statement to stdout. Pipe it to: wrangler d1 execute nudge --file=-
import { hashPassword } from '../src/auth.js';

const args = process.argv.slice(2);
const idx = args.indexOf('--id');
const id = idx < 0 ? 1 : Number(args[idx + 1]);
const reset = args.includes('--reset');

if (!Number.isInteger(id) || id < 1) fail('bad --id');
if (!process.stdin.isTTY) fail('needs an interactive terminal');

function fail(msg) {
  process.stderr.write(`${msg}\n`);
  process.exit(1);
}

function ask(q, hidden = false) {
  return new Promise((resolve) => {
    let buf = '';
    process.stderr.write(q);
    process.stdin.setRawMode(true);
    process.stdin.setEncoding('utf8');
    process.stdin.resume();
    const done = () => {
      process.stdin.off('data', onData);
      process.stdin.setRawMode(false);
      process.stdin.pause();
      process.stderr.write('\n');
      resolve(buf);
    };
    const onData = (chunk) => {
      const s = chunk.replace(/\x1b\[[0-9;]*[A-Za-z]/g, '');
      for (const c of s) {
        if (c === '\r' || c === '\n') return done();
        if (c === '\u0003') {
          process.stderr.write('\n');
          process.exit(130);
        }
        if (c === '\u007f' || c === '\b') {
          if (buf.length && !hidden) process.stderr.write('\b \b');
          buf = buf.slice(0, -1);
        } else if (c >= ' ') {
          buf += c;
          if (!hidden) process.stderr.write(c);
        }
      }
    };
    process.stdin.on('data', onData);
  });
}

const q = (s) => s.replace(/'/g, "''");

const email = (await ask('Email: ')).trim().toLowerCase();
if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) fail('invalid email');
const name = (await ask('Name: ')).trim();
const pw = await ask('Password (min 8 chars): ', true);
const pw2 = await ask('Repeat password: ', true);
if (pw.length < 8 || pw.length > 200) fail('password must be 8 to 200 characters');
if (pw !== pw2) fail('passwords do not match');

const { hash, salt } = await hashPassword(pw);
if (reset) {
  console.log(`UPDATE users SET pw_hash='${hash}', salt='${salt}' WHERE email='${q(email)}';`);
} else {
  console.log(`INSERT INTO users(id, email, name, pw_hash, salt) VALUES(${id}, '${q(email)}', '${q(name)}', '${hash}', '${salt}');`);
}

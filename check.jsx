const fs = require('fs');
const src = fs.readFileSync('frontend/src/components/FacultyWorkspacePage.jsx', 'utf8');
const lines = src.split('\n');

const openRe = /<([A-Z][\w-]*)(\s[^>]*?)?\s*\/>/g;      // self-closing
const openTagRe = /<([A-Z][\w-]*)(\s[^>]*?)?\s*>/g;      // open tag
const closeRe = /<\/([A-Z][\w-]*)\s*>/g;                 // close tag

const stack = []; // {tag, line}
const extraCloses = [];

for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  // closures
  let m;
  re1 = /<\/([A-Z][\w-]*)\s*>/g;
  while ((m = re1.exec(line))) {
    const tag = m[1];
    const top = stack[stack.length - 1];
    if (top && top.tag === tag) {
      stack.pop();
    } else {
      extraCloses.push({ line: i + 1, tag, top: top ? top.tag : null });
    }
  }
  // opens (skip self-closing)
  re2 = /<([A-Z][\w-]*)(\s[^>]*?)?\s*>/g;
  while ((m = re2.exec(line))) {
    const full = m[0];
    if (full.trim().endsWith('/>')) continue;
    stack.push({ tag: m[1], line: i + 1 });
  }
}

console.log('=== UNCLOSED OPEN TAGS ===');
stack.forEach(s => console.log(`  line ${s.line}: <${s.tag}>`));
console.log('=== EXTRA CLOSE TAGS ===');
extraCloses.forEach(e => console.log(`  line ${e.line}: </${e.tag}> (top was <${e.top}>)`));
console.log('Unclosed count:', stack.length, 'Extra close count:', extraCloses.length);

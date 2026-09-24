import fs from 'node:fs';
import path from 'node:path';
const manifest = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const files = [];
const walk = (dir) => { for (const entry of fs.readdirSync(dir, { withFileTypes: true })) { const file = path.join(dir, entry.name); if (entry.isDirectory()) walk(file); else if (/\.(?:ts|tsx|js|mjs)$/.test(file) && file !== 'scripts/audit-remotion.mjs') files.push(file); } };
walk('src'); walk('scripts');
const imports = files.map(file => ({ file, imports: [...fs.readFileSync(file, 'utf8').matchAll(/(?:from\s*|import\s*\(|require\s*\()\s*['"]([^'"]+)['"]/g)].map(match => match[1]) }));
const packages = Object.entries(manifest.dependencies).filter(([name]) => name === 'remotion' || name.startsWith('@remotion/')).map(([name, declared]) => {
  let installed = null;
  try { installed = JSON.parse(fs.readFileSync(path.join('node_modules', name, 'package.json'), 'utf8')).version; } catch {}
  const referencedBy = imports.filter(item => item.imports.some(value => value === name || value.startsWith(name + '/'))).map(item => item.file);
  return { name, declared, installed, status: !installed ? 'missing' : referencedBy.length ? 'referenced_in_code' : 'installed_not_referenced', referencedBy };
});
const report = { note: 'Import references prove usage, not support for every API in a package. The model contract is derived from naylaActionSchema. No claim of full Remotion API coverage.', packages };
fs.writeFileSync('docs/remotion-capabilities-audit.json', JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ total: packages.length, missing: packages.filter(p => !p.installed).map(p => p.name), referenced: packages.filter(p => p.referencedBy.length).length, installedNotReferenced: packages.filter(p => p.installed && !p.referencedBy.length).map(p => p.name) }));

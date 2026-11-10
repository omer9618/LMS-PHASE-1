// Generates docs/DATABASE_SCHEMA.md from prisma/schema.prisma (#122).
//
//   node scripts/schema-doc.mjs > docs/DATABASE_SCHEMA.md && npx prettier --write docs/DATABASE_SCHEMA.md
//
// Run it after every schema change. schema.prisma stays the source of truth; this is a
// readable view of it (table and column names as they are in PostgreSQL).
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../prisma/schema.prisma', import.meta.url), 'utf8');
const lines = source.split(/\r?\n/);

const enums = new Map();
const models = [];
let section = 'Other';
let current = null;
let pendingComment = [];

for (const raw of lines) {
  const line = raw.trim();
  const header = /^\/\/\s*\d+\.\s*(.+)$/.exec(line);
  if (!current && header) {
    section = header[1].replace(/^Domain \d+\s*[—-]\s*/, '');
    continue;
  }
  if (!current) {
    const open = /^(model|enum)\s+(\w+)\s*\{/.exec(line);
    if (open) {
      current = { kind: open[1], name: open[2], section, body: [], comment: pendingComment };
      pendingComment = [];
    } else if (line.startsWith('//') && !/^\/\/\s*[─-]+$/.test(line)) {
      pendingComment.push(line.replace(/^\/\/\s?/, ''));
    } else if (line === '') {
      pendingComment = [];
    }
    continue;
  }
  if (line === '}') {
    if (current.kind === 'enum') enums.set(current.name, current);
    else models.push(current);
    current = null;
    continue;
  }
  current.body.push(line);
}

// PostgreSQL type for a Prisma scalar (as Prisma's PostgreSQL connector maps it).
const PG_TYPES = {
  String: 'text',
  Int: 'integer',
  BigInt: 'bigint',
  Boolean: 'boolean',
  DateTime: 'timestamp(3)',
  Json: 'jsonb',
  Decimal: 'numeric(65,30)',
  Float: 'double precision',
  Bytes: 'bytea',
};
function pgType(type, db) {
  if (db) return db.replace(/^(\w+)/, (name) => name.toLowerCase());
  return PG_TYPES[type] ?? `enum ${type}`;
}

const modelNames = new Set(models.map((m) => m.name));
const tableOf = (model) => {
  const map = model.body.find((l) => l.startsWith('@@map('));
  return map ? /@@map\("([^"]+)"\)/.exec(map)[1] : model.name;
};
const tableByModel = new Map(models.map((m) => [m.name, tableOf(m)]));

function parseModel(model) {
  const columns = [];
  const foreignKeys = new Map();
  const blockAttrs = [];
  let note = [];
  const fieldColumn = new Map();

  for (const line of model.body) {
    if (line.startsWith('//')) {
      note.push(line.replace(/^\/\/\s?/, ''));
      continue;
    }
    if (line === '') {
      note = [];
      continue;
    }
    if (line.startsWith('@@')) {
      if (!line.startsWith('@@map')) blockAttrs.push(line);
      continue;
    }
    const m = /^(\w+)\s+(\w+)(\[\])?(\?)?\s*(.*)$/.exec(line);
    if (!m) continue;
    const [, field, type, list, optional, attrs] = m;
    if (modelNames.has(type)) {
      const rel = /fields:\s*\[([^\]]+)\]/.exec(attrs);
      if (rel && !list) {
        const onDelete = /onDelete:\s*(\w+)/.exec(attrs);
        for (const f of rel[1].split(',').map((s) => s.trim())) {
          foreignKeys.set(
            f,
            `→ ${tableByModel.get(type)}${onDelete ? ` (on delete ${onDelete[1]})` : ''}`,
          );
        }
      }
      note = [];
      continue;
    }
    const column = /@map\("([^"]+)"\)/.exec(attrs)?.[1] ?? field;
    fieldColumn.set(field, column);
    const db = /@db\.(\w+(?:\([^)]*\))?)/.exec(attrs)?.[1];
    const notes = [];
    if (/@id\b/.test(attrs)) notes.push('primary key');
    if (/@unique\b/.test(attrs)) notes.push('unique');
    const def = /@default\(((?:[^()]|\([^)]*\))*)\)/.exec(attrs)?.[1];
    if (def) notes.push(`default \`${def}\``);
    columns.push({
      field,
      column,
      type: `${pgType(type, db)}${list ? '[]' : ''}`,
      nullable: optional ? 'yes' : '',
      notes,
      comment: note.join(' '),
    });
    note = [];
  }
  for (const col of columns) {
    if (foreignKeys.has(col.field)) col.notes.push(`FK ${foreignKeys.get(col.field)}`);
  }
  const constraints = blockAttrs.map((attr) =>
    attr.replace(
      /\[([^\]]+)\]/,
      (_, fields) =>
        `[${fields
          .split(',')
          .map((f) => fieldColumn.get(f.trim()) ?? f.trim())
          .join(', ')}]`,
    ),
  );
  return { columns, constraints };
}

const escape = (text) => text.replace(/\|/g, '\\|');
const out = [];
out.push('# Database schema');
out.push('');
out.push(
  'Generated from `prisma/schema.prisma` by `node scripts/schema-doc.mjs`; do not edit by hand. ' +
    'Regenerate after every migration. Rules behind the schema (money in minor units, the ' +
    'append-only ledger, additions to Schema v2.0) are in [DATABASE_RULES.md](DATABASE_RULES.md).',
);
out.push('');
out.push(
  `**${models.length} tables, ${enums.size} enums.** Names below are the PostgreSQL names. ` +
    'Every primary key is a UUID, every timestamp is `timestamptz` (UTC), and money columns end ' +
    'in `_minor` (integer minor units).',
);
out.push('');

const sections = [...new Set(models.map((m) => m.section))];
out.push('## Contents');
out.push('');
for (const s of sections) {
  const tables = models.filter((m) => m.section === s).map((m) => `\`${tableOf(m)}\``);
  out.push(`- **${s}:** ${tables.join(', ')}`);
}
out.push('- **Enums**');
out.push('');

for (const s of sections) {
  out.push(`## ${s}`);
  out.push('');
  for (const model of models.filter((m) => m.section === s)) {
    const { columns, constraints } = parseModel(model);
    out.push(`### ${tableOf(model)}`);
    out.push('');
    if (model.comment.length) {
      out.push(model.comment.join(' '));
      out.push('');
    }
    out.push('| Column | Type | Null | Notes |');
    out.push('| --- | --- | --- | --- |');
    for (const c of columns) {
      const notes = [...c.notes, c.comment].filter(Boolean).join('; ');
      out.push(`| \`${c.column}\` | ${c.type} | ${c.nullable} | ${escape(notes)} |`);
    }
    out.push('');
    if (constraints.length) {
      out.push('Constraints and indexes:');
      out.push('');
      for (const c of constraints) out.push(`- \`${c}\``);
      out.push('');
    }
  }
}

out.push('## Enums');
out.push('');
out.push('| Enum | Values |');
out.push('| --- | --- |');
for (const e of enums.values()) {
  const values = e.body.filter((l) => l && !l.startsWith('//')).map((v) => `\`${v}\``);
  out.push(`| ${e.name} | ${values.join(', ')} |`);
}
out.push('');

process.stdout.write(out.join('\n'));

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = join(__dirname, '..');
const tokensCss = readFileSync(join(__dirname, 'tokens.css'), 'utf8');

/** Declarations of the first block whose selector matches. */
function block(selector: string): Record<string, string> {
  const start = tokensCss.indexOf(`${selector} {`);
  if (start < 0) throw new Error(`no ${selector} block`);
  const body = tokensCss.slice(start, tokensCss.indexOf('\n}', start));
  const out: Record<string, string> = {};
  for (const match of body.matchAll(/(--[\w-]+):\s*([^;]+);/g)) out[match[1]!] = match[2]!.trim();
  return out;
}

const root = block(':root');
const compact = block("[data-density='compact']");

function hex(name: string): string {
  const value = root[name];
  if (!value || !/^#[0-9a-f]{6}$/i.test(value)) throw new Error(`${name} is not a hex colour`);
  return value;
}

function luminance(colour: string): number {
  const channels = [1, 3, 5].map((i) => Number.parseInt(colour.slice(i, i + 2), 16) / 255);
  const [r, g, b] = channels.map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(hex(a)), luminance(hex(b))].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
}

describe('colour tokens meet WCAG 2.2 AA', () => {
  const text: Array<[string, string]> = [
    ['--color-text', '--color-bg'],
    ['--color-text', '--color-surface'],
    ['--color-text', '--color-surface-sunken'],
    ['--color-text-muted', '--color-bg'],
    ['--color-text-muted', '--color-surface'],
    ['--color-primary', '--color-bg'],
    ['--color-primary', '--color-primary-subtle'],
    ['--color-primary-hover', '--color-bg'],
    ['--color-on-primary', '--color-primary'],
    ['--color-on-primary', '--color-primary-hover'],
    ['--color-text-inverse', '--color-danger'],
    ['--color-text-inverse', '--color-danger-hover'],
    ['--color-success', '--color-success-subtle'],
    ['--color-warning', '--color-warning-subtle'],
    ['--color-danger', '--color-danger-subtle'],
    ['--color-danger', '--color-bg'],
    ['--color-info', '--color-info-subtle'],
    ['--color-text', '--color-info-subtle'],
    ['--color-text', '--color-danger-subtle'],
  ];

  it.each(text)('%s on %s is at least 4.5:1', (fg, bg) => {
    expect(contrast(fg, bg)).toBeGreaterThanOrEqual(4.5);
  });

  it.each([
    ['--color-border-strong', '--color-bg'],
    ['--focus-ring-color', '--color-bg'],
  ])('%s on %s is at least 3:1 (non-text)', (fg, bg) => {
    expect(contrast(fg, bg)).toBeGreaterThanOrEqual(3);
  });
});

describe('density', () => {
  it('compact overrides only density tokens, and every one of them', () => {
    const densityTokens = Object.keys(root).filter((name) =>
      /^--(density|control|field|stack|table|badge)-/.test(name),
    );
    expect(densityTokens.length).toBeGreaterThan(8);
    expect(Object.keys(compact).sort()).toEqual(densityTokens.sort());
  });

  it('keeps compact touch targets at least 24px (WCAG 2.5.8)', () => {
    for (const name of ['--control-height', '--control-height-sm']) {
      const rem = Number.parseFloat(compact[name] ?? '0');
      expect(rem * 16).toBeGreaterThanOrEqual(24);
    }
  });
});

/** Every .css file under src. */
function cssFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return cssFiles(path);
    return name.endsWith('.css') ? [path] : [];
  });
}

/** Declarations that are not inside an @media block, with the selector they belong to. */
function unconditionalDeclarations(css: string): Array<{ selector: string; decl: string }> {
  const out: Array<{ selector: string; decl: string }> = [];
  const stack: string[] = [];
  let buffer = '';
  for (const char of css.replace(/\/\*[\s\S]*?\*\//g, '')) {
    if (char === '{') {
      stack.push(buffer.trim());
      buffer = '';
    } else if (char === '}') {
      if (buffer.trim() && !stack.some((s) => s.startsWith('@media'))) {
        for (const decl of buffer.split(';')) {
          if (decl.trim()) out.push({ selector: stack.at(-1) ?? '', decl: decl.trim() });
        }
      }
      stack.pop();
      buffer = '';
    } else if (char === ';' && stack.length > 0 && !stack.some((s) => s.startsWith('@media'))) {
      if (buffer.trim()) out.push({ selector: stack.at(-1) ?? '', decl: buffer.trim() });
      buffer = '';
    } else {
      buffer += char;
    }
  }
  return out;
}

const NARROWEST = 380;

function toPx(value: string, unit: string): number {
  return unit === 'px' ? Number.parseFloat(value) : Number.parseFloat(value) * 16;
}

/**
 * #45: layouts must work at 380px. jsdom has no layout engine, so this guards the cause of
 * horizontal overflow instead: no fixed width, min-width or grid track wider than 380px outside a
 * media query. (Checked by eye at 380px too: see web/README.md.)
 */
describe('#45: nothing forces the page wider than 380px', () => {
  const files = cssFiles(SRC);

  it('finds the stylesheets', () => {
    expect(files.length).toBeGreaterThan(5);
  });

  it.each(files.map((f) => [f.slice(SRC.length + 1), f]))('%s', (_name, file) => {
    const offenders: string[] = [];
    for (const { selector, decl } of unconditionalDeclarations(readFileSync(file, 'utf8'))) {
      const width = /^(min-width|width|flex-basis)\s*:\s*([\d.]+)(px|rem)\b/.exec(decl);
      if (width && toPx(width[2]!, width[3]!) > NARROWEST)
        offenders.push(`${selector} { ${decl} }`);
      for (const track of decl.matchAll(/minmax\(\s*([\d.]+)(px|rem)/g)) {
        if (toPx(track[1]!, track[2]!) > NARROWEST) offenders.push(`${selector} { ${decl} }`);
      }
    }
    expect(offenders).toEqual([]);
  });
});

import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import type { ColoredChar } from '../types.js';

/**
 * Convert hex color to ANSI 256-color code
 */
export function hexToAnsi256(hex: string): number {
  // Remove # if present
  hex = hex.replace('#', '');

  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);

  // Check for grayscale
  if (r === g && g === b) {
    if (r < 8) return 16; // black
    if (r > 248) return 231; // white
    return Math.round((r - 8) / 10) + 232;
  }

  // Convert to 6x6x6 color cube
  const ansiR = Math.round((r / 255) * 5);
  const ansiG = Math.round((g / 255) * 5);
  const ansiB = Math.round((b / 255) * 5);

  return 16 + 36 * ansiR + 6 * ansiG + ansiB;
}

/**
 * Map specific hex colors to ANSI codes for better rendering
 */
export function mapHexToAnsi(hex: string): string {
  const color = hex.toLowerCase();

  // Direct mappings for known colors
  if (color === '#000000') {
    return '\x1b[38;5;232m'; // Dark black
  }
  if (color.startsWith('#48') || color.startsWith('#46') || color.startsWith('#47') || color.startsWith('#49') || color.startsWith('#4a')) {
    return '\x1b[38;5;240m'; // Gray
  }
  if (color.startsWith('#01') || color.startsWith('#02') || color.startsWith('#00')) {
    // Cyan/blue colors
    return '\x1b[38;5;39m'; // Bright cyan
  }

  // Fallback to calculated ANSI 256 color
  return `\x1b[38;5;${hexToAnsi256(hex)}m`;
}

/**
 * Parse HTML file and extract colored characters
 */
export function parseAsciiHtml(htmlContent: string): ColoredChar[][] {
  const lines: ColoredChar[][] = [];
  let currentLine: ColoredChar[] = [];

  // Match span elements with color and content, or <br> tags
  const spanRegex = /<span style="color:(#[0-9a-fA-F]{6})">(.)<\/span>|<br>/g;
  let match;

  while ((match = spanRegex.exec(htmlContent)) !== null) {
    if (match[0] === '<br>') {
      lines.push(currentLine);
      currentLine = [];
    } else {
      const color = match[1];
      const char = match[2];
      currentLine.push({ char, color });
    }
  }

  // Add last line if not empty
  if (currentLine.length > 0) {
    lines.push(currentLine);
  }

  return lines;
}

/**
 * Render colored ASCII art to terminal string with transparent background
 */
export function renderAsciiArt(lines: ColoredChar[][]): string {
  const reset = '\x1b[0m';
  let output = '';

  for (const line of lines) {
    let currentColor = '';
    for (const { char, color } of line) {
      // Convert black @ characters to spaces (background)
      if (color === '#000000') {
        output += ' ';
      } else {
        // For gray # and cyan + characters, render with color
        const ansiColor = mapHexToAnsi(color);
        if (ansiColor !== currentColor) {
          output += ansiColor;
          currentColor = ansiColor;
        }
        output += char;
      }
    }
    output += reset + '\n';
  }

  return output;
}

/**
 * Load and display ASCII art from the HTML file
 */
export function displayAsciiArt(): void {
  try {
    // Get the directory of this module
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = dirname(__filename);

    // Resolve path to neuca-ascii.html (in project root)
    const htmlPath = resolve(__dirname, '../../../../neuca-ascii.html');

    const htmlContent = readFileSync(htmlPath, 'utf-8');
    const lines = parseAsciiHtml(htmlContent);
    const output = renderAsciiArt(lines);

    console.log(output);
  } catch (error) {
    // Silently fail if ASCII art file is not found
    // The CLI will still work without it
  }
}

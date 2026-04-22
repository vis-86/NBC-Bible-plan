/**
 * Parses BibleQuote-style HTML: <h4>chapter title</h4> then verse blocks in <p>...</p>.
 * Some modules omit </p>; verses run until the next <p or <h4.
 * Output chapter strings match RST style: "1 … 2 … 3 …" (plain text, verse numbers at verse starts).
 */

function stripTags(html: string): string {
  return html.replace(/<[^>]+>/g, '');
}

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
}

/**
 * Chapter number from <h4>…</h4>: last integer in the header (e.g. "Бытие 1", "1", "3-е Иоанна 1").
 */
function chapterNumberFromHeader(header: string): string | null {
  const nums = header.match(/\d+/g);
  if (!nums?.length) return null;
  return nums[nums.length - 1] ?? null;
}

/** Verse paragraphs: closed <p>...</p> or unclosed <p> until next <p / <h4. */
function extractParagraphInnerTexts(block: string): string[] {
  const lower = block.toLowerCase();
  const out: string[] = [];
  let i = 0;

  while (i < block.length) {
    const pStart = lower.indexOf('<p', i);
    if (pStart === -1) break;
    const gt = block.indexOf('>', pStart);
    if (gt === -1) break;
    const from = gt + 1;

    const close = lower.indexOf('</p>', from);
    const nextP = lower.indexOf('<p', from);
    const nextH4 = lower.indexOf('<h4', from);
    const nextOpens = [nextP, nextH4].filter((x) => x !== -1);
    const minOpen = nextOpens.length ? Math.min(...nextOpens) : Infinity;

    let to: number;
    let nextI: number;
    if (close !== -1 && close < minOpen) {
      to = close;
      nextI = close + '</p>'.length;
    } else {
      to = block.length;
      if (nextP !== -1) to = Math.min(to, nextP);
      if (nextH4 !== -1) to = Math.min(to, nextH4);
      nextI = nextP !== -1 && nextP === to ? nextP : to;
    }

    out.push(block.slice(from, to));
    i = nextI;
    if (i <= pStart) i = gt + 1;
  }

  return out;
}

export function parseBiblequoteBookHtml(html: string): Record<string, string> {
  const normalized = html.replace(/\r/g, '');
  const h4Regex = /<h4[^>]*>([^<]+)<\/h4>/gi;
  const markers: Array<{ header: string; contentStart: number; contentEnd: number }> = [];
  let m: RegExpExecArray | null;
  while ((m = h4Regex.exec(normalized)) !== null) {
    const header = m[1].trim();
    const contentStart = m.index + m[0].length;
    markers.push({ header, contentStart, contentEnd: normalized.length });
  }
  for (let j = 0; j < markers.length; j++) {
    markers[j].contentEnd = j + 1 < markers.length ? markers[j + 1].contentStart : normalized.length;
  }

  const chapters: Record<string, string> = {};
  for (const { header, contentStart, contentEnd } of markers) {
    const ch = chapterNumberFromHeader(header);
    if (!ch) continue;

    const block = normalized.slice(contentStart, contentEnd);
    const inners = extractParagraphInnerTexts(block);
    const verseParts: string[] = [];
    for (const innerHtml of inners) {
      const inner = decodeHtmlEntities(stripTags(innerHtml)).replace(/\s+/g, ' ').trim();
      if (inner) verseParts.push(inner);
    }

    chapters[ch] = verseParts.length ? verseParts.join(' ') : '';
  }

  return chapters;
}

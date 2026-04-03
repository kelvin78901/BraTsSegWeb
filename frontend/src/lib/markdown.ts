export function renderMarkdown(text: unknown): string {
  if (!text) return '';

  const str = typeof text === 'string' ? text
    : typeof text === 'object' ? JSON.stringify(text, null, 2)
    : String(text);

  const esc = str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  const lines = esc.split('\n');
  let out = '';
  let inList = false;
  let inNumList = false;

  const fmt = (s: string): string => {
    let r = s;
    r = r.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    r = r.replace(/\*([^*]+)\*/g, '<em>$1</em>');
    return r;
  };

  for (const line of lines) {
    if (!line.trim()) {
      if (inList) { out += '</ul>'; inList = false; }
      if (inNumList) { out += '</ol>'; inNumList = false; }
      out += '<p class="md-spacer"></p>';
    } else if (/^###\s+/.test(line)) {
      if (inList) { out += '</ul>'; inList = false; }
      if (inNumList) { out += '</ol>'; inNumList = false; }
      out += `<h4>${fmt(line.replace(/^###\s+/, ''))}</h4>`;
    } else if (/^\d+[).]\s+/.test(line)) {
      if (inList) { out += '</ul>'; inList = false; }
      if (!inNumList) { out += '<ol>'; inNumList = true; }
      out += `<li>${fmt(line.replace(/^\d+[).]\s+/, ''))}</li>`;
    } else if (/^[-*]\s+/.test(line)) {
      if (inNumList) { out += '</ol>'; inNumList = false; }
      if (!inList) { out += '<ul>'; inList = true; }
      out += `<li>${fmt(line.replace(/^[-*]\s+/, ''))}</li>`;
    } else {
      if (inList) { out += '</ul>'; inList = false; }
      if (inNumList) { out += '</ol>'; inNumList = false; }
      out += `<p>${fmt(line)}</p>`;
    }
  }
  if (inList) out += '</ul>';
  if (inNumList) out += '</ol>';
  return out;
}

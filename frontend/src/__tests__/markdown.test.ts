import { renderMarkdown } from '../lib/markdown';
import { describe, it, expect } from 'vitest';

describe('renderMarkdown', () => {
  it('converts bold text', () => {
    expect(renderMarkdown('**hello**')).toContain('<strong>hello</strong>');
  });

  it('converts italic text', () => {
    expect(renderMarkdown('*world*')).toContain('<em>world</em>');
  });

  it('converts heading', () => {
    expect(renderMarkdown('### Title')).toContain('<h4>Title</h4>');
  });

  it('converts bullet list', () => {
    const html = renderMarkdown('- item 1\n- item 2');
    expect(html).toContain('<ul>');
    expect(html).toContain('<li>item 1</li>');
    expect(html).toContain('<li>item 2</li>');
  });

  it('converts numbered list', () => {
    const html = renderMarkdown('1) first\n2) second');
    expect(html).toContain('<ol>');
    expect(html).toContain('<li>first</li>');
    expect(html).toContain('<li>second</li>');
  });

  it('returns empty string for falsy input', () => {
    expect(renderMarkdown('')).toBe('');
  });

  it('escapes HTML entities', () => {
    const html = renderMarkdown('<script>alert("xss")</script>');
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });
});

export const cleanNaylaChatText = (value: string): string => {
  let text = String(value || '');
  const trimmed = text.trim();

  if (/^\s*\{/.test(trimmed) && /"action"\s*:/.test(trimmed)) {
    return '';
  }

  text = text
    .replace(/\`\`\`(?:json|javascript|typescript|js|ts)?\s*/gi, '')
    .replace(/\`\`\`/g, '')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/(?<!\*)\*([^*\n]+)\*(?!\*)/g, '$1')
    .replace(/(?<!_)_([^_\n]+)_(?!_)/g, '$1')
    .replace(/\`([^\`]+)\`/g, '$1')
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')
    .replace(/^\s*[-*+]\s+/gm, '')
    .replace(/^\s*>\s?/gm, '')
    .replace(/^\s*[-*_]{3,}\s*$/gm, '')
    .replace(/\[([^\]]+)\]\((?:https?:\/\/)?[^)]+\)/g, '$1')
    .replace(/[ \t]+$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  return text;
};

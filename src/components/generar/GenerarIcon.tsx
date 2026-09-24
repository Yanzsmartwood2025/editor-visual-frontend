import type { GenerarModule } from './types';

type IconName = GenerarModule | 'api' | 'gpu';

export default function GenerarIcon({ name }: { name: IconName }) {
  if (name === 'api') {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
        <path d="M8 8a4 4 0 0 1 8 0v1a4 4 0 0 1 0 8h-1" />
        <path d="M9 17H8a4 4 0 0 1 0-8" />
        <path d="M8 13h8" />
      </svg>
    );
  }

  if (name === 'gpu') {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
        <rect x="6" y="6" width="12" height="12" rx="2" />
        <path d="M9 9h6v6H9zM9 2v4M15 2v4M9 18v4M15 18v4M2 9h4M2 15h4M18 9h4M18 15h4" />
      </svg>
    );
  }

  if (name === 'imagen') {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
        <rect x="3" y="4" width="18" height="16" rx="3" />
        <circle cx="9" cy="10" r="1.5" />
        <path d="m5 18 5-5 3 3 2-2 4 4" />
      </svg>
    );
  }

  if (name === 'video') {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
        <rect x="3" y="5" width="14" height="14" rx="3" />
        <path d="m17 10 4-2v8l-4-2z" />
      </svg>
    );
  }

  if (name === 'audio') {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
        <path d="M12 4a3 3 0 0 0-3 3v5a3 3 0 0 0 6 0V7a3 3 0 0 0-3-3Z" />
        <path d="M6 11v1a6 6 0 0 0 12 0v-1M12 18v3M9 21h6" />
      </svg>
    );
  }

  if (name === 'musica') {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
        <path d="M9 18V5l11-2v13" />
        <circle cx="6" cy="18" r="3" />
        <circle cx="17" cy="16" r="3" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <path d="m12 2 9 5-9 5-9-5z" />
      <path d="m3 7 9 5 9-5v10l-9 5-9-5z" />
      <path d="M12 12v10" />
    </svg>
  );
}

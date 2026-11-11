'use client';

import Link from 'next/link';

/** 44×44 gear. Stays out of the bottom nav so check-in and Today keep five tabs. */
export function SettingsGearLink() {
  return (
    <Link
      href="/settings"
      aria-label="Settings"
      className="inline-flex size-11 shrink-0 items-center justify-center rounded-xl text-zinc-400 hover:bg-zinc-900 hover:text-zinc-100"
    >
      <svg
        viewBox="0 0 24 24"
        aria-hidden="true"
        className="h-5 w-5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M12 15.2a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4Z" />
        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" />
      </svg>
    </Link>
  );
}

export function PageHeader({
  title,
  titleAs = 'h1',
}: {
  title: string;
  /** Today already has a workout heading, so its page label stays a paragraph. */
  titleAs?: 'h1' | 'p';
}) {
  const className = 'min-w-0 truncate text-xl font-semibold text-zinc-100';
  return (
    <div className="flex items-center justify-between gap-3">
      {titleAs === 'h1' ? (
        <h1 className={className}>{title}</h1>
      ) : (
        <p className={className}>{title}</p>
      )}
      <SettingsGearLink />
    </div>
  );
}

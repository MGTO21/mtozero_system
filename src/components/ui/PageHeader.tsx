import type { ReactNode } from 'react';

export function PageHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-4 flex items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-xl sm:text-2xl">{title}</h1>
        {subtitle ? (
          <p className="mt-0.5 text-[0.82rem] font-semibold text-ink-500 dark:text-ink-400">{subtitle}</p>
        ) : null}
      </div>
      {action}
    </div>
  );
}

/** Section heading inside a page. */
export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-2.5 flex items-center justify-between gap-3">
      <h2 className="text-[1.05rem]">{children}</h2>
      {action}
    </div>
  );
}

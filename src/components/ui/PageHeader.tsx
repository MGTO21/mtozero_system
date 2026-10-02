import type { ReactNode } from 'react';

/**
 * Screen title. On phones the top bar already names the screen, so here the
 * title is the page's own large heading with its one-line context under it.
 */
export function PageHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="mb-4 flex items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-[1.6rem] leading-tight sm:text-[1.9rem]">{title}</h1>
        {subtitle ? <p className="mt-0.5 text-[0.86rem] font-semibold text-fg-3">{subtitle}</p> : null}
      </div>
      {action ? <div className="flex shrink-0 gap-2">{action}</div> : null}
    </div>
  );
}

/** Section heading inside a page: a ledger column title with a rule to the edge. */
export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-2.5 flex items-center gap-2.5">
      <h2 className="shrink-0 text-[0.95rem] font-extrabold text-fg-2">{children}</h2>
      <span className="h-px flex-1 bg-line" aria-hidden="true" />
      {action}
    </div>
  );
}

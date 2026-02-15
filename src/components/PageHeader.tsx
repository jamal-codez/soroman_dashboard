import type { ReactNode } from "react";

export function PageHeader({
  title,
  description,
  actions
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <h1 className="text-[22px] sm:text-2xl font-bold tracking-[-0.01em] leading-[1.1] text-slate-950 truncate">
          {title}
        </h1>
        {description ? (
          <p className="mt-1 text-sm tracking-tight text-slate-600 line-clamp-2">
            {description}
          </p>
        ) : null}
      </div>

      {actions ? (
        <div className="w-full sm:w-auto">
          <div className="flex flex-col sm:flex-row sm:justify-end gap-2 w-full sm:w-auto">
            {actions}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default PageHeader;

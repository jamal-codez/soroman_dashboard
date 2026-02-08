import type { ReactNode } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export type SummaryCard = {
  title: string;
  value: string;
  description?: string;
  icon: ReactNode;
  tone?: "neutral" | "green" | "amber" | "red";
};

const toneStyles: Record<NonNullable<SummaryCard["tone"]>, { wrap: string; icon: string; ring: string }> = {
  neutral: { wrap: "bg-slate-100", icon: "text-slate-900", ring: "ring-slate-200" },
  green: { wrap: "bg-emerald-50", icon: "text-emerald-700", ring: "ring-emerald-100" },
  amber: { wrap: "bg-amber-50", icon: "text-amber-700", ring: "ring-amber-100" },
  red: { wrap: "bg-red-50", icon: "text-red-700", ring: "ring-red-100" }
};

export function SummaryCards({ cards }: { cards: SummaryCard[] }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
      {cards.map((c, idx) => {
        const t = toneStyles[c.tone || "neutral"];
        return (
          <Card key={`${c.title}-${idx}`} className="shadow-sm">
            <CardContent className="p-4">
              <div className="flex flex-col gap-2">
                <div
                  className={`h-10 w-10 rounded-2xl ${t.wrap} ring-1 ${t.ring} flex items-center justify-center`}
                >
                  <span className={t.icon}>{c.icon}</span>
                </div>

                <div className="mt-5 text-xs uppercase tracking-[0.05em] text-slate-700 font-medium">
                  {c.title}
                </div>

                <div className="text-[28px] sm:text-[28px] font-bold text-slate-950 tracking-[-0.02em] leading-[1.05] truncate">
                  {c.value}
                </div>

                {c.description ? (
                  <div className="text-[0.95rem] text-slate-600 leading-[1.4]">
                    {c.description}
                  </div>
                ) : null}
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

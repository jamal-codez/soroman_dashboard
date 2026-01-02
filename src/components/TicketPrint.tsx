import { forwardRef } from "react";

export type ReleaseTicketData = {
  orderReference: string;
  customerName: string;
  companyName: string;
  customerPhone: string;
  product: string;
  qty: string;
  truckNumber: string;
  driverName: string;
  driverPhone: string;
  loadingDateTime: string;
};

export const TicketPrint = forwardRef<HTMLDivElement, { data: ReleaseTicketData }>(
  ({ data }, ref) => {
    return (
      <div ref={ref} className="bg-white text-slate-900 p-8">
        <div className="flex items-start justify-between gap-8">
          <div className="flex items-center gap-3">
            <img src="/logo.png" alt="Soroman" className="h-10 w-10" />
            <div>
              <div className="text-lg font-bold">Soroman</div>
              <div className="text-xs font-bold">Release Ticket</div>
            </div>
          </div>
          <div className="text-right">
            <div className="text-xs text-slate-500">Order Reference</div>
            <div className="text-base font-semibold">{data.orderReference}</div>
          </div>
        </div>

        <div className="mt-6 rounded-lg border border-slate-200 overflow-hidden">
          <div className="grid grid-cols-1 sm:grid-cols-2">
            <TicketRow label="Customer Name" value={data.customerName} />
            <TicketRow label="Company Name" value={data.companyName} />
            <TicketRow label="Customer Phone" value={data.customerPhone} />
            <TicketRow label="Product" value={data.product} />
            <TicketRow label="Quantity" value={data.qty} />
            <TicketRow label="Truck Number" value={data.truckNumber} />
            <TicketRow label="Driver's Name" value={data.driverName} />
            <TicketRow label="Driver's Phone" value={data.driverPhone} />
            <TicketRow label="Loading Date & Time" value={data.loadingDateTime} />
          </div>
        </div>

        <div className="mt-6 text-xs text-slate-500 flex items-center justify-between">
          <div>© 2025 All rights reserved.</div>
          <div>Thank you for your patronage!</div>
        </div>
      </div>
    );
  }
);
TicketPrint.displayName = "TicketPrint";

function TicketRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="p-4 border-t border-slate-200 first:border-t-0 sm:border-t-0 sm:[&:nth-child(n+3)]:border-t sm:border-r sm:[&:nth-child(2n)]:border-r-0">
      <div className="text-xs uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-1 text-sm font-semibold text-slate-900 whitespace-pre-wrap">{value || "-"}</div>
    </div>
  );
}

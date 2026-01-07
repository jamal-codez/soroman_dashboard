import { forwardRef } from "react";

export type ReleaseTicketData = {
  orderReference: string;
  customerName: string;
  companyName: string;
  customerPhone: string;
  product: string;
  qty: string;
  unitPrice: string;
  truckNumber: string;
  driverName: string;
  driverPhone: string;
  deliveryAddress: string;
  compartmentDetails: string;
  loaderName: string;
  loaderPhone: string;
  loadingDateTime: string;
};

export const TicketPrint = forwardRef<HTMLDivElement, { data: ReleaseTicketData }>(
  ({ data }, ref) => {
    const compartmentLines = String(data.compartmentDetails || '')
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);

    const parsedCompartments = compartmentLines
      .map((line) => {
        // Expected format: "Compartment N: Qty X L, Ullage Y"
        const m = line.match(/^Compartment\s+(\d+)\s*:\s*Qty\s*(.+?)\s*L,\s*Ullage\s*(.+)$/i);
        if (!m) return null;
        return { n: m[1], qty: m[2], ullage: m[3] };
      })
      .filter(Boolean) as Array<{ n: string; qty: string; ullage: string }>;

    const compartments = Array.from({ length: 5 }, (_, i) => {
      const n = String(i + 1);
      const found = parsedCompartments.find((c) => c.n === n);
      return { n, qty: found?.qty || '', ullage: found?.ullage || '' };
    });

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
            <TicketRow label="Unit Price" value={data.unitPrice} />
            <TicketRow label="Truck Number" value={data.truckNumber} />
            <TicketRow label="Driver's Name" value={data.driverName} />
            <TicketRow label="Driver's Phone" value={data.driverPhone} />
            <div className="p-4 border-t border-slate-200 first:border-t-0 sm:border-t-0 sm:[&:nth-child(n+3)]:border-t sm:border-r sm:[&:nth-child(2n)]:border-r-0 sm:col-span-2">
              <div className="text-xs uppercase tracking-wide text-slate-500">Delivery Address</div>
              <div className="mt-1 text-sm font-semibold text-slate-900 whitespace-pre-wrap">{data.deliveryAddress || ""}</div>
            </div>
            <div className="p-4 border-t border-slate-200 first:border-t-0 sm:border-t-0 sm:[&:nth-child(n+3)]:border-t sm:border-r sm:[&:nth-child(2n)]:border-r-0 sm:col-span-2">
              <div className="text-xs uppercase tracking-wide text-slate-500">Compartment Details</div>
              <div className="mt-2 overflow-hidden rounded-md border border-slate-200">
                <div className="grid grid-cols-3 bg-slate-50 text-[11px] uppercase font-semibold text-slate-600">
                  <div className="px-2 py-1">S/N</div>
                  <div className="px-2 py-1">Quantity (L)</div>
                  <div className="px-2 py-1">Ullage</div>
                </div>
                {compartments.map((c) => (
                  <div key={c.n} className="grid grid-cols-3 text-sm">
                    <div className="px-2 py-1 border-t border-slate-200">{c.n}</div>
                    <div className="px-2 py-1 border-t border-slate-200">{c.qty}</div>
                    <div className="px-2 py-1 border-t border-slate-200">{c.ullage}</div>
                  </div>
                ))}
              </div>
            </div>
            {/* <TicketRow label="Loader's Name" value={data.loaderName} />
            <TicketRow label="Loader's Phone" value={data.loaderPhone} /> */}
            <div className="p-4 border-t border-slate-200 first:border-t-0 sm:border-t-0 sm:[&:nth-child(n+3)]:border-t sm:border-r sm:[&:nth-child(2n)]:border-r-0 sm:col-span-2">
              <div className="text-xs uppercase tracking-wide text-slate-500">Loading Date &amp; Time: <span className="text-xs font-semibold text-slate-900">{data.loadingDateTime || ""}</span></div>
              {/* <div className="mt-1 text-sm font-semibold text-slate-900 whitespace-pre-wrap">
                {data.loadingDateTime || ""}
              </div> */}
            </div>
          </div>
        </div>

        <div className="mt-8 space-y-3 text-sm">
          <SignatureLine label="Loader's Name" />
          <SignatureLine label="Loader's Phone No." />
          <SignatureLine label="Finance Clearance" />
          <SignatureLine label="Commercial Manager" />
          <SignatureLine label="Depot Manager" />
          <SignatureLine label="Security" />
        </div>

        <div className="mt-6 text-xs text-slate-500 flex items-center justify-between">
          <div>© 2026 All rights reserved.</div>
          <div>Thank you for your patronage!</div>
        </div>
      </div>
    );
  }
);
TicketPrint.displayName = "TicketPrint";

function SignatureLine({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2">
      <div className="font-semibold">{label}:</div>
      <div className="flex-1 border-b border-slate-500 h-5" />
    </div>
  );
}

function TicketRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="p-4 border-t border-slate-200 first:border-t-0 sm:border-t-0 sm:[&:nth-child(n+3)]:border-t sm:border-r sm:[&:nth-child(2n)]:border-r-0">
      <div className="text-xs uppercase text-slate-500">{label}</div>
      <div className="mt-1 text-sm font-semibold text-slate-900 whitespace-pre-wrap">{value || ""}</div>
    </div>
  );
}

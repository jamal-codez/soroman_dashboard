import { forwardRef } from "react";

export type ReleaseTicketData = {
  orderReference: string;
  location: string;
  customerName: string;
  companyName: string;
  customerPhone: string;
  nmdrpaNumber: string;
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
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <img src="/logo.png" alt="Soroman" className="h-8 w-8" />
            <div>
              <div className="text-lg font-bold">Soroman Nigeria Limited</div>
              <div className="text-sm">Release Ticket for {data.location || ""}</div>
            </div>
          </div>
          <div className="text-right">
            <div className="text-xs text-slate-500">Order Reference</div>
            <div className="text-sm font-semibold">{data.orderReference}</div>
          </div>
        </div>

        <div className="mt-6 border border-slate-300 overflow-hidden">
          <div className="grid grid-cols-1 sm:grid-cols-2">
            <TicketRow label="Customer Name" value={data.customerName} />
            <TicketRow label="Company Name" value={data.companyName} />
            <TicketRow label="Customer Phone" value={data.customerPhone} />
            <TicketRow label="NMDPRA Number" value={data.nmdrpaNumber} />
            <TicketRow label="Product" value={data.product} />
            <TicketRow label="Quantity" value={data.qty} />
            <TicketRow label="Unit Price" value={`₦${data.unitPrice}`} />
            <TicketRow label="Truck Number" value={data.truckNumber} />
            <TicketRow label="Driver's Name" value={data.driverName} />
            <TicketRow label="Driver's Phone" value={data.driverPhone} />
            <div className="p-3 border-t border-slate-300 first:border-t-0 sm:border-t-0 sm:[&:nth-child(n+3)]:border-t sm:border-r sm:[&:nth-child(2n)]:border-r-0 sm:col-span-2">
              <div className="text-xs uppercase tracking-wide text-slate-500">Delivery Address</div>
              <div className="mt-1 text-sm font-semibold text-slate-900 whitespace-pre-wrap">{data.deliveryAddress || ""}</div>
            </div>
            <div className="p-3 border-t border-slate-300 first:border-t-0 sm:border-t-0 sm:[&:nth-child(n+3)]:border-t sm:border-r sm:[&:nth-child(2n)]:border-r-0 sm:col-span-2">
              <div className="text-xs uppercase tracking-wide text-slate-500">Compartment Details</div>
              <div className="mt-2 overflow-hidden border border-slate-300">
                <div className="grid grid-cols-3 bg-slate-50 text-[11px] uppercase font-semibold text-slate-600">
                  <div className="px-2 py-1">S/N</div>
                  <div className="px-2 py-1">Quantity</div>
                  <div className="px-2 py-1">Ullage</div>
                </div>
                {compartments.map((c) => (
                  <div key={c.n} className="grid grid-cols-3 text-sm">
                    <div className="px-2 py-1 border-t border-slate-300">{c.n}</div>
                    <div className="px-2 py-1 border-t border-slate-300">{c.qty}</div>
                    <div className="px-2 py-1 border-t border-slate-300">{c.ullage}</div>
                  </div>
                ))}
              </div>
            </div>
            <div className="p-3 border-t border-slate-200 first:border-t-0 sm:border-t-0 sm:[&:nth-child(n+3)]:border-t sm:border-r sm:[&:nth-child(2n)]:border-r-0 sm:col-span-2">
              <div className="text-xs uppercase tracking-wide text-slate-500">Loading Date &amp; Time: <span className="text-xs font-semibold text-slate-900">{data.loadingDateTime || ""}</span></div>
            </div>
          </div>
        </div>

        <div className="mt-6 space-y-3 text-sm">
          <SignatureLine label="Loader's Name" />
          <SignatureLine label="Loader's Phone No." />
          <SignatureLine label="Finance Clearance" />
          <SignatureLine label="Commercial Manager" />
          <SignatureLine label="Depot Manager" />
          <SignatureLine label="Dispatch Officer" />
          <SignatureLine label="Security" />
        </div>

        <div className="mt-12 bg-green-900 p-3 text-sm flex items-center justify-center text-white text-center">
          <div>Contact: 07060659524, 08035370741, 08037367917</div>
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
    <div className="p-3 border-t border-slate-300 first:border-t-0 sm:border-t-0 sm:[&:nth-child(n+3)]:border-t sm:border-r sm:[&:nth-child(2n)]:border-r-0">
      <div className="text-xs uppercase text-slate-500">{label}</div>
      <div className="mt-1 text-sm font-semibold text-slate-900 whitespace-pre-wrap">{value || ""}</div>
    </div>
  );
}

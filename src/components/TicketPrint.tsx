import { forwardRef } from "react";
import { Globe, Phone } from "lucide-react";

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
            <img src="/logo.png" alt="Soroman" className="h-12 w-12" />
            <div>
              <div className="text-lg font-bold">Soroman Nigeria Limited</div>
              <div className="text-sm">Release Ticket for <span className="font-semibold text-green-700">{data.location || ""}</span></div>
            </div>
          </div>
          <div className="text-right">
            <div className="text-xs text-slate-500">Order Reference</div>
            <div className="text-sm font-semibold">{data.orderReference}</div>
          </div>
        </div>

        <div className="mt-6 border border-slate-300 overflow-hidden">
          <div className="grid grid-cols-1 sm:grid-cols-2">
            <TicketRow label="Customer's Name" value={data.customerName} />
            <TicketRow label="Company's Name" value={data.companyName} />
            <TicketRow label="Customer's Phone" value={data.customerPhone} />
            <TicketRow label="NMDPRA Number" value={data.nmdrpaNumber} />
            <TicketRow label="Product" value={`${data.product} x ${data.qty}`} />
            {/* <TicketRow label="Quantity" value={data.qty} /> */}
            {/* <TicketRow label="Unit Price" value={`₦${data.unitPrice}`} /> */}
            <TicketRow label="Truck Number" value={data.truckNumber} />
            <TicketRow label="Driver's Name" value={data.driverName || " "} />
            <TicketRow label="Driver's Phone" value={data.driverPhone || " "} />
            <div className="p-3 border-t border-slate-300 first:border-t-0 sm:border-t-0 sm:[&:nth-child(n+3)]:border-t sm:border-r sm:[&:nth-child(2n)]:border-r-0 sm:col-span-2">
              <div className="text-xs uppercase tracking-wide text-slate-500">Delivery Address</div>
              <div className="mt-1 text-sm font-semibold text-slate-900 whitespace-pre-wrap">{data.deliveryAddress || " "}</div>
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

        <div className="mt-6 space-y-5 text-sm">
          <SignatureLine label="Loader's Name & Phone No." />
          <SignatureLine label="Finance Clearance" placeholders />
          <SignatureLine label="Commercial Manager" placeholders />
          <SignatureLine label="Depot Manager" placeholders />
          <SignatureLine label="Dispatch Officer" placeholders />
          <SignatureLine label="Security" placeholders />
        </div>

        <div className="mt-12 bg-green-900 p-3 text-sm flex flex-col items-center justify-center text-white text-center gap-2">
          <div className="flex items-center gap-2 justify-center">
            <Globe className="w-4 h-4 mr-1" />
            <span className="font-semibold">ordersoroman.com</span>
          </div>
          <div className="flex items-center gap-2 justify-center">
            <Phone className="w-4 h-4 mr-1" />
            <span>07060659524, 08035370741, 08021215027, 08023982277, 08036360577, 08036711324</span>
          </div>
        </div>

      </div>
    );
  }
);
TicketPrint.displayName = "TicketPrint";

function SignatureLine({
  label,
  placeholders,
}: {
  label: string;
  placeholders?: boolean;
}) {
  return (
    <div className="flex items-center gap-2">
      <div className="font-semibold">{label}:</div>
      <div className="flex-1 relative h-5">
        <div className="absolute inset-x-0 bottom-0 border-b border-slate-500" />
        {placeholders ? (
          <div className="absolute inset-0 flex items-center justify-center text-[11px] text-slate-200">          
            <span className="px-1">Full Name & Signature</span>
          </div>
        ) : null}
      </div>
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

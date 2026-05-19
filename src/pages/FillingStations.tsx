import { useMemo, useState, useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { SidebarNav } from '@/components/SidebarNav';
import { TopBar } from '@/components/TopBar';
import { MobileNav } from '@/components/MobileNav';
import { PageHeader } from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Download, Fuel, Loader2, Plus, Search } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import * as XLSX from 'xlsx';
import { apiClient } from '@/api/client';
import { useToast } from '@/hooks/use-toast';
import { isCurrentUserReadOnly } from '@/roles';

interface DeliveryCustomer {
  id: number;
  customer_name: string;
  phone_number?: string;
  status: string;
  customer_type?: string;
  notes?: string;
}

interface DeliverySale {
  id: number;
  truck_number: string;
  date_loaded: string;
  depot_loaded?: string;
  customer: number;
  location: string;
  quantity: string | number;
  rate: string | number;
  sales_value: string | number;
  payment_amount: string | number;
  payer_name: string;
  bank: string;
  date_of_payment: string | null;
  phone_number: string;
  remarks: string;
}

type PagedResponse<T> = { count: number; results: T[] };

interface AddPaymentForm {
  customer: string;
  truck_number: string;
  date_loaded: string;
  depot_loaded: string;
  location: string;
  quantity: string;
  rate: string;
  sales_value: string;
  payment_amount: string;
  payer_name: string;
  bank: string;
  date_of_payment: string;
  phone_number: string;
  remarks: string;
  trip_code: string;
}

const LEGACY_FS_PREFIX = '__type:filling_station__';
const BANK_ACCOUNTS = [
  { id: 1, label: 'Soroman Energy Ltd - Zenith Bank (1311924986)' },
  { id: 2, label: 'Cash' },
];

const isFillingStation = (c: DeliveryCustomer): boolean =>
  c.customer_type === 'filling_station' ||
  (c.customer_type == null && !!c.notes?.startsWith(LEGACY_FS_PREFIX));

const safePaged = <T,>(raw: unknown): PagedResponse<T> => {
  if (raw && typeof raw === 'object') {
    const r = raw as Record<string, unknown>;
    if (Array.isArray(r.results)) {
      return { count: Number(r.count ?? r.results.length), results: r.results as T[] };
    }
    if (Array.isArray(raw)) {
      return { count: (raw as T[]).length, results: raw as T[] };
    }
  }
  return { count: 0, results: [] };
};

const toNum = (v: string | number | undefined | null): number => {
  if (v === undefined || v === null || v === '') return 0;
  const n = Number(String(v).replace(/,/g, ''));
  return Number.isFinite(n) ? n : 0;
};

const money = (n: number): string =>
  `N${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const fmtDate = (v: string | null | undefined): string => {
  if (!v) return '-';
  try {
    return format(parseISO(v), 'dd MMM yyyy');
  } catch {
    return v;
  }
};

const emptyForm = (): AddPaymentForm => ({
  customer: '',
  truck_number: '',
  date_loaded: format(new Date(), 'yyyy-MM-dd'),
  depot_loaded: '',
  location: '',
  quantity: '',
  rate: '',
  sales_value: '',
  payment_amount: '',
  payer_name: '',
  bank: '',
  date_of_payment: format(new Date(), 'yyyy-MM-dd'),
  phone_number: '',
  remarks: '',
  trip_code: '',
});

export default function FillingStations() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const readOnly = isCurrentUserReadOnly();

  const [search, setSearch] = useState('');
  const [tripCodeFilter, setTripCodeFilter] = useState('all');
  const [stationFilter, setStationFilter] = useState('all');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<AddPaymentForm>(emptyForm());
  const [saving, setSaving] = useState(false);

  const [tripCodes, setTripCodes] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem('dsl_trip_codes') || '[]');
    } catch {
      return [];
    }
  });
  const [saleTripMap, setSaleTripMap] = useState<Record<number, string>>(() => {
    try {
      return JSON.parse(localStorage.getItem('dsl_sale_trip_map') || '{}');
    } catch {
      return {};
    }
  });
  const [newTripCodeInput, setNewTripCodeInput] = useState('');

  useEffect(() => {
    localStorage.setItem('dsl_trip_codes', JSON.stringify(tripCodes));
  }, [tripCodes]);

  useEffect(() => {
    localStorage.setItem('dsl_sale_trip_map', JSON.stringify(saleTripMap));
  }, [saleTripMap]);

  const customersQuery = useQuery({
    queryKey: ['delivery-customers-list'],
    queryFn: async () =>
      safePaged<DeliveryCustomer>(
        await apiClient.admin.getDeliveryCustomers({ page_size: 5000 }),
      ),
    staleTime: 60_000,
  });

  const salesQuery = useQuery({
    queryKey: ['delivery-sales'],
    queryFn: async () =>
      safePaged<DeliverySale>(
        await apiClient.admin.getDeliverySales({ page_size: 5000 }),
      ),
    staleTime: 30_000,
  });

  const allCustomers = useMemo(() => customersQuery.data?.results || [], [customersQuery.data]);
  const fillingStations = useMemo(
    () => allCustomers.filter(isFillingStation).sort((a, b) => a.customer_name.localeCompare(b.customer_name)),
    [allCustomers],
  );

  const fillingStationIds = useMemo(() => new Set(fillingStations.map(c => c.id)), [fillingStations]);

  const customerMap = useMemo(() => {
    const map = new Map<number, DeliveryCustomer>();
    fillingStations.forEach(c => map.set(c.id, c));
    return map;
  }, [fillingStations]);

  const fillingStationSales = useMemo(() => {
    const rows = (salesQuery.data?.results || []).filter(s => fillingStationIds.has(s.customer));
    return rows.sort((a, b) => {
      const ad = a.date_of_payment || a.date_loaded || '';
      const bd = b.date_of_payment || b.date_loaded || '';
      return bd.localeCompare(ad);
    });
  }, [salesQuery.data, fillingStationIds]);

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return fillingStationSales.filter(row => {
      const code = saleTripMap[row.id] || '';
      if (tripCodeFilter !== 'all' && code !== tripCodeFilter) return false;
      if (stationFilter !== 'all' && String(row.customer) !== stationFilter) return false;
      if (!q) return true;
      const station = customerMap.get(row.customer)?.customer_name || '';
      return (
        station.toLowerCase().includes(q) ||
        (row.truck_number || '').toLowerCase().includes(q) ||
        (row.location || '').toLowerCase().includes(q) ||
        (row.payer_name || '').toLowerCase().includes(q) ||
        (row.bank || '').toLowerCase().includes(q) ||
        (row.remarks || '').toLowerCase().includes(q) ||
        code.toLowerCase().includes(q)
      );
    });
  }, [fillingStationSales, customerMap, search, tripCodeFilter, stationFilter, saleTripMap]);

  const totals = useMemo(() => {
    let totalPaid = 0;
    let totalValue = 0;
    filteredRows.forEach(r => {
      totalPaid += toNum(r.payment_amount);
      totalValue += toNum(r.sales_value);
    });
    return {
      rows: filteredRows.length,
      stations: new Set(filteredRows.map(r => r.customer)).size,
      totalPaid,
      totalValue,
      balance: totalValue - totalPaid,
    };
  }, [filteredRows]);

  const addTripCode = () => {
    const code = newTripCodeInput.trim().toUpperCase().replace(/\s+/g, '-');
    if (!code) {
      toast({ title: 'Enter a trip code first', variant: 'destructive' });
      return;
    }
    if (tripCodes.includes(code)) {
      toast({ title: `Trip code ${code} already exists`, variant: 'destructive' });
      return;
    }
    setTripCodes(prev => [...prev, code].sort());
    setNewTripCodeInput('');
    toast({ title: `Trip code ${code} created` });
  };

  const deleteTripCode = (code: string) => {
    setTripCodes(prev => prev.filter(c => c !== code));
    setSaleTripMap(prev => {
      const next = { ...prev };
      Object.keys(next).forEach(k => {
        const id = Number(k);
        if (next[id] === code) delete next[id];
      });
      return next;
    });
    if (tripCodeFilter === code) setTripCodeFilter('all');
    toast({ title: `Trip code ${code} removed` });
  };

  const setEntryTripCode = (saleId: number, code: string) => {
    if (code === '__none__') {
      setSaleTripMap(prev => {
        const next = { ...prev };
        delete next[saleId];
        return next;
      });
      return;
    }
    setSaleTripMap(prev => ({ ...prev, [saleId]: code }));
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      const customerId = Number(form.customer);
      if (!customerId) throw new Error('Filling station is required');
      return apiClient.admin.createDeliverySale({
        customer: customerId,
        truck_number: form.truck_number.trim(),
        date_loaded: form.date_loaded,
        depot_loaded: form.depot_loaded.trim() || undefined,
        location: form.location.trim() || undefined,
        quantity: form.quantity ? toNum(form.quantity) : undefined,
        rate: form.rate ? toNum(form.rate) : undefined,
        sales_value: form.sales_value ? toNum(form.sales_value) : undefined,
        payment_amount: form.payment_amount ? toNum(form.payment_amount) : undefined,
        payer_name: form.payer_name.trim() || undefined,
        bank: form.bank.trim() || undefined,
        date_of_payment: form.date_of_payment || undefined,
        phone_number: form.phone_number.trim() || undefined,
        remarks: form.remarks.trim() || undefined,
      });
    },
    onSuccess: (created: unknown) => {
      const maybe = created as { id?: number };
      if (form.trip_code && maybe?.id) {
        setSaleTripMap(prev => ({ ...prev, [maybe.id as number]: form.trip_code }));
      }
      toast({ title: 'Payment entry saved' });
      qc.invalidateQueries({ queryKey: ['delivery-sales'] });
      setDialogOpen(false);
      setForm(emptyForm());
    },
    onError: (err: Error) => {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    },
  });

  const handleSave = async () => {
    if (!form.customer) {
      toast({ title: 'Select a filling station', variant: 'destructive' });
      return;
    }
    if (!form.truck_number.trim()) {
      toast({ title: 'Truck number is required', variant: 'destructive' });
      return;
    }
    if (!form.payment_amount.trim()) {
      toast({ title: 'Payment amount is required', variant: 'destructive' });
      return;
    }

    setSaving(true);
    try {
      await saveMutation.mutateAsync();
    } finally {
      setSaving(false);
    }
  };

  const exportTable = () => {
    const headers = [
      'Date Paid',
      'Date Loaded',
      'Trip Code',
      'Station',
      'Truck',
      'Depot',
      'Location',
      'Quantity (L)',
      'Rate (N/L)',
      'Sales Value (N)',
      'Payment (N)',
      'Payer',
      'Bank',
      'Phone',
      'Remarks',
    ];

    const rows = filteredRows.map(r => [
      r.date_of_payment || '',
      r.date_loaded || '',
      saleTripMap[r.id] || '',
      customerMap.get(r.customer)?.customer_name || '',
      r.truck_number || '',
      r.depot_loaded || '',
      r.location || '',
      toNum(r.quantity),
      toNum(r.rate),
      toNum(r.sales_value),
      toNum(r.payment_amount),
      r.payer_name || '',
      r.bank || '',
      r.phone_number || '',
      r.remarks || '',
    ]);

    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
    ws['!cols'] = headers.map((h, i) => ({
      wch: Math.max(h.length, ...rows.map(r => String(r[i] ?? '').length), 10) + 2,
    }));

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Filling Station Payments');
    XLSX.writeFile(wb, `filling_station_payments_${format(new Date(), 'yyyy-MM-dd')}.xlsx`);
  };

  const isLoading = customersQuery.isLoading || salesQuery.isLoading;

  return (
    <div className="flex h-screen bg-slate-100">
      <SidebarNav />
      <div className="flex-1 flex flex-col overflow-hidden">
        <MobileNav />
        <TopBar />

        <div className="flex-1 overflow-auto p-6">
          <div className="max-w-7xl mx-auto space-y-4">
            <PageHeader
              title="Filling Stations Payments Ledger"
              description="Simple table for entering and tracking filling station payment records."
            />

            <div className="bg-white rounded-lg border border-slate-200 p-4">
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3 text-sm">
                <div>
                  <p className="text-slate-500 text-xs">Rows</p>
                  <p className="font-semibold text-slate-900">{totals.rows}</p>
                </div>
                <div>
                  <p className="text-slate-500 text-xs">Stations</p>
                  <p className="font-semibold text-slate-900">{totals.stations}</p>
                </div>
                <div>
                  <p className="text-slate-500 text-xs">Total Payment</p>
                  <p className="font-semibold text-emerald-700">{money(totals.totalPaid)}</p>
                </div>
                <div>
                  <p className="text-slate-500 text-xs">Sales Value</p>
                  <p className="font-semibold text-slate-900">{money(totals.totalValue)}</p>
                </div>
                <div>
                  <p className="text-slate-500 text-xs">Balance</p>
                  <p className={`font-semibold ${totals.balance > 0 ? 'text-amber-700' : 'text-slate-500'}`}>
                    {money(totals.balance)}
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-lg border border-slate-200 p-4 space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative flex-1 min-w-[220px]">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                  <Input
                    className="pl-9"
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    placeholder="Search station, truck, payer, bank, trip code..."
                  />
                </div>

                <select
                  aria-label="Filling station filter"
                  className="h-10 px-3 rounded-md border border-slate-200 bg-white text-sm"
                  value={stationFilter}
                  onChange={e => setStationFilter(e.target.value)}
                >
                  <option value="all">All Stations</option>
                  {fillingStations.map(station => (
                    <option key={station.id} value={String(station.id)}>{station.customer_name}</option>
                  ))}
                </select>

                <select
                  aria-label="Trip code filter"
                  className="h-10 px-3 rounded-md border border-slate-200 bg-white text-sm"
                  value={tripCodeFilter}
                  onChange={e => setTripCodeFilter(e.target.value)}
                >
                  <option value="all">All Trip Codes</option>
                  {tripCodes.map(code => (
                    <option key={code} value={code}>{code}</option>
                  ))}
                </select>

                <Button variant="outline" className="gap-1.5" onClick={exportTable} disabled={filteredRows.length === 0}>
                  <Download size={14} /> Export
                </Button>

                {!readOnly && (
                  <Button className="gap-1.5" onClick={() => setDialogOpen(true)}>
                    <Plus size={14} /> Add Payment
                  </Button>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-slate-100">
                <Input
                  placeholder="New trip code"
                  value={newTripCodeInput}
                  onChange={e => setNewTripCodeInput(e.target.value)}
                  className="w-[180px] h-9"
                />
                <Button type="button" variant="outline" className="h-9" onClick={addTripCode}>
                  Add Trip Code
                </Button>
                {tripCodes.map(code => (
                  <button
                    key={code}
                    type="button"
                    onClick={() => deleteTripCode(code)}
                    className="h-8 px-2 rounded border border-slate-200 text-xs text-slate-600 hover:bg-slate-50"
                    title="Click to remove"
                  >
                    {code}
                  </button>
                ))}
              </div>
            </div>

            <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-slate-50">
                      <TableHead className="w-[60px]">S/N</TableHead>
                      <TableHead className="min-w-[105px]">Date</TableHead>
                      <TableHead className="min-w-[220px]">Station</TableHead>
                      <TableHead className="min-w-[130px]">Trip Code</TableHead>
                      <TableHead className="min-w-[105px]">Truck</TableHead>
                      <TableHead className="min-w-[90px] text-right">Volume</TableHead>
                      <TableHead className="min-w-[90px] text-right">Rate</TableHead>
                      <TableHead className="min-w-[110px] text-right">Sales Value</TableHead>
                      <TableHead className="min-w-[90px] text-right">Deposits</TableHead>
                      <TableHead className="min-w-[130px]">Name of Depositor</TableHead>
                      <TableHead className="min-w-[180px]">Bank</TableHead>
                      <TableHead className="min-w-[105px]">Date Paid</TableHead>
                      <TableHead className="min-w-[100px]">Status</TableHead>
                      <TableHead className="min-w-[220px]">Remarks</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {isLoading && (
                      Array.from({ length: 6 }).map((_, i) => (
                        <TableRow key={i}>
                          <TableCell colSpan={14}>
                            <Skeleton className="h-8 w-full" />
                          </TableCell>
                        </TableRow>
                      ))
                    )}

                    {!isLoading && filteredRows.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={14} className="text-center text-slate-500 py-10">
                          No payment entries yet.
                        </TableCell>
                      </TableRow>
                    )}

                    {!isLoading && filteredRows.map((row, index) => {
                      const station = customerMap.get(row.customer);
                      const status = toNum(row.payment_amount) > 0 ? 'CONFIRMED' : 'PENDING';
                      return (
                        <TableRow key={row.id} className="hover:bg-slate-50/70">
                          <TableCell>{index + 1}</TableCell>
                          <TableCell className="whitespace-nowrap">{fmtDate(row.date_loaded)}</TableCell>
                          <TableCell className="font-medium text-slate-900">{station?.customer_name || '-'}</TableCell>
                          <TableCell>
                            <select
                              aria-label={`Trip code for row ${row.id}`}
                              className="h-8 px-2 rounded border border-slate-200 bg-white text-xs"
                              value={saleTripMap[row.id] || '__none__'}
                              onChange={e => setEntryTripCode(row.id, e.target.value)}
                              disabled={readOnly}
                            >
                              <option value="__none__">-</option>
                              {tripCodes.map(code => (
                                <option key={code} value={code}>{code}</option>
                              ))}
                            </select>
                          </TableCell>
                          <TableCell className="uppercase">{row.truck_number || '-'}</TableCell>
                          <TableCell className="text-right">{toNum(row.quantity) ? toNum(row.quantity).toLocaleString() : '-'}</TableCell>
                          <TableCell className="text-right">{toNum(row.rate) ? toNum(row.rate).toLocaleString() : '-'}</TableCell>
                          <TableCell className="text-right">{toNum(row.sales_value) ? money(toNum(row.sales_value)) : '-'}</TableCell>
                          <TableCell className="text-right font-semibold text-emerald-700">{money(toNum(row.payment_amount))}</TableCell>
                          <TableCell>{row.payer_name || '-'}</TableCell>
                          <TableCell className="text-xs">{row.bank || '-'}</TableCell>
                          <TableCell className="whitespace-nowrap">{fmtDate(row.date_of_payment)}</TableCell>
                          <TableCell>
                            <span className={`text-xs font-semibold px-2 py-1 rounded-full ${status === 'CONFIRMED' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                              {status}
                            </span>
                          </TableCell>
                          <TableCell className="text-xs">{row.remarks || '-'}</TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </div>
          </div>
        </div>
      </div>

      <Dialog
        open={dialogOpen}
        onOpenChange={open => {
          setDialogOpen(open);
          if (!open) setForm(emptyForm());
        }}
      >
        <DialogContent className="sm:max-w-[720px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Add Filling Station Payment</DialogTitle>
            <DialogDescription>
              Enter a new payment as it comes in. This creates one ledger row.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-1">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Filling Station *</Label>
                <select
                  aria-label="Filling Station"
                  className="w-full h-10 px-3 rounded-md border border-slate-200 bg-white text-sm"
                  value={form.customer}
                  onChange={e => setForm(prev => ({ ...prev, customer: e.target.value }))}
                >
                  <option value="">Select station...</option>
                  {fillingStations.map(s => (
                    <option key={s.id} value={String(s.id)}>{s.customer_name}</option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <Label>Trip Code</Label>
                <select
                  aria-label="Trip Code"
                  className="w-full h-10 px-3 rounded-md border border-slate-200 bg-white text-sm"
                  value={form.trip_code}
                  onChange={e => setForm(prev => ({ ...prev, trip_code: e.target.value }))}
                >
                  <option value="">Select trip code...</option>
                  {tripCodes.map(code => (
                    <option key={code} value={code}>{code}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="space-y-1">
                <Label>Truck Number *</Label>
                <Input
                  value={form.truck_number}
                  onChange={e => setForm(prev => ({ ...prev, truck_number: e.target.value }))}
                  placeholder="e.g. KSF-302XA"
                />
              </div>
              <div className="space-y-1">
                <Label>Date Loaded</Label>
                <Input
                  type="date"
                  value={form.date_loaded}
                  onChange={e => setForm(prev => ({ ...prev, date_loaded: e.target.value }))}
                />
              </div>
              <div className="space-y-1">
                <Label>Date Paid</Label>
                <Input
                  type="date"
                  value={form.date_of_payment}
                  onChange={e => setForm(prev => ({ ...prev, date_of_payment: e.target.value }))}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Depot</Label>
                <Input
                  value={form.depot_loaded}
                  onChange={e => setForm(prev => ({ ...prev, depot_loaded: e.target.value }))}
                  placeholder="Optional"
                />
              </div>
              <div className="space-y-1">
                <Label>Location</Label>
                <Input
                  value={form.location}
                  onChange={e => setForm(prev => ({ ...prev, location: e.target.value }))}
                  placeholder="Optional"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
              <div className="space-y-1">
                <Label>Payment Amount (N) *</Label>
                <Input
                  value={form.payment_amount}
                  onChange={e => setForm(prev => ({ ...prev, payment_amount: e.target.value }))}
                  placeholder="0.00"
                />
              </div>
              <div className="space-y-1">
                <Label>Quantity (L)</Label>
                <Input
                  value={form.quantity}
                  onChange={e => setForm(prev => ({ ...prev, quantity: e.target.value }))}
                  placeholder="Optional"
                />
              </div>
              <div className="space-y-1">
                <Label>Rate (N/L)</Label>
                <Input
                  value={form.rate}
                  onChange={e => setForm(prev => ({ ...prev, rate: e.target.value }))}
                  placeholder="Optional"
                />
              </div>
              <div className="space-y-1">
                <Label>Sales Value (N)</Label>
                <Input
                  value={form.sales_value}
                  onChange={e => setForm(prev => ({ ...prev, sales_value: e.target.value }))}
                  placeholder="Optional"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="space-y-1">
                <Label>Payer Name</Label>
                <Input
                  value={form.payer_name}
                  onChange={e => setForm(prev => ({ ...prev, payer_name: e.target.value }))}
                  placeholder="Optional"
                />
              </div>
              <div className="space-y-1">
                <Label>Bank</Label>
                <select
                  aria-label="Bank"
                  className="w-full h-10 px-3 rounded-md border border-slate-200 bg-white text-sm"
                  value={form.bank}
                  onChange={e => setForm(prev => ({ ...prev, bank: e.target.value }))}
                >
                  <option value="">Select bank...</option>
                  {BANK_ACCOUNTS.map(b => (
                    <option key={b.id} value={b.label}>{b.label}</option>
                  ))}
                  <option value="Other">Other</option>
                </select>
              </div>
              <div className="space-y-1">
                <Label>Phone</Label>
                <Input
                  value={form.phone_number}
                  onChange={e => setForm(prev => ({ ...prev, phone_number: e.target.value }))}
                  placeholder="Optional"
                />
              </div>
            </div>

            <div className="space-y-1">
              <Label>Remarks</Label>
              <Input
                value={form.remarks}
                onChange={e => setForm(prev => ({ ...prev, remarks: e.target.value }))}
                placeholder="Optional"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving} className="gap-1.5">
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
              Save Payment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

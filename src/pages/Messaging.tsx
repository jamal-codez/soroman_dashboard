/**
 * Messaging — trigger point for the two backend messaging endpoints:
 * a WhatsApp price-template blast, and a customer thank-you message
 * (SMS or WhatsApp) sent to everyone who ordered on a given day.
 */
import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { format } from 'date-fns';
import { SidebarNav } from '@/components/SidebarNav';
import { TopBar } from '@/components/TopBar';
import { MobileNav } from '@/components/MobileNav';
import { PageHeader } from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { apiClient } from '@/api/client';
import { useToast } from '@/hooks/use-toast';
import {
  MessageCircle, Send, Loader2, CheckCircle2, XCircle, Users, AlertTriangle,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const todayStr = () => format(new Date(), 'yyyy-MM-dd');

function SectionCard({ title, description, icon, children }: {
  title: string;
  description: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5 space-y-4">
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-lg bg-emerald-50 text-emerald-600 shrink-0">{icon}</div>
        <div>
          <h2 className="text-sm font-bold text-slate-900">{title}</h2>
          <p className="text-xs text-slate-500">{description}</p>
        </div>
      </div>
      {children}
    </div>
  );
}

function DeliveryResult({ sent, failed, rows }: {
  sent: number;
  failed: number;
  rows: Array<{ label: string; sub?: string; success: boolean }>;
}) {
  return (
    <div className={cn(
      'rounded-lg border px-3 py-2.5 space-y-2',
      failed === 0 ? 'border-emerald-200 bg-emerald-50' : 'border-amber-200 bg-amber-50'
    )}>
      <p className="text-xs font-semibold text-slate-800">
        {sent} sent{failed > 0 ? `, ${failed} failed` : ''}
      </p>
      {rows.length > 0 && (
        <div className="max-h-48 overflow-y-auto space-y-1">
          {rows.map((r, i) => (
            <div key={i} className="flex items-center gap-2 text-xs">
              {r.success ? <CheckCircle2 size={13} className="text-emerald-600 shrink-0" /> : <XCircle size={13} className="text-red-500 shrink-0" />}
              <span className="text-slate-700">{r.label}</span>
              {r.sub && <span className="text-slate-400 truncate">{r.sub}</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function WhatsAppPriceTemplate() {
  const { toast } = useToast();
  const { data: templateInfo, isLoading } = useQuery({
    queryKey: ['whatsapp-template-info'],
    queryFn: () => apiClient.admin.getWhatsAppTemplateInfo(),
  });

  const [phonesText, setPhonesText] = useState('');
  const [values, setValues] = useState<Record<string, string>>({});

  const sendMutation = useMutation({
    mutationFn: () => {
      const phones = phonesText.split(/[\n,]+/).map((p) => p.trim()).filter(Boolean);
      return apiClient.admin.sendWhatsAppTemplate({ phones, data: values });
    },
    onSuccess: (res) => {
      toast({
        title: res.failed === 0 ? 'Price list sent' : 'Sent with some failures',
        description: `${res.sent} sent, ${res.failed} failed.`,
        variant: res.failed === 0 ? undefined : 'destructive',
      });
    },
    onError: (error: Error) => {
      toast({ title: 'Send failed', description: error.message, variant: 'destructive' });
    },
  });

  const handleSend = () => {
    const phones = phonesText.split(/[\n,]+/).map((p) => p.trim()).filter(Boolean);
    if (phones.length === 0) {
      toast({ title: 'Add at least one phone number', variant: 'destructive' });
      return;
    }
    sendMutation.mutate();
  };

  return (
    <SectionCard
      title="WhatsApp Price Template"
      description="Blast the configured price-list template to a list of numbers."
      icon={<MessageCircle size={18} />}
    >
      {isLoading ? (
        <p className="text-xs text-slate-400">Checking template configuration…</p>
      ) : !templateInfo?.ready ? (
        <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-800">
          <AlertTriangle size={14} className="shrink-0 mt-0.5" />
          <span>
            Template isn't configured yet — set <code className="font-mono">TERMII_PRICE_TEMPLATE_ID</code> (and a WhatsApp device ID) on the server.
          </span>
        </div>
      ) : (
        <>
          <div className="space-y-1.5">
            <label htmlFor="wa-phones" className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Phone Numbers</label>
            <Textarea
              id="wa-phones"
              rows={3}
              value={phonesText}
              onChange={(e) => setPhonesText(e.target.value)}
              placeholder="08108699059, 09020744493"
              className="text-sm"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {(templateInfo.variables ?? []).map((v) => (
              <div key={v.key} className="space-y-1">
                <label htmlFor={`wa-var-${v.key}`} className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">{v.label}</label>
                <input
                  id={`wa-var-${v.key}`}
                  value={values[v.key] ?? ''}
                  onChange={(e) => setValues((prev) => ({ ...prev, [v.key]: e.target.value }))}
                  placeholder="e.g. ₦900/L"
                  className="w-full h-9 rounded-md border border-slate-200 bg-slate-50 px-3 text-sm text-slate-700 outline-none focus:ring-2 focus:ring-slate-300"
                />
              </div>
            ))}
          </div>

          <div className="flex justify-end">
            <Button size="sm" className="gap-2" onClick={handleSend} disabled={sendMutation.isPending}>
              {sendMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
              {sendMutation.isPending ? 'Sending…' : 'Send Price List'}
            </Button>
          </div>

          {sendMutation.data && (
            <DeliveryResult
              sent={sendMutation.data.sent}
              failed={sendMutation.data.failed}
              rows={sendMutation.data.results.map((r) => ({ label: r.phone, success: r.success }))}
            />
          )}
        </>
      )}
    </SectionCard>
  );
}

function CustomerThankYou() {
  const { toast } = useToast();
  const [date, setDate] = useState(todayStr());
  const [message, setMessage] = useState('Thank you for buying from Soroman today! We appreciate your business.');
  const [channel, setChannel] = useState<'sms' | 'whatsapp'>('sms');

  const previewQuery = useQuery({
    queryKey: ['customer-thankyou-preview', date],
    queryFn: () => apiClient.admin.getCustomerThankYouPreview(date),
  });

  const sendMutation = useMutation({
    mutationFn: () => apiClient.admin.sendCustomerThankYou({ date, message: message.trim(), channel }),
    onSuccess: (res) => {
      toast({
        title: res.failed === 0 ? 'Thank-you message sent' : 'Sent with some failures',
        description: `${res.sent} sent, ${res.failed} failed via ${res.channel}.`,
        variant: res.failed === 0 ? undefined : 'destructive',
      });
    },
    onError: (error: Error) => {
      toast({ title: 'Send failed', description: error.message, variant: 'destructive' });
    },
  });

  const recipients = previewQuery.data?.recipients ?? [];

  const handleSend = () => {
    if (!message.trim()) {
      toast({ title: 'Message required', variant: 'destructive' });
      return;
    }
    if (recipients.length === 0) {
      toast({ title: 'No recipients', description: 'No customers ordered on this date.', variant: 'destructive' });
      return;
    }
    sendMutation.mutate();
  };

  return (
    <SectionCard
      title="Customer Thank-You"
      description="Send a thank-you message to everyone who ordered on a given day."
      icon={<Users size={18} />}
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <label htmlFor="thankyou-date" className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Date</label>
          <input
            id="thankyou-date"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="w-full h-9 rounded-md border border-slate-200 bg-slate-50 px-3 text-sm text-slate-700 outline-none focus:ring-2 focus:ring-slate-300"
          />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="thankyou-channel" className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Channel</label>
          <select
            id="thankyou-channel"
            value={channel}
            onChange={(e) => setChannel(e.target.value as 'sms' | 'whatsapp')}
            className="w-full h-9 rounded-md border border-slate-200 bg-slate-50 px-3 text-sm text-slate-700 outline-none focus:ring-2 focus:ring-slate-300"
          >
            <option value="sms">SMS</option>
            <option value="whatsapp">WhatsApp</option>
          </select>
        </div>
      </div>

      <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5">
        {previewQuery.isLoading ? (
          <p className="text-xs text-slate-400">Loading recipients…</p>
        ) : recipients.length === 0 ? (
          <p className="text-xs text-slate-400">No customers ordered on this date.</p>
        ) : (
          <div className="space-y-1.5">
            <p className="text-xs font-semibold text-slate-700">{recipients.length} recipient{recipients.length === 1 ? '' : 's'} will be messaged</p>
            <div className="max-h-32 overflow-y-auto space-y-1">
              {recipients.map((r) => (
                <div key={r.phone_normalized} className="flex items-center justify-between text-xs text-slate-600">
                  <span className="truncate">{r.name || '—'}</span>
                  <span className="font-mono text-slate-400 shrink-0">{r.phone}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="space-y-1.5">
        <label htmlFor="thankyou-message" className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Message</label>
        <Textarea
          id="thankyou-message"
          rows={3}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          className="text-sm"
        />
      </div>

      <div className="flex justify-end">
        <Button size="sm" className="gap-2" onClick={handleSend} disabled={sendMutation.isPending}>
          {sendMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
          {sendMutation.isPending ? 'Sending…' : `Send to ${recipients.length || 0}`}
        </Button>
      </div>

      {sendMutation.data && (
        <DeliveryResult
          sent={sendMutation.data.sent}
          failed={sendMutation.data.failed}
          rows={sendMutation.data.results.map((r) => ({ label: r.name || '—', sub: r.phone, success: r.success }))}
        />
      )}
    </SectionCard>
  );
}

export default function Messaging() {
  return (
    <div className="flex h-screen bg-slate-50">
      <SidebarNav />
      <div className="flex-1 flex flex-col overflow-hidden">
        <MobileNav />
        <TopBar />
        <div className="flex-1 overflow-auto p-4 sm:p-6">
          <div className="max-w-[900px] mx-auto space-y-5">
            <PageHeader title="Messaging" description="Send price updates and customer thank-you messages via SMS or WhatsApp." />
            <WhatsAppPriceTemplate />
            <CustomerThankYou />
          </div>
        </div>
      </div>
    </div>
  );
}

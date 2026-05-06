//
// PUBLIC FEEDBACK FORM — shareable link, no login required.
// Route: /feedback
//
import React, { useState } from 'react';
import { submitFeedbackPublic } from '@/api/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { CheckCircle2, Star, Loader2, AlertCircle } from 'lucide-react';

const CATEGORIES = [
  'Order & Delivery',
  'Customer Service',
  'Product Quality',
  'Pricing',
  'Website / App',
  'Other',
];

const StarRating = ({
  value,
  onChange,
}: {
  value: number;
  onChange: (v: number) => void;
}) => {
  const [hovered, setHovered] = useState(0);
  const LABELS = ['', 'Poor', 'Fair', 'Good', 'Very Good', 'Excellent'];
  return (
    <div className="space-y-1">
      <div className="flex gap-1">
        {[1, 2, 3, 4, 5].map(n => (
          <button
            key={n}
            type="button"
            title={LABELS[n]}
            onMouseEnter={() => setHovered(n)}
            onMouseLeave={() => setHovered(0)}
            onClick={() => onChange(n)}
            className="focus:outline-none transition-transform hover:scale-110"
          >
            <Star
              size={32}
              className={`transition-colors ${
                n <= (hovered || value)
                  ? 'fill-amber-400 text-amber-400'
                  : 'fill-transparent text-slate-300'
              }`}
            />
          </button>
        ))}
      </div>
      {(hovered || value) > 0 && (
        <p className="text-sm text-amber-600 font-medium">{LABELS[hovered || value]}</p>
      )}
    </div>
  );
};

export default function FeedbackForm() {
  const [form, setForm] = useState({
    name: '',
    email: '',
    phone: '',
    company: '',
    category: '',
    rating: 0,
    message: '',
  });
  const [loading, setLoading]   = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError]       = useState('');

  const set = (k: string, v: string | number) =>
    setForm(f => ({ ...f, [k]: v }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!form.name.trim())    return setError('Please enter your name.');
    if (!form.email.trim())   return setError('Please enter your email.');
    if (!form.category)       return setError('Please select a category.');
    if (form.rating === 0)    return setError('Please give a star rating.');
    if (!form.message.trim()) return setError('Please write your feedback.');

    setLoading(true);
    try {
      await submitFeedbackPublic({
        name:     form.name.trim(),
        email:    form.email.trim(),
        phone:    form.phone.trim() || undefined,
        company:  form.company.trim() || undefined,
        category: form.category,
        rating:   form.rating,
        message:  form.message.trim(),
      });
      setSubmitted(true);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (submitted) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-lg border border-slate-200 p-10 max-w-md w-full text-center">
          <div className="flex justify-center mb-4">
            <div className="bg-emerald-100 rounded-full p-4">
              <CheckCircle2 className="text-emerald-600 w-12 h-12" />
            </div>
          </div>
          <h2 className="text-2xl font-bold text-slate-900 mb-2">Thank you!</h2>
          <p className="text-slate-500 text-sm leading-relaxed">
            Your feedback has been received. Our team will review it and get back
            to you if needed.
          </p>
          <button
            className="mt-6 text-xs text-slate-400 hover:text-slate-600 underline"
            onClick={() => { setSubmitted(false); setForm({ name:'',email:'',phone:'',company:'',category:'',rating:0,message:'' }); }}
          >
            Submit another response
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-lg border border-slate-200 w-full max-w-lg overflow-hidden">

        {/* Header */}
        <div className="bg-slate-900 px-8 py-7">
          <div className="flex items-center gap-3 mb-1">
            <img src="/logo.png" alt="Logo" className="h-7 w-auto opacity-90" onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
          </div>
          <h1 className="text-xl font-bold text-white">Share Your Feedback</h1>
          <p className="text-slate-400 text-sm mt-1">
            Help us improve by sharing your experience. It only takes 2 minutes.
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="px-8 py-7 space-y-5">

          {/* Name + Email */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-600 uppercase tracking-wider">
                Full Name <span className="text-red-400">*</span>
              </label>
              <Input
                placeholder="John Doe"
                value={form.name}
                onChange={e => set('name', e.target.value)}
                className="h-10"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-600 uppercase tracking-wider">
                Email Address <span className="text-red-400">*</span>
              </label>
              <Input
                type="email"
                placeholder="you@example.com"
                value={form.email}
                onChange={e => set('email', e.target.value)}
                className="h-10"
              />
            </div>
          </div>

          {/* Phone + Company */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-600 uppercase tracking-wider">Phone</label>
              <Input
                placeholder="+234 800 000 0000"
                value={form.phone}
                onChange={e => set('phone', e.target.value)}
                className="h-10"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-600 uppercase tracking-wider">Company / Organisation</label>
              <Input
                placeholder="Optional"
                value={form.company}
                onChange={e => set('company', e.target.value)}
                className="h-10"
              />
            </div>
          </div>

          {/* Category */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-600 uppercase tracking-wider">
              Category <span className="text-red-400">*</span>
            </label>
            <select
              aria-label="Feedback category"
              value={form.category}
              onChange={e => set('category', e.target.value)}
              className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300"
            >
              <option value="">Select what your feedback is about…</option>
              {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>

          {/* Rating */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-600 uppercase tracking-wider">
              Overall Rating <span className="text-red-400">*</span>
            </label>
            <StarRating value={form.rating} onChange={v => set('rating', v)} />
          </div>

          {/* Message */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-600 uppercase tracking-wider">
              Your Feedback <span className="text-red-400">*</span>
            </label>
            <Textarea
              placeholder="Tell us about your experience — what went well, what could be better…"
              rows={5}
              value={form.message}
              onChange={e => set('message', e.target.value)}
              className="resize-none text-sm"
            />
            <p className="text-xs text-slate-400 text-right">{form.message.length} characters</p>
          </div>

          {/* Error */}
          {error && (
            <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">
              <AlertCircle size={16} className="shrink-0" />
              {error}
            </div>
          )}

          {/* Submit */}
          <Button
            type="submit"
            disabled={loading}
            className="w-full h-11 text-sm font-semibold bg-slate-900 hover:bg-slate-800"
          >
            {loading ? <><Loader2 size={16} className="animate-spin mr-2" /> Submitting…</> : 'Submit Feedback'}
          </Button>

          <p className="text-center text-xs text-slate-400">
            Your response is private and will only be seen by our team.
          </p>
        </form>
      </div>
    </div>
  );
}

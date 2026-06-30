import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { SidebarNav } from '@/components/SidebarNav';
import { TopBar } from '@/components/TopBar';
import { MobileNav } from '@/components/MobileNav';
import { PageHeader } from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useToast } from '@/hooks/use-toast';
import { apiClient } from '@/api/client';
import {
  Plus,
  Search,
  FileText,
  FileSpreadsheet,
  FileImage,
  File,
  Download,
  Trash2,
  Eye,
  FolderOpen,
  Calendar,
  User,
  Tag,
  Filter,
  Upload,
  X,
  Paperclip,
  FileArchive,
  FileCode,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type DocumentEntry = {
  id: string;
  title: string;
  description: string;
  category: string;
  pfi_number: string;      // PFI reference (optional, can be empty)
  file_name: string;
  file_type: string;        // MIME type
  file_size: number;         // bytes
  file_data: string;         // base64 encoded
  uploaded_by: string;       // auto-filled from logged in user
  created_at: string;        // ISO date string
};

type BackendPfi = {
  id: number;
  pfi_number: string;
  status?: string;
};

// ---------------------------------------------------------------------------
// Categories for the document cabinet
// ---------------------------------------------------------------------------

const CATEGORIES = [
  'Accounts',
  'Invoices',
  'Receipts',
  'Contracts',
  'Reports',
  'Correspondence',
  'Compliance',
  'HR',
  'Operations',
  'Other',
] as const;

type Category = typeof CATEGORIES[number];

const CATEGORY_COLORS: Record<string, string> = {
  Accounts: 'bg-blue-100 text-blue-700 border-blue-200',
  Invoices: 'bg-green-100 text-green-700 border-green-200',
  Receipts: 'bg-amber-100 text-amber-700 border-amber-200',
  Contracts: 'bg-purple-100 text-purple-700 border-purple-200',
  Reports: 'bg-cyan-100 text-cyan-700 border-cyan-200',
  Correspondence: 'bg-pink-100 text-pink-700 border-pink-200',
  Compliance: 'bg-red-100 text-red-700 border-red-200',
  HR: 'bg-indigo-100 text-indigo-700 border-indigo-200',
  Operations: 'bg-orange-100 text-orange-700 border-orange-200',
  Other: 'bg-slate-100 text-slate-700 border-slate-200',
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const LS_KEY = 'soroman_documents';

const loadDocs = (): DocumentEntry[] => {
  try {
    return JSON.parse(localStorage.getItem(LS_KEY) || '[]');
  } catch {
    return [];
  }
};

const saveDocs = (docs: DocumentEntry[]) => {
  localStorage.setItem(LS_KEY, JSON.stringify(docs));
};

const generateId = () => `doc_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

const formatFileSize = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const getFileIcon = (type: string) => {
  if (type.includes('pdf')) return <FileText className="text-red-500" size={20} />;
  if (type.includes('sheet') || type.includes('excel') || type.includes('csv')) return <FileSpreadsheet className="text-green-600" size={20} />;
  if (type.includes('image')) return <FileImage className="text-blue-500" size={20} />;
  if (type.includes('zip') || type.includes('rar') || type.includes('archive')) return <FileArchive className="text-amber-600" size={20} />;
  if (type.includes('json') || type.includes('xml') || type.includes('html')) return <FileCode className="text-purple-500" size={20} />;
  if (type.includes('word') || type.includes('document')) return <FileText className="text-blue-600" size={20} />;
  return <File className="text-slate-500" size={20} />;
};

const formatDate = (iso: string) => {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) +
      ' · ' + d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  } catch {
    return iso;
  }
};

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

export default function Documents() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const currentUser = localStorage.getItem('fullname') || 'Unknown User';

  // ---- State ----
  const [docs, setDocs] = useState<DocumentEntry[]>(loadDocs);
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  const [pfiFilter, setPfiFilter] = useState<string | null>(null);

  // Upload dialog
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadTitle, setUploadTitle] = useState('');
  const [uploadDescription, setUploadDescription] = useState('');
  const [uploadCategory, setUploadCategory] = useState<string>('');
  const [uploadPfi, setUploadPfi] = useState('');
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // View dialog
  const [viewDoc, setViewDoc] = useState<DocumentEntry | null>(null);

  // Delete confirmation
  const [deleteDoc, setDeleteDoc] = useState<DocumentEntry | null>(null);

  // Persist when docs change
  useEffect(() => { saveDocs(docs); }, [docs]);

  // ---- Fetch PFIs for the PFI dropdown ----
  const { data: pfiData } = useQuery({
    queryKey: ['documents-pfis'],
    queryFn: () => apiClient.admin.getPfis({ page_size: 1000 }),
    staleTime: 60_000,
  });

  const pfiList = useMemo(() => {
    const raw = pfiData as { results?: BackendPfi[] } | undefined;
    return (raw?.results ?? []).map(p => p.pfi_number).filter(Boolean).sort();
  }, [pfiData]);

  // ---- Derived data ----
  const uniqueCategories = useMemo(() => {
    const cats = docs.map(d => d.category).filter(Boolean);
    return Array.from(new Set(cats)).sort();
  }, [docs]);

  const uniquePfis = useMemo(() => {
    const pfis = docs.map(d => d.pfi_number).filter(Boolean);
    return Array.from(new Set(pfis)).sort();
  }, [docs]);

  const filteredDocs = useMemo(() => {
    return docs
      .filter(d => {
        if (!searchQuery.trim()) return true;
        const q = searchQuery.toLowerCase();
        return (
          d.title.toLowerCase().includes(q) ||
          d.description.toLowerCase().includes(q) ||
          d.file_name.toLowerCase().includes(q) ||
          d.uploaded_by.toLowerCase().includes(q) ||
          d.pfi_number.toLowerCase().includes(q) ||
          d.category.toLowerCase().includes(q)
        );
      })
      .filter(d => !categoryFilter || d.category === categoryFilter)
      .filter(d => !pfiFilter || d.pfi_number === pfiFilter)
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }, [docs, searchQuery, categoryFilter, pfiFilter]);

  // ---- Summary stats ----
  const totalDocs = docs.length;
  const categoryCounts = useMemo(() => {
    const m: Record<string, number> = {};
    docs.forEach(d => { m[d.category] = (m[d.category] || 0) + 1; });
    return m;
  }, [docs]);

  // ---- File handling ----
  const readFileAsBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        // Remove the "data:...;base64," prefix
        const base64 = result.split(',')[1] || result;
        resolve(base64);
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  const handleUpload = async () => {
    if (!uploadTitle.trim()) {
      toast({ title: 'Title is required', variant: 'destructive' });
      return;
    }
    if (!uploadCategory) {
      toast({ title: 'Please select a category', variant: 'destructive' });
      return;
    }
    if (!uploadFile) {
      toast({ title: 'Please attach a file', variant: 'destructive' });
      return;
    }

    // 10MB limit for localStorage
    if (uploadFile.size > 10 * 1024 * 1024) {
      toast({ title: 'File too large', description: 'Maximum file size is 10MB.', variant: 'destructive' });
      return;
    }

    setUploading(true);
    try {
      const fileData = await readFileAsBase64(uploadFile);

      const newDoc: DocumentEntry = {
        id: generateId(),
        title: uploadTitle.trim(),
        description: uploadDescription.trim(),
        category: uploadCategory,
        pfi_number: uploadPfi,
        file_name: uploadFile.name,
        file_type: uploadFile.type || 'application/octet-stream',
        file_size: uploadFile.size,
        file_data: fileData,
        uploaded_by: currentUser,
        created_at: new Date().toISOString(),
      };

      setDocs(prev => [newDoc, ...prev]);
      toast({ title: 'Document uploaded', description: `"${newDoc.title}" has been filed under ${newDoc.category}.` });
      resetUploadForm();
      setUploadOpen(false);
    } catch (err) {
      toast({ title: 'Upload failed', description: String(err), variant: 'destructive' });
    } finally {
      setUploading(false);
    }
  };

  const resetUploadForm = () => {
    setUploadTitle('');
    setUploadDescription('');
    setUploadCategory('');
    setUploadPfi('');
    setUploadFile(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleDownload = (doc: DocumentEntry) => {
    const byteChars = atob(doc.file_data);
    const byteNumbers = new Array(byteChars.length);
    for (let i = 0; i < byteChars.length; i++) byteNumbers[i] = byteChars.charCodeAt(i);
    const byteArray = new Uint8Array(byteNumbers);
    const blob = new Blob([byteArray], { type: doc.file_type });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = doc.file_name;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleDelete = (doc: DocumentEntry) => {
    setDocs(prev => prev.filter(d => d.id !== doc.id));
    setDeleteDoc(null);
    setViewDoc(null);
    toast({ title: 'Document deleted', description: `"${doc.title}" has been removed.` });
  };

  // ---- Render ----
  return (
    <div className="flex h-screen bg-[#f8fafc]">
      <SidebarNav />

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <TopBar />
        <MobileNav />

        <main className="flex-1 overflow-y-auto">
          <div className="max-w-[1400px] mx-auto px-3 sm:px-6 py-4 sm:py-6 space-y-5">
            {/* Header */}
            <PageHeader
              title="Document Cabinet"
              description="Upload and organize documents, reports, and files. Everything filed by category and PFI reference."
              actions={
                <Button onClick={() => setUploadOpen(true)} size="sm" className="gap-1.5">
                  <Plus size={15} />
                  Upload Document
                </Button>
              }
            />

            {/* Summary cards */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
              <Card
                className={`cursor-pointer transition-all ${!categoryFilter ? 'ring-2 ring-primary' : 'hover:shadow-md'}`}
                onClick={() => setCategoryFilter(null)}
              >
                <CardContent className="p-3 sm:p-4 flex flex-col items-center justify-center text-center gap-1">
                  <FolderOpen size={22} className="text-slate-500" />
                  <p className="text-xl sm:text-2xl font-bold text-slate-900">{totalDocs}</p>
                  <p className="text-[11px] sm:text-xs text-slate-500 font-medium">All Files</p>
                </CardContent>
              </Card>
              {CATEGORIES.slice(0, 4).map(cat => (
                <Card
                  key={cat}
                  className={`cursor-pointer transition-all ${categoryFilter === cat ? 'ring-2 ring-primary' : 'hover:shadow-md'}`}
                  onClick={() => setCategoryFilter(prev => prev === cat ? null : cat)}
                >
                  <CardContent className="p-3 sm:p-4 flex flex-col items-center justify-center text-center gap-1">
                    <Tag size={18} className="text-slate-400" />
                    <p className="text-xl sm:text-2xl font-bold text-slate-900">{categoryCounts[cat] || 0}</p>
                    <p className="text-[11px] sm:text-xs text-slate-500 font-medium">{cat}</p>
                  </CardContent>
                </Card>
              ))}
            </div>

            {/* Filters */}
            <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
              <div className="relative flex-1 max-w-md">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                <Input
                  placeholder="Search documents..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9 h-9 text-sm"
                />
              </div>

              {/* Category filter */}
              <select
                title="Filter by category"
                value={categoryFilter ?? ''}
                onChange={(e) => setCategoryFilter(e.target.value || null)}
                className="h-9 rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-primary/30"
              >
                <option value="">All Categories</option>
                {CATEGORIES.map(c => (
                  <option key={c} value={c}>{c} ({categoryCounts[c] || 0})</option>
                ))}
              </select>

              {/* PFI filter */}
              {uniquePfis.length > 0 && (
                <select
                  title="Filter by PFI"
                  value={pfiFilter ?? ''}
                  onChange={(e) => setPfiFilter(e.target.value || null)}
                  className="h-9 rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-primary/30"
                >
                  <option value="">All PFIs</option>
                  {uniquePfis.map(p => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
              )}

              {(categoryFilter || pfiFilter || searchQuery) && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-9 text-xs gap-1"
                  onClick={() => { setCategoryFilter(null); setPfiFilter(null); setSearchQuery(''); }}
                >
                  <X size={14} /> Clear
                </Button>
              )}
            </div>

            {/* Documents list */}
            {filteredDocs.length === 0 ? (
              <Card>
                <CardContent className="py-16 flex flex-col items-center justify-center text-center gap-3">
                  <FolderOpen size={48} className="text-slate-300" />
                  <p className="text-slate-500 font-medium">
                    {docs.length === 0 ? 'No documents yet' : 'No documents match your filters'}
                  </p>
                  <p className="text-sm text-slate-400">
                    {docs.length === 0
                      ? 'Click "Upload Document" to get started.'
                      : 'Try adjusting your search or filters.'}
                  </p>
                  {docs.length === 0 && (
                    <Button onClick={() => setUploadOpen(true)} size="sm" variant="outline" className="mt-2 gap-1.5">
                      <Upload size={14} /> Upload Your First Document
                    </Button>
                  )}
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-2">
                {filteredDocs.map(doc => (
                  <Card
                    key={doc.id}
                    className="hover:shadow-md transition-shadow cursor-pointer group"
                    onClick={() => setViewDoc(doc)}
                  >
                    <CardContent className="p-3 sm:p-4">
                      <div className="flex items-start gap-3">
                        {/* File icon */}
                        <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-slate-50 border border-slate-100 flex items-center justify-center mt-0.5">
                          {getFileIcon(doc.file_type)}
                        </div>

                        {/* Info */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <h3 className="font-semibold text-sm text-slate-900 truncate">{doc.title}</h3>
                              {doc.description && (
                                <p className="text-xs text-slate-500 mt-0.5 line-clamp-1">{doc.description}</p>
                              )}
                            </div>
                            {/* Actions (show on hover / always on mobile) */}
                            <div className="flex items-center gap-1 flex-shrink-0 opacity-100 sm:opacity-0 group-hover:opacity-100 transition-opacity">
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 w-7 p-0"
                                title="Download"
                                onClick={(e) => { e.stopPropagation(); handleDownload(doc); }}
                              >
                                <Download size={14} />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 w-7 p-0 text-red-500 hover:text-red-700 hover:bg-red-50"
                                title="Delete"
                                onClick={(e) => { e.stopPropagation(); setDeleteDoc(doc); }}
                              >
                                <Trash2 size={14} />
                              </Button>
                            </div>
                          </div>

                          {/* Meta row */}
                          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2">
                            <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${CATEGORY_COLORS[doc.category] || CATEGORY_COLORS.Other}`}>
                              {doc.category}
                            </Badge>
                            {doc.pfi_number && (
                              <span className="inline-flex items-center gap-1 text-[11px] text-slate-500">
                                <FileText size={11} /> PFI: {doc.pfi_number}
                              </span>
                            )}
                            <span className="inline-flex items-center gap-1 text-[11px] text-slate-400">
                              <Paperclip size={11} /> {doc.file_name} · {formatFileSize(doc.file_size)}
                            </span>
                            <span className="inline-flex items-center gap-1 text-[11px] text-slate-400">
                              <User size={11} /> {doc.uploaded_by}
                            </span>
                            <span className="inline-flex items-center gap-1 text-[11px] text-slate-400">
                              <Calendar size={11} /> {formatDate(doc.created_at)}
                            </span>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}

            {/* Results count */}
            {filteredDocs.length > 0 && (
              <p className="text-xs text-slate-400 text-center pt-2">
                Showing {filteredDocs.length} of {totalDocs} document{totalDocs !== 1 ? 's' : ''}
              </p>
            )}
          </div>
        </main>
      </div>

      {/* ======================== Upload Dialog ======================== */}
      <Dialog open={uploadOpen} onOpenChange={(o) => { if (!o) { resetUploadForm(); } setUploadOpen(o); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Upload size={18} /> Upload Document
            </DialogTitle>
            <DialogDescription>
              Fill in the details and attach your file. Your name will be recorded automatically.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 pt-2">
            {/* Title */}
            <div className="space-y-1.5">
              <Label htmlFor="doc-title">Title <span className="text-red-500">*</span></Label>
              <Input
                id="doc-title"
                placeholder="e.g. January Invoice — Lagos Depot"
                value={uploadTitle}
                onChange={(e) => setUploadTitle(e.target.value)}
                className="h-9"
              />
            </div>

            {/* Description */}
            <div className="space-y-1.5">
              <Label htmlFor="doc-desc">Description</Label>
              <textarea
                id="doc-desc"
                placeholder="Brief note about this document..."
                value={uploadDescription}
                onChange={(e) => setUploadDescription(e.target.value)}
                rows={2}
                className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none"
              />
            </div>

            {/* Category */}
            <div className="space-y-1.5">
              <Label htmlFor="doc-cat">Category <span className="text-red-500">*</span></Label>
              <select
                id="doc-cat"
                title="Document category"
                value={uploadCategory}
                onChange={(e) => setUploadCategory(e.target.value)}
                className="w-full h-9 rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-primary/30"
              >
                <option value="">Select a category</option>
                {CATEGORIES.map(c => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>

            {/* PFI Reference */}
            <div className="space-y-1.5">
              <Label htmlFor="doc-pfi">PFI Reference <span className="text-slate-400 text-xs font-normal">(optional)</span></Label>
              <select
                id="doc-pfi"
                title="PFI reference"
                value={uploadPfi}
                onChange={(e) => setUploadPfi(e.target.value)}
                className="w-full h-9 rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-primary/30"
              >
                <option value="">No PFI reference</option>
                {pfiList.map(p => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </div>

            {/* File upload */}
            <div className="space-y-1.5">
              <Label>Attach File <span className="text-red-500">*</span></Label>
              <div
                className={`relative border-2 border-dashed rounded-lg p-4 text-center cursor-pointer transition-colors ${
                  uploadFile
                    ? 'border-primary/40 bg-primary/5'
                    : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                }`}
                onClick={() => fileInputRef.current?.click()}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  title="Select a file to upload"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) setUploadFile(f);
                  }}
                />
                {uploadFile ? (
                  <div className="flex items-center justify-center gap-2">
                    {getFileIcon(uploadFile.type)}
                    <div className="text-left">
                      <p className="text-sm font-medium text-slate-700 truncate max-w-[250px]">{uploadFile.name}</p>
                      <p className="text-xs text-slate-400">{formatFileSize(uploadFile.size)}</p>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 w-6 p-0 ml-2"
                      onClick={(e) => {
                        e.stopPropagation();
                        setUploadFile(null);
                        if (fileInputRef.current) fileInputRef.current.value = '';
                      }}
                    >
                      <X size={14} />
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-1">
                    <Upload size={24} className="mx-auto text-slate-400" />
                    <p className="text-sm text-slate-500">Click to select a file</p>
                    <p className="text-xs text-slate-400">PDF, Excel, Word, Images, etc. (max 10MB)</p>
                  </div>
                )}
              </div>
            </div>

            {/* Uploading as */}
            <div className="flex items-center gap-2 text-xs text-slate-500 bg-slate-50 rounded-md p-2">
              <User size={14} className="text-slate-400" />
              <span>Uploading as: <strong className="text-slate-700">{currentUser}</strong></span>
            </div>
          </div>

          <DialogFooter className="pt-2">
            <Button variant="outline" onClick={() => { resetUploadForm(); setUploadOpen(false); }} disabled={uploading}>
              Cancel
            </Button>
            <Button onClick={handleUpload} disabled={uploading} className="gap-1.5">
              {uploading ? 'Uploading...' : <><Upload size={14} /> Upload</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ======================== View Dialog ======================== */}
      <Dialog open={!!viewDoc} onOpenChange={(o) => { if (!o) setViewDoc(null); }}>
        <DialogContent className="max-w-lg">
          {viewDoc && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2 pr-8">
                  {getFileIcon(viewDoc.file_type)}
                  <span className="truncate">{viewDoc.title}</span>
                </DialogTitle>
                <DialogDescription>Document details</DialogDescription>
              </DialogHeader>

              <div className="space-y-4 pt-2">
                {viewDoc.description && (
                  <div>
                    <p className="text-xs font-medium text-slate-500 mb-1">Description</p>
                    <p className="text-sm text-slate-700">{viewDoc.description}</p>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-xs font-medium text-slate-500 mb-1">Category</p>
                    <Badge variant="outline" className={`${CATEGORY_COLORS[viewDoc.category] || CATEGORY_COLORS.Other}`}>
                      {viewDoc.category}
                    </Badge>
                  </div>
                  {viewDoc.pfi_number && (
                    <div>
                      <p className="text-xs font-medium text-slate-500 mb-1">PFI Reference</p>
                      <p className="text-sm text-slate-700">{viewDoc.pfi_number}</p>
                    </div>
                  )}
                  <div>
                    <p className="text-xs font-medium text-slate-500 mb-1">File</p>
                    <p className="text-sm text-slate-700 truncate">{viewDoc.file_name}</p>
                    <p className="text-xs text-slate-400">{formatFileSize(viewDoc.file_size)}</p>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-slate-500 mb-1">Uploaded By</p>
                    <p className="text-sm text-slate-700">{viewDoc.uploaded_by}</p>
                  </div>
                  <div className="col-span-2">
                    <p className="text-xs font-medium text-slate-500 mb-1">Date Uploaded</p>
                    <p className="text-sm text-slate-700">{formatDate(viewDoc.created_at)}</p>
                  </div>
                </div>
              </div>

              <DialogFooter className="pt-2 flex-col sm:flex-row gap-2">
                <Button
                  variant="destructive"
                  size="sm"
                  className="gap-1.5"
                  onClick={() => { setViewDoc(null); setDeleteDoc(viewDoc); }}
                >
                  <Trash2 size={14} /> Delete
                </Button>
                <Button onClick={() => handleDownload(viewDoc)} className="gap-1.5">
                  <Download size={14} /> Download
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* ======================== Delete Confirmation ======================== */}
      <Dialog open={!!deleteDoc} onOpenChange={(o) => { if (!o) setDeleteDoc(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete Document</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete <strong>"{deleteDoc?.title}"</strong>? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="pt-2">
            <Button variant="outline" onClick={() => setDeleteDoc(null)}>Cancel</Button>
            <Button variant="destructive" onClick={() => deleteDoc && handleDelete(deleteDoc)}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/**
 * @author Bodo Desderio <rooiboktechltd@gmail.com>
 * @copyright 2026 Rooibok Technologies. All rights reserved.
 */
'use client';

import { useState } from 'react';
import { Plus, Pencil, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import Topbar from '@/components/admin/Topbar';
import FormGrid, { FormActions, FormCard } from '@/components/admin/FormGrid';
import FormField from '@/components/admin/FormField';
import { Reveal } from '@/components/admin/Reveal';
import { api, ApiError } from '@/lib/api';
import { useApiQuery } from '@/lib/hooks';

// ── types ─────────────────────────────────────────────────────────────────────

type TabKey = 'faqs' | 'features' | 'testimonials' | 'sections';

// FAQs
interface Faq {
  id: string;
  question: string;
  answer: string;
  category: string;
  sort_order: number;
  is_published: boolean;
}
interface FaqForm {
  question: string;
  answer: string;
  category: string;
  sort_order: number;
  is_published: boolean;
}
const EMPTY_FAQ: FaqForm = { question: '', answer: '', category: '', sort_order: 0, is_published: true };

// Features
interface Feature {
  id: string;
  icon: string;
  title: string;
  description: string;
  sort_order: number;
  is_published: boolean;
}
interface FeatureForm {
  icon: string;
  title: string;
  description: string;
  sort_order: number;
  is_published: boolean;
}
const EMPTY_FEATURE: FeatureForm = { icon: '', title: '', description: '', sort_order: 0, is_published: true };

// Testimonials
interface Testimonial {
  id: string;
  quote: string;
  name: string;
  role: string;
  sort_order: number;
  is_published: boolean;
}
interface TestimonialForm {
  quote: string;
  name: string;
  role: string;
  sort_order: number;
  is_published: boolean;
}
const EMPTY_TESTIMONIAL: TestimonialForm = { quote: '', name: '', role: '', sort_order: 0, is_published: true };

// Page copy (sections)
interface Section {
  id: string;
  page: string;
  key: string;
  value: string;
  sort_order: number;
  is_published: boolean;
}
interface SectionForm {
  page: string;
  key: string;
  value: string;
  sort_order: number;
  is_published: boolean;
}
const EMPTY_SECTION: SectionForm = { page: '', key: '', value: '', sort_order: 0, is_published: true };

// ── local helpers ─────────────────────────────────────────────────────────────

function Toggle({
  id,
  checked,
  onChange,
}: {
  id: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="relative inline-flex flex-shrink-0 items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00D4AA] focus-visible:ring-offset-2"
      style={{ width: '40px', height: '22px', background: checked ? '#00D4AA' : '#D1D5DB' }}
    >
      <span className="sr-only">{checked ? 'On' : 'Off'}</span>
      <span
        className="inline-block rounded-full bg-white shadow transition-transform"
        style={{ width: '16px', height: '16px', transform: checked ? 'translateX(20px)' : 'translateX(3px)' }}
      />
    </button>
  );
}

function StatusBadge({ published }: { published: boolean }) {
  return (
    <span
      className="rounded-full font-semibold uppercase"
      style={{
        background: published ? 'rgba(16,185,129,0.1)' : 'rgba(107,114,128,0.12)',
        color: published ? '#10B981' : '#6B7280',
        padding: '2px 9px',
        fontSize: '10px',
        letterSpacing: '0.04em',
      }}
    >
      {published ? 'Published' : 'Draft'}
    </span>
  );
}

const TABS: { key: TabKey; label: string }[] = [
  { key: 'faqs', label: 'FAQs' },
  { key: 'features', label: 'Features' },
  { key: 'testimonials', label: 'Testimonials' },
  { key: 'sections', label: 'Page copy' },
];

function Skeletons() {
  return (
    <div className="space-y-3">
      {[0, 1, 2].map((i) => (
        <div key={i} className="h-16 animate-pulse rounded-[11px] border bg-white" />
      ))}
    </div>
  );
}

// ── row actions ───────────────────────────────────────────────────────────────

function RowActions({
  onEdit,
  onDelete,
  deletingId,
  id,
  label,
}: {
  onEdit: () => void;
  onDelete: () => void;
  deletingId: string | null;
  id: string;
  label: string;
}) {
  return (
    <div className="flex items-center justify-end gap-1">
      <button
        type="button"
        onClick={onEdit}
        aria-label={`Edit ${label}`}
        className="rounded-md p-1.5 text-text-muted transition hover:bg-black/[0.05] hover:text-navy"
      >
        <Pencil size={15} />
      </button>
      <button
        type="button"
        onClick={onDelete}
        disabled={deletingId === id}
        aria-label={`Delete ${label}`}
        className="rounded-md p-1.5 text-text-muted transition hover:bg-red-50 hover:text-red-600 disabled:opacity-30 disabled:cursor-not-allowed"
      >
        <Trash2 size={15} />
      </button>
    </div>
  );
}

// ── modal shell ───────────────────────────────────────────────────────────────

function Modal({
  title,
  saving,
  onClose,
  onSave,
  children,
}: {
  title: string;
  saving: boolean;
  onClose: () => void;
  onSave: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4 sm:p-8"
      style={{ background: 'rgba(13,15,46,0.45)' }}
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={() => !saving && onClose()}
    >
      <div className="w-full max-w-2xl animate-fade-up" onClick={(e) => e.stopPropagation()}>
        <FormCard>
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-display font-bold text-[16px] text-navy">{title}</h2>
            <button
              type="button"
              onClick={() => !saving && onClose()}
              aria-label="Close"
              className="rounded-md p-1 text-text-muted transition hover:bg-black/[0.05] hover:text-navy"
            >
              <X size={18} />
            </button>
          </div>
          {children}
          <FormActions>
            <button type="button" className="btn-outline" disabled={saving} onClick={onClose}>
              Cancel
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={onSave}
              className="rounded-full font-display font-bold text-[13px] px-4 py-2 transition hover:opacity-90 disabled:opacity-60 disabled:cursor-not-allowed"
              style={{ background: '#00D4AA', color: '#0D0F2E' }}
            >
              {saving ? 'Saving…' : 'Save changes'}
            </button>
          </FormActions>
        </FormCard>
      </div>
    </div>
  );
}

// ── FAQs tab ──────────────────────────────────────────────────────────────────

function FaqsTab({ active }: { active: boolean }) {
  const [editing, setEditing] = useState<Faq | 'new' | null>(null);
  const [form, setForm] = useState<FaqForm>(EMPTY_FAQ);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const { data, isLoading: loading, refetch } = useApiQuery(
    ['admin', 'content', 'faqs'],
    () => api<Faq[]>('/admin/content/faqs', { auth: true }),
    { enabled: active },
  );
  const rows = data ?? [];

  function openNew() {
    setForm(EMPTY_FAQ);
    setEditing('new');
  }
  function openEdit(r: Faq) {
    setForm({ question: r.question, answer: r.answer, category: r.category, sort_order: r.sort_order, is_published: r.is_published });
    setEditing(r);
  }
  function upd<K extends keyof FaqForm>(k: K, v: FaqForm[K]) {
    setForm((p) => ({ ...p, [k]: v }));
  }

  async function save() {
    if (!form.question.trim()) { toast.error('Question is required'); return; }
    if (!form.answer.trim()) { toast.error('Answer is required'); return; }
    setSaving(true);
    try {
      const payload = { question: form.question.trim(), answer: form.answer.trim(), category: form.category.trim(), sort_order: form.sort_order, is_published: form.is_published };
      if (editing === 'new') {
        await api('/admin/content/faqs', { method: 'POST', auth: true, body: JSON.stringify(payload) });
        toast.success('FAQ created');
      } else if (editing) {
        await api(`/admin/content/faqs/${editing.id}`, { method: 'PATCH', auth: true, body: JSON.stringify(payload) });
        toast.success('FAQ updated');
      }
      setEditing(null);
      await refetch();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  async function remove(r: Faq) {
    if (!window.confirm(`Delete this FAQ? This cannot be undone.`)) return;
    setDeletingId(r.id);
    try {
      await api(`/admin/content/faqs/${r.id}`, { method: 'DELETE', auth: true });
      toast.success('FAQ deleted');
      await refetch();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'Delete failed');
    } finally {
      setDeletingId(null);
    }
  }

  if (!active) return null;
  if (loading) return <Skeletons />;

  return (
    <>
      <div className="flex items-center justify-between mb-4">
        <p className="text-[12px] text-text-muted">Frequently asked questions shown on the public site.</p>
        <button
          type="button"
          onClick={openNew}
          className="inline-flex items-center gap-1.5 rounded-full font-display font-bold text-[13px] px-4 py-2 transition hover:opacity-90"
          style={{ background: '#00D4AA', color: '#0D0F2E' }}
        >
          <Plus size={15} aria-hidden="true" /> New FAQ
        </button>
      </div>

      {rows.length === 0 ? (
        <FormCard>
          <p className="text-center text-[13px] text-text-muted py-6">No FAQs yet. Add your first question.</p>
        </FormCard>
      ) : (
        <Reveal>
          <div className="overflow-x-auto rounded-[11px] border bg-white">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b">
                  {['Order', 'Question', 'Category', 'Status', ''].map((h) => (
                    <th key={h} className="px-4 py-3 text-left text-[10.5px] font-semibold uppercase tracking-[0.04em] text-text-muted whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-b last:border-0 hover:bg-black/[0.015] transition-colors">
                    <td className="px-4 py-3 font-mono text-text-muted">{r.sort_order}</td>
                    <td className="px-4 py-3 font-semibold text-navy max-w-xs truncate">{r.question}</td>
                    <td className="px-4 py-3 text-text-muted">{r.category || '—'}</td>
                    <td className="px-4 py-3"><StatusBadge published={r.is_published} /></td>
                    <td className="px-4 py-3">
                      <RowActions onEdit={() => openEdit(r)} onDelete={() => remove(r)} deletingId={deletingId} id={r.id} label={r.question} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Reveal>
      )}

      {editing && (
        <Modal title={editing === 'new' ? 'New FAQ' : 'Edit FAQ'} saving={saving} onClose={() => !saving && setEditing(null)} onSave={save}>
          <FormGrid columns={2}>
            <div className="md:col-span-2">
              <FormField label="Question" htmlFor="faq-question">
                <input id="faq-question" type="text" className="input" value={form.question} onChange={(e) => upd('question', e.target.value)} />
              </FormField>
            </div>
            <div className="md:col-span-2">
              <FormField label="Answer" htmlFor="faq-answer">
                <textarea id="faq-answer" className="input" rows={4} style={{ resize: 'vertical' }} value={form.answer} onChange={(e) => upd('answer', e.target.value)} />
              </FormField>
            </div>
            <FormField label="Category" htmlFor="faq-category" hint="Optional grouping label.">
              <input id="faq-category" type="text" className="input" value={form.category} onChange={(e) => upd('category', e.target.value)} />
            </FormField>
            <FormField label="Sort order" htmlFor="faq-order">
              <input id="faq-order" type="number" className="input" value={form.sort_order} onChange={(e) => upd('sort_order', Number(e.target.value))} />
            </FormField>
            <FormField label="Published" htmlFor="faq-pub">
              <div className="flex h-[38px] items-center gap-2">
                <Toggle id="faq-pub" checked={form.is_published} onChange={(v) => upd('is_published', v)} />
                <span className="text-[12px] text-text-muted select-none">{form.is_published ? 'Published' : 'Draft'}</span>
              </div>
            </FormField>
          </FormGrid>
        </Modal>
      )}
    </>
  );
}

// ── Features tab ──────────────────────────────────────────────────────────────

function FeaturesTab({ active }: { active: boolean }) {
  const [editing, setEditing] = useState<Feature | 'new' | null>(null);
  const [form, setForm] = useState<FeatureForm>(EMPTY_FEATURE);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const { data, isLoading: loading, refetch } = useApiQuery(
    ['admin', 'content', 'features'],
    () => api<Feature[]>('/admin/content/features', { auth: true }),
    { enabled: active },
  );
  const rows = data ?? [];

  function openNew() {
    setForm(EMPTY_FEATURE);
    setEditing('new');
  }
  function openEdit(r: Feature) {
    setForm({ icon: r.icon, title: r.title, description: r.description, sort_order: r.sort_order, is_published: r.is_published });
    setEditing(r);
  }
  function upd<K extends keyof FeatureForm>(k: K, v: FeatureForm[K]) {
    setForm((p) => ({ ...p, [k]: v }));
  }

  async function save() {
    if (!form.icon.trim()) { toast.error('Icon name is required'); return; }
    if (!form.title.trim()) { toast.error('Title is required'); return; }
    if (!form.description.trim()) { toast.error('Description is required'); return; }
    setSaving(true);
    try {
      const payload = { icon: form.icon.trim(), title: form.title.trim(), description: form.description.trim(), sort_order: form.sort_order, is_published: form.is_published };
      if (editing === 'new') {
        await api('/admin/content/features', { method: 'POST', auth: true, body: JSON.stringify(payload) });
        toast.success('Feature created');
      } else if (editing) {
        await api(`/admin/content/features/${editing.id}`, { method: 'PATCH', auth: true, body: JSON.stringify(payload) });
        toast.success('Feature updated');
      }
      setEditing(null);
      await refetch();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  async function remove(r: Feature) {
    if (!window.confirm(`Delete "${r.title}"? This cannot be undone.`)) return;
    setDeletingId(r.id);
    try {
      await api(`/admin/content/features/${r.id}`, { method: 'DELETE', auth: true });
      toast.success(`"${r.title}" deleted`);
      await refetch();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'Delete failed');
    } finally {
      setDeletingId(null);
    }
  }

  if (!active) return null;
  if (loading) return <Skeletons />;

  return (
    <>
      <div className="flex items-center justify-between mb-4">
        <p className="text-[12px] text-text-muted">Product features shown on the marketing site.</p>
        <button
          type="button"
          onClick={openNew}
          className="inline-flex items-center gap-1.5 rounded-full font-display font-bold text-[13px] px-4 py-2 transition hover:opacity-90"
          style={{ background: '#00D4AA', color: '#0D0F2E' }}
        >
          <Plus size={15} aria-hidden="true" /> New feature
        </button>
      </div>

      {rows.length === 0 ? (
        <FormCard>
          <p className="text-center text-[13px] text-text-muted py-6">No features yet. Add your first feature.</p>
        </FormCard>
      ) : (
        <Reveal>
          <div className="overflow-x-auto rounded-[11px] border bg-white">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b">
                  {['Order', 'Icon', 'Title', 'Status', ''].map((h) => (
                    <th key={h} className="px-4 py-3 text-left text-[10.5px] font-semibold uppercase tracking-[0.04em] text-text-muted whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-b last:border-0 hover:bg-black/[0.015] transition-colors">
                    <td className="px-4 py-3 font-mono text-text-muted">{r.sort_order}</td>
                    <td className="px-4 py-3 font-mono text-[12px] text-text-muted">{r.icon}</td>
                    <td className="px-4 py-3 font-semibold text-navy">{r.title}</td>
                    <td className="px-4 py-3"><StatusBadge published={r.is_published} /></td>
                    <td className="px-4 py-3">
                      <RowActions onEdit={() => openEdit(r)} onDelete={() => remove(r)} deletingId={deletingId} id={r.id} label={r.title} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Reveal>
      )}

      {editing && (
        <Modal title={editing === 'new' ? 'New feature' : 'Edit feature'} saving={saving} onClose={() => !saving && setEditing(null)} onSave={save}>
          <FormGrid columns={2}>
            <FormField label="Icon name" htmlFor="feat-icon" hint='Lucide icon name, e.g. "Upload", "Code", "BarChart2".'>
              <input id="feat-icon" type="text" className="input" value={form.icon} onChange={(e) => upd('icon', e.target.value)} placeholder="BarChart2" />
            </FormField>
            <FormField label="Title" htmlFor="feat-title">
              <input id="feat-title" type="text" className="input" value={form.title} onChange={(e) => upd('title', e.target.value)} />
            </FormField>
            <div className="md:col-span-2">
              <FormField label="Description" htmlFor="feat-desc">
                <textarea id="feat-desc" className="input" rows={3} style={{ resize: 'vertical' }} value={form.description} onChange={(e) => upd('description', e.target.value)} />
              </FormField>
            </div>
            <FormField label="Sort order" htmlFor="feat-order">
              <input id="feat-order" type="number" className="input" value={form.sort_order} onChange={(e) => upd('sort_order', Number(e.target.value))} />
            </FormField>
            <FormField label="Published" htmlFor="feat-pub">
              <div className="flex h-[38px] items-center gap-2">
                <Toggle id="feat-pub" checked={form.is_published} onChange={(v) => upd('is_published', v)} />
                <span className="text-[12px] text-text-muted select-none">{form.is_published ? 'Published' : 'Draft'}</span>
              </div>
            </FormField>
          </FormGrid>
        </Modal>
      )}
    </>
  );
}

// ── Testimonials tab ──────────────────────────────────────────────────────────

function TestimonialsTab({ active }: { active: boolean }) {
  const [editing, setEditing] = useState<Testimonial | 'new' | null>(null);
  const [form, setForm] = useState<TestimonialForm>(EMPTY_TESTIMONIAL);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const { data, isLoading: loading, refetch } = useApiQuery(
    ['admin', 'content', 'testimonials'],
    () => api<Testimonial[]>('/admin/content/testimonials', { auth: true }),
    { enabled: active },
  );
  const rows = data ?? [];

  function openNew() {
    setForm(EMPTY_TESTIMONIAL);
    setEditing('new');
  }
  function openEdit(r: Testimonial) {
    setForm({ quote: r.quote, name: r.name, role: r.role, sort_order: r.sort_order, is_published: r.is_published });
    setEditing(r);
  }
  function upd<K extends keyof TestimonialForm>(k: K, v: TestimonialForm[K]) {
    setForm((p) => ({ ...p, [k]: v }));
  }

  async function save() {
    if (!form.quote.trim()) { toast.error('Quote is required'); return; }
    if (!form.name.trim()) { toast.error('Name is required'); return; }
    if (!form.role.trim()) { toast.error('Role is required'); return; }
    setSaving(true);
    try {
      const payload = { quote: form.quote.trim(), name: form.name.trim(), role: form.role.trim(), sort_order: form.sort_order, is_published: form.is_published };
      if (editing === 'new') {
        await api('/admin/content/testimonials', { method: 'POST', auth: true, body: JSON.stringify(payload) });
        toast.success('Testimonial created');
      } else if (editing) {
        await api(`/admin/content/testimonials/${editing.id}`, { method: 'PATCH', auth: true, body: JSON.stringify(payload) });
        toast.success('Testimonial updated');
      }
      setEditing(null);
      await refetch();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  async function remove(r: Testimonial) {
    if (!window.confirm(`Delete testimonial from "${r.name}"? This cannot be undone.`)) return;
    setDeletingId(r.id);
    try {
      await api(`/admin/content/testimonials/${r.id}`, { method: 'DELETE', auth: true });
      toast.success('Testimonial deleted');
      await refetch();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'Delete failed');
    } finally {
      setDeletingId(null);
    }
  }

  if (!active) return null;
  if (loading) return <Skeletons />;

  return (
    <>
      <div className="flex items-center justify-between mb-4">
        <p className="text-[12px] text-text-muted">Customer quotes displayed on the marketing site.</p>
        <button
          type="button"
          onClick={openNew}
          className="inline-flex items-center gap-1.5 rounded-full font-display font-bold text-[13px] px-4 py-2 transition hover:opacity-90"
          style={{ background: '#00D4AA', color: '#0D0F2E' }}
        >
          <Plus size={15} aria-hidden="true" /> New testimonial
        </button>
      </div>

      {rows.length === 0 ? (
        <FormCard>
          <p className="text-center text-[13px] text-text-muted py-6">No testimonials yet. Add your first quote.</p>
        </FormCard>
      ) : (
        <Reveal>
          <div className="overflow-x-auto rounded-[11px] border bg-white">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b">
                  {['Order', 'Name', 'Role', 'Quote', 'Status', ''].map((h) => (
                    <th key={h} className="px-4 py-3 text-left text-[10.5px] font-semibold uppercase tracking-[0.04em] text-text-muted whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-b last:border-0 hover:bg-black/[0.015] transition-colors">
                    <td className="px-4 py-3 font-mono text-text-muted">{r.sort_order}</td>
                    <td className="px-4 py-3 font-semibold text-navy whitespace-nowrap">{r.name}</td>
                    <td className="px-4 py-3 text-text-muted whitespace-nowrap">{r.role}</td>
                    <td className="px-4 py-3 text-text-muted max-w-xs truncate">&ldquo;{r.quote}&rdquo;</td>
                    <td className="px-4 py-3"><StatusBadge published={r.is_published} /></td>
                    <td className="px-4 py-3">
                      <RowActions onEdit={() => openEdit(r)} onDelete={() => remove(r)} deletingId={deletingId} id={r.id} label={r.name} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Reveal>
      )}

      {editing && (
        <Modal title={editing === 'new' ? 'New testimonial' : 'Edit testimonial'} saving={saving} onClose={() => !saving && setEditing(null)} onSave={save}>
          <FormGrid columns={2}>
            <div className="md:col-span-2">
              <FormField label="Quote" htmlFor="test-quote">
                <textarea id="test-quote" className="input" rows={3} style={{ resize: 'vertical' }} value={form.quote} onChange={(e) => upd('quote', e.target.value)} />
              </FormField>
            </div>
            <FormField label="Name" htmlFor="test-name">
              <input id="test-name" type="text" className="input" value={form.name} onChange={(e) => upd('name', e.target.value)} />
            </FormField>
            <FormField label="Role / Company" htmlFor="test-role">
              <input id="test-role" type="text" className="input" value={form.role} onChange={(e) => upd('role', e.target.value)} />
            </FormField>
            <FormField label="Sort order" htmlFor="test-order">
              <input id="test-order" type="number" className="input" value={form.sort_order} onChange={(e) => upd('sort_order', Number(e.target.value))} />
            </FormField>
            <FormField label="Published" htmlFor="test-pub">
              <div className="flex h-[38px] items-center gap-2">
                <Toggle id="test-pub" checked={form.is_published} onChange={(v) => upd('is_published', v)} />
                <span className="text-[12px] text-text-muted select-none">{form.is_published ? 'Published' : 'Draft'}</span>
              </div>
            </FormField>
          </FormGrid>
        </Modal>
      )}
    </>
  );
}

// ── Page copy (Sections) tab ──────────────────────────────────────────────────

function SectionsTab({ active }: { active: boolean }) {
  const [editing, setEditing] = useState<Section | 'new' | null>(null);
  const [form, setForm] = useState<SectionForm>(EMPTY_SECTION);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const { data, isLoading: loading, refetch } = useApiQuery(
    ['admin', 'content', 'sections'],
    () => api<Section[]>('/admin/content/sections', { auth: true }),
    { enabled: active },
  );
  const rows = data ?? [];

  function openNew() {
    setForm(EMPTY_SECTION);
    setEditing('new');
  }
  function openEdit(r: Section) {
    setForm({ page: r.page, key: r.key, value: r.value, sort_order: r.sort_order, is_published: r.is_published });
    setEditing(r);
  }
  function upd<K extends keyof SectionForm>(k: K, v: SectionForm[K]) {
    setForm((p) => ({ ...p, [k]: v }));
  }

  async function save() {
    if (editing === 'new' && !form.page.trim()) { toast.error('Page is required'); return; }
    if (editing === 'new' && !form.key.trim()) { toast.error('Key is required'); return; }
    setSaving(true);
    try {
      if (editing === 'new') {
        const payload = { page: form.page.trim(), key: form.key.trim(), value: form.value, sort_order: form.sort_order, is_published: form.is_published };
        await api('/admin/content/sections', { method: 'POST', auth: true, body: JSON.stringify(payload) });
        toast.success('Page copy entry created');
      } else if (editing) {
        // page & key are immutable on edit — only send mutable fields
        const payload = { value: form.value, sort_order: form.sort_order, is_published: form.is_published };
        await api(`/admin/content/sections/${editing.id}`, { method: 'PATCH', auth: true, body: JSON.stringify(payload) });
        toast.success('Page copy updated');
      }
      setEditing(null);
      await refetch();
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : 'Save failed';
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  }

  async function remove(r: Section) {
    if (!window.confirm(`Delete "${r.page} / ${r.key}"? This cannot be undone.`)) return;
    setDeletingId(r.id);
    try {
      await api(`/admin/content/sections/${r.id}`, { method: 'DELETE', auth: true });
      toast.success('Entry deleted');
      await refetch();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'Delete failed');
    } finally {
      setDeletingId(null);
    }
  }

  const isNew = editing === 'new';

  if (!active) return null;
  if (loading) return <Skeletons />;

  return (
    <>
      <div className="flex items-center justify-between mb-4">
        <p className="text-[12px] text-text-muted">Keyed text blocks by page. Edits go live on the public site.</p>
        <button
          type="button"
          onClick={openNew}
          className="inline-flex items-center gap-1.5 rounded-full font-display font-bold text-[13px] px-4 py-2 transition hover:opacity-90"
          style={{ background: '#00D4AA', color: '#0D0F2E' }}
        >
          <Plus size={15} aria-hidden="true" /> New entry
        </button>
      </div>

      {rows.length === 0 ? (
        <FormCard>
          <p className="text-center text-[13px] text-text-muted py-6">No page copy entries yet.</p>
        </FormCard>
      ) : (
        <Reveal>
          <div className="overflow-x-auto rounded-[11px] border bg-white">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b">
                  {['Order', 'Page', 'Key', 'Value', 'Status', ''].map((h) => (
                    <th key={h} className="px-4 py-3 text-left text-[10.5px] font-semibold uppercase tracking-[0.04em] text-text-muted whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-b last:border-0 hover:bg-black/[0.015] transition-colors">
                    <td className="px-4 py-3 font-mono text-text-muted">{r.sort_order}</td>
                    <td className="px-4 py-3 font-mono text-[12px] text-navy">{r.page}</td>
                    <td className="px-4 py-3 font-mono text-[12px] text-text-muted">{r.key}</td>
                    <td className="px-4 py-3 text-text-muted max-w-xs truncate">{r.value || '—'}</td>
                    <td className="px-4 py-3"><StatusBadge published={r.is_published} /></td>
                    <td className="px-4 py-3">
                      <RowActions onEdit={() => openEdit(r)} onDelete={() => remove(r)} deletingId={deletingId} id={r.id} label={`${r.page}/${r.key}`} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Reveal>
      )}

      {editing && (
        <Modal
          title={isNew ? 'New page copy entry' : `Edit — ${(editing as Section).page} / ${(editing as Section).key}`}
          saving={saving}
          onClose={() => !saving && setEditing(null)}
          onSave={save}
        >
          <FormGrid columns={2}>
            <FormField label="Page" htmlFor="sec-page" hint={isNew ? 'e.g. "home", "pricing"' : undefined}>
              <input
                id="sec-page"
                type="text"
                className="input"
                value={form.page}
                onChange={(e) => upd('page', e.target.value)}
                disabled={!isNew}
                readOnly={!isNew}
              />
            </FormField>
            <FormField label="Key" htmlFor="sec-key" hint={isNew ? 'e.g. "hero.headline"' : undefined}>
              <input
                id="sec-key"
                type="text"
                className="input"
                value={form.key}
                onChange={(e) => upd('key', e.target.value)}
                disabled={!isNew}
                readOnly={!isNew}
              />
            </FormField>
            <div className="md:col-span-2">
              <FormField label="Value" htmlFor="sec-value">
                <textarea id="sec-value" className="input" rows={4} style={{ resize: 'vertical' }} value={form.value} onChange={(e) => upd('value', e.target.value)} />
              </FormField>
            </div>
            <FormField label="Sort order" htmlFor="sec-order">
              <input id="sec-order" type="number" className="input" value={form.sort_order} onChange={(e) => upd('sort_order', Number(e.target.value))} />
            </FormField>
            <FormField label="Published" htmlFor="sec-pub">
              <div className="flex h-[38px] items-center gap-2">
                <Toggle id="sec-pub" checked={form.is_published} onChange={(v) => upd('is_published', v)} />
                <span className="text-[12px] text-text-muted select-none">{form.is_published ? 'Published' : 'Draft'}</span>
              </div>
            </FormField>
          </FormGrid>
        </Modal>
      )}
    </>
  );
}

// ── page ──────────────────────────────────────────────────────────────────────

export default function ContentPage() {
  const [tab, setTab] = useState<TabKey>('faqs');

  return (
    <>
      <Topbar
        title="Content"
        subtitle="Marketing-site content — edits go live on the public pages"
        showPeriod={false}
      />

      <div className="p-[18px] space-y-4">
        {/* Tab bar */}
        <div
          className="flex items-center gap-1 rounded-[9px] border bg-white p-1"
          role="tablist"
          aria-label="Content sections"
          style={{ width: 'fit-content' }}
        >
          {TABS.map(({ key, label }) => {
            const active = tab === key;
            return (
              <button
                key={key}
                role="tab"
                aria-selected={active}
                type="button"
                onClick={() => setTab(key)}
                className="rounded-[7px] px-4 py-[6px] text-[12.5px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00D4AA] focus-visible:ring-offset-1"
                style={
                  active
                    ? { background: '#00D4AA', color: '#0D0F2E' }
                    : { color: '#9CA3AF' }
                }
              >
                {label}
              </button>
            );
          })}
        </div>

        {/* Tab panels */}
        <FaqsTab active={tab === 'faqs'} />
        <FeaturesTab active={tab === 'features'} />
        <TestimonialsTab active={tab === 'testimonials'} />
        <SectionsTab active={tab === 'sections'} />
      </div>
    </>
  );
}

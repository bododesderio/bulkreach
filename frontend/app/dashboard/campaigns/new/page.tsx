"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Mail,
  MessageSquare,
  Layers,
  Send,
  Info,
  Sparkles,
  CheckCircle2,
  XCircle,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { api, ApiError } from "@/lib/api";
import {
  type Channel,
  type Progress,
  type SendResponse,
  TERMINAL,
  streamProgress,
} from "@/lib/campaigns";
import { useAuth } from "@/store/auth";

interface ContactList {
  id: string;
  name: string;
  total_contacts: number;
  valid_contacts: number;
  merge_columns: string[];
  phone_column: string | null;
  email_column: string | null;
}

const CHANNELS: { key: Channel; label: string; icon: typeof Mail }[] = [
  { key: "sms", label: "SMS", icon: MessageSquare },
  { key: "email", label: "Email", icon: Mail },
  { key: "both", label: "SMS + Email", icon: Layers },
];

/** Plain-text body → minimal HTML for the email channel. Merge tags ({{tag}})
 *  pass through untouched; the backend's sandboxed Jinja env renders them. */
function bodyToHtml(text: string): string {
  const esc = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return text
    .split(/\n{2,}/)
    .map((para) => `<p>${esc(para).replace(/\n/g, "<br>")}</p>`)
    .join("\n");
}

/** Sample values used only to render the live preview. */
const SAMPLE: Record<string, string> = {
  first_name: "Grace",
  last_name: "Nakato",
  name: "Grace Nakato",
  amount: "45,000",
  balance: "45,000",
  due_date: "31 Jul",
  account: "CB-0192",
};

function sampleFor(col: string): string {
  return SAMPLE[col.toLowerCase()] ?? `[${col}]`;
}

function renderPreview(text: string): string {
  return text.replace(/\{\{\s*([\w]+)\s*\}\}/g, (_, col) => sampleFor(col));
}

/** All merge tags referenced in a template, lowercased & de-duped. */
function extractTags(text: string): string[] {
  const out = new Set<string>();
  for (const m of text.matchAll(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g)) {
    out.add(m[1].toLowerCase());
  }
  return [...out];
}

function smsSegments(len: number): number {
  if (len === 0) return 0;
  return len <= 160 ? 1 : Math.ceil(len / 153);
}

export default function CampaignComposerPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [lists, setLists] = useState<ContactList[] | null>(null);
  const [listId, setListId] = useState<string>("");
  const [name, setName] = useState("");
  const [channel, setChannel] = useState<Channel>("sms");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState(
    "Hello, your balance is due today. Thank you for banking with us."
  );
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  // Dispatch lifecycle: idle → sending → done.
  const [phase, setPhase] = useState<"idle" | "sending" | "done">("idle");
  const [savingDraft, setSavingDraft] = useState(false);
  const [progress, setProgress] = useState<Progress | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!user) return;
    api<ContactList[]>("/contacts/lists", { auth: true })
      .then((l) => {
        setLists(l);
        if (l.length) setListId(l[0].id);
      })
      .catch(() => setLists([]));
  }, [user]);

  // Tear down the SSE reader if the user navigates away mid-dispatch.
  useEffect(() => () => abortRef.current?.abort(), []);

  const selected = useMemo(
    () => lists?.find((l) => l.id === listId) ?? null,
    [lists, listId]
  );

  // Only the selected list's real columns are valid — the backend rejects any
  // unknown tag ("Unknown merge tags…"), so we never offer a fake fallback.
  const mergeTags = useMemo(
    () => Array.from(new Set(selected?.merge_columns ?? [])),
    [selected]
  );

  function insertTag(tag: string) {
    const el = bodyRef.current;
    const token = `{{${tag}}}`;
    if (!el) {
      setBody((b) => b + token);
      return;
    }
    const start = el.selectionStart ?? body.length;
    const end = el.selectionEnd ?? body.length;
    const next = body.slice(0, start) + token + body.slice(end);
    setBody(next);
    requestAnimationFrame(() => {
      el.focus();
      const pos = start + token.length;
      el.setSelectionRange(pos, pos);
    });
  }

  const showEmail = channel === "email" || channel === "both";
  const showSms = channel === "sms" || channel === "both";
  const smsLen = body.length;
  const segments = smsSegments(smsLen);
  const audience = selected?.valid_contacts ?? 0;
  const busy = phase === "sending" || savingDraft;

  const validation = useMemo<string | null>(() => {
    if (!selected) return "Pick a contact list.";
    if (!name.trim()) return "Give the campaign a name.";
    if (!body.trim()) return "Write a message.";
    if (showEmail && !subject.trim()) return "Add an email subject.";
    // Mirror the backend's merge-tag check so users see the problem before sending.
    const allowed = new Set(mergeTags.map((t) => t.toLowerCase()));
    const used = [...extractTags(body), ...(showEmail ? extractTags(subject) : [])];
    const unknown = used.filter((t) => !allowed.has(t));
    if (unknown.length) {
      const avail = mergeTags.length
        ? `Available: ${mergeTags.join(", ")}.`
        : "This list has no personalisation columns.";
      return `Unknown tag${unknown.length > 1 ? "s" : ""}: ${unknown
        .map((t) => `{{${t}}}`)
        .join(", ")}. ${avail}`;
    }
    return null;
  }, [selected, name, body, showEmail, subject, mergeTags]);

  /** CampaignCreate payload matching backend schema (Section 5.x). */
  function buildPayload() {
    const payload: Record<string, unknown> = {
      name: name.trim(),
      type: channel,
      contact_list_id: selected!.id,
    };
    if (showSms) payload.sms_body = body;
    if (showEmail) {
      payload.email_subject = subject;
      payload.email_html_body = bodyToHtml(body);
      payload.email_plain_body = body;
    }
    return payload;
  }

  async function saveDraft() {
    if (validation) return toast.error(validation);
    setSavingDraft(true);
    try {
      await api<{ id: string }>("/campaigns", {
        method: "POST",
        auth: true,
        body: JSON.stringify(buildPayload()),
      });
      toast.success("Draft saved");
      router.push("/dashboard/campaigns");
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Could not save draft");
      setSavingDraft(false);
    }
  }

  async function send() {
    if (validation) return toast.error(validation);
    setPhase("sending");
    setProgress({
      status: "queued",
      total: audience,
      sent: 0,
      failed: 0,
      pending: audience,
      pct: 0,
    });
    try {
      const created = await api<{ id: string }>("/campaigns", {
        method: "POST",
        auth: true,
        body: JSON.stringify(buildPayload()),
      });
      const res = await api<SendResponse>(`/campaigns/${created.id}/send`, {
        method: "POST",
        auth: true,
      });
      setProgress({
        status: res.status,
        total: res.queued_messages,
        sent: 0,
        failed: 0,
        pending: res.queued_messages,
        pct: 0,
      });
      toast.success(`Dispatching to ${res.recipients.toLocaleString()} recipients`);

      const ctrl = new AbortController();
      abortRef.current = ctrl;
      await streamProgress(
        created.id,
        (p) => {
          setProgress(p);
          if (TERMINAL.has(p.status)) setPhase("done");
        },
        ctrl.signal,
      );
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return;
      toast.error(e instanceof ApiError ? e.message : "Dispatch failed");
      setPhase("idle");
    }
  }

  return (
    <div className="animate-fade-up">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <Link
            href="/dashboard/campaigns"
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="h-4 w-4" /> Campaigns
          </Link>
          <h2 className="mt-2 text-2xl font-bold">New campaign</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Compose once — personalised per recipient with merge tags.
          </p>
        </div>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1.3fr_1fr]">
        {/* ---- Composer ---- */}
        <div className="space-y-5">
          {/* Name */}
          <section
            className="rounded-xl border bg-card p-5 animate-fade-up"
            style={{ animationDelay: "0.02s" }}
          >
            <label className="text-sm font-semibold" htmlFor="campaign-name">
              Campaign name
            </label>
            <p className="mb-3 text-xs text-muted-foreground">
              Internal label — recipients never see this.
            </p>
            <input
              id="campaign-name"
              type="text"
              className="input"
              placeholder="e.g. July payment reminders"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={busy}
            />
          </section>

          {/* Audience */}
          <section
            className="rounded-xl border bg-card p-5 animate-fade-up"
            style={{ animationDelay: "0.04s" }}
          >
            <label className="text-sm font-semibold">Audience</label>
            <p className="mb-3 text-xs text-muted-foreground">
              Pick an imported contact list. Counts come from your live contacts.
            </p>
            {lists === null ? (
              <div className="h-10 animate-pulse rounded-lg bg-muted" />
            ) : lists.length === 0 ? (
              <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                No contact lists yet.{" "}
                <Link href="/dashboard/contacts" className="font-medium text-primary hover:underline">
                  Import contacts
                </Link>{" "}
                first.
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-3">
                <select
                  className="input max-w-xs"
                  value={listId}
                  onChange={(e) => setListId(e.target.value)}
                >
                  {lists.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name} · {l.total_contacts.toLocaleString()} contacts
                    </option>
                  ))}
                </select>
                {selected && (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-accent px-3 py-1 text-xs font-semibold text-accent-foreground">
                    <Sparkles className="h-3.5 w-3.5" />
                    {audience.toLocaleString()} valid recipients
                  </span>
                )}
              </div>
            )}
          </section>

          {/* Channel */}
          <section
            className="rounded-xl border bg-card p-5 animate-fade-up"
            style={{ animationDelay: "0.08s" }}
          >
            <label className="text-sm font-semibold">Channel</label>
            <div className="mt-3 flex flex-wrap gap-2">
              {CHANNELS.map(({ key, label, icon: Icon }) => {
                const active = channel === key;
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setChannel(key)}
                    className={`inline-flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-semibold transition-colors ${
                      active
                        ? "border-primary bg-accent text-accent-foreground"
                        : "text-muted-foreground hover:border-primary/40"
                    }`}
                  >
                    <Icon className="h-4 w-4" /> {label}
                  </button>
                );
              })}
            </div>
          </section>

          {/* Message */}
          <section
            className="rounded-xl border bg-card p-5 animate-fade-up"
            style={{ animationDelay: "0.12s" }}
          >
            <label className="text-sm font-semibold">Message</label>

            {/* Merge tags */}
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {mergeTags.length > 0 ? (
                <>
                  <span className="text-xs text-muted-foreground">Insert tag:</span>
                  {mergeTags.map((tag) => (
                    <button
                      key={tag}
                      type="button"
                      onClick={() => insertTag(tag)}
                      className="rounded-md border bg-secondary px-2 py-0.5 font-mono text-xs text-secondary-foreground transition-colors hover:border-primary hover:text-primary"
                    >
                      {`{{${tag}}}`}
                    </button>
                  ))}
                </>
              ) : (
                <span className="text-xs text-muted-foreground">
                  This list has no personalisation columns — import a CSV with named
                  columns to use merge tags.
                </span>
              )}
            </div>

            {showEmail && (
              <input
                type="text"
                className="input mt-4"
                placeholder="Email subject"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
              />
            )}

            <textarea
              ref={bodyRef}
              className="input mt-3 min-h-[140px] resize-y font-normal leading-relaxed"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Write your message. Use merge tags for personalisation."
            />

            {showSms && (
              <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
                <span>
                  {smsLen} characters · {segments} SMS segment{segments === 1 ? "" : "s"}
                </span>
                {smsLen > 160 && <span className="text-amber">Multi-part SMS</span>}
              </div>
            )}
          </section>
        </div>

        {/* ---- Preview + actions ---- */}
        <div className="space-y-5">
          <div
            className="sticky top-4 rounded-xl border bg-card p-5 animate-fade-up"
            style={{ animationDelay: "0.16s" }}
          >
            <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
              <Sparkles className="h-4 w-4 text-primary" /> Live preview
            </div>
            <p className="mb-4 text-xs text-muted-foreground">
              Rendered for a sample recipient. Every contact gets their own values.
            </p>

            {showSms && (
              <div className="mb-4">
                <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  SMS
                </div>
                <div className="max-w-[85%] rounded-2xl rounded-tl-sm bg-accent px-4 py-2.5 text-sm text-accent-foreground">
                  {renderPreview(body) || "Your message preview…"}
                </div>
              </div>
            )}

            {showEmail && (
              <div>
                <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Email
                </div>
                <div className="rounded-lg border">
                  <div className="border-b px-4 py-2 text-sm font-semibold">
                    {subject ? renderPreview(subject) : "No subject"}
                  </div>
                  <div className="whitespace-pre-wrap px-4 py-3 text-sm leading-relaxed">
                    {renderPreview(body) || "Your message preview…"}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* ---- Dispatch: idle / sending / done ---- */}
          {phase === "idle" ? (
            <div
              className="space-y-4 animate-fade-up"
              style={{ animationDelay: "0.2s" }}
            >
              <div className="rounded-xl border border-primary/20 bg-primary/5 p-4">
                <div className="flex gap-2.5">
                  <Info className="mt-0.5 h-4 w-4 flex-shrink-0 text-primary" />
                  <p className="text-xs leading-relaxed text-muted-foreground">
                    Sending dispatches to{" "}
                    <span className="font-semibold text-foreground">
                      {audience.toLocaleString()}
                    </span>{" "}
                    valid recipients via the live provider. Each contact gets their
                    own personalised message.
                  </p>
                </div>
              </div>

              <div className="flex gap-3">
                <button
                  type="button"
                  className="btn-outline flex-1"
                  onClick={saveDraft}
                  disabled={busy}
                >
                  {savingDraft ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : null}
                  Save draft
                </button>
                <button
                  type="button"
                  className="btn-primary flex-1"
                  onClick={send}
                  disabled={busy || !!validation}
                  title={validation ?? "Send now"}
                >
                  <Send className="mr-2 h-4 w-4" /> Send now
                </button>
              </div>
              {validation && (
                <p className="text-center text-xs text-muted-foreground">
                  {validation}
                </p>
              )}
            </div>
          ) : (
            <DispatchPanel
              progress={progress}
              done={phase === "done"}
              onNew={() => {
                abortRef.current?.abort();
                setPhase("idle");
                setProgress(null);
                setName("");
                setSubject("");
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function DispatchPanel({
  progress,
  done,
  onNew,
}: {
  progress: Progress | null;
  done: boolean;
  onNew: () => void;
}) {
  const p = progress;
  const pct = p ? Math.round(p.pct) : 0;
  const failed = p?.status === "failed";
  const completed = done && !failed;

  return (
    <div className="rounded-xl border bg-card p-5 animate-fade-up">
      <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
        {completed ? (
          <CheckCircle2 className="h-4 w-4 text-primary" />
        ) : failed ? (
          <XCircle className="h-4 w-4 text-destructive" />
        ) : (
          <Loader2 className="h-4 w-4 animate-spin text-primary" />
        )}
        {completed
          ? "Campaign sent"
          : failed
            ? "Dispatch failed"
            : "Sending…"}
      </div>

      {/* Progress bar */}
      <div className="mb-1.5 flex items-center justify-between text-xs text-muted-foreground">
        <span>
          {(p?.sent ?? 0).toLocaleString()} of {(p?.total ?? 0).toLocaleString()}{" "}
          delivered
        </span>
        <span className="font-mono font-semibold text-foreground">{pct}%</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-muted">
        <div
          className={`h-full rounded-full transition-all duration-500 ${
            failed ? "bg-destructive" : "bg-primary"
          }`}
          style={{ width: `${pct}%` }}
        />
      </div>

      {/* Counters */}
      <div className="mt-4 grid grid-cols-3 gap-2 text-center">
        {[
          { label: "Sent", value: p?.sent ?? 0, tone: "text-primary" },
          { label: "Failed", value: p?.failed ?? 0, tone: "text-destructive" },
          { label: "Pending", value: p?.pending ?? 0, tone: "text-foreground" },
        ].map((c) => (
          <div key={c.label} className="rounded-lg border bg-background p-2.5">
            <div className={`text-lg font-bold ${c.tone}`}>
              {c.value.toLocaleString()}
            </div>
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
              {c.label}
            </div>
          </div>
        ))}
      </div>

      {done && (
        <div className="mt-4 flex gap-3">
          <Link href="/dashboard/reports" className="btn-outline flex-1 text-center">
            View report
          </Link>
          <button type="button" className="btn-primary flex-1" onClick={onNew}>
            New campaign
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * @author Bodo Desderio <rooiboktechltd@gmail.com>
 * @copyright 2026 Rooibok Technologies. All rights reserved.
 */
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
import { useApiQuery } from "@/lib/hooks";
import {
  type Channel,
  type Progress,
  type SendResponse,
  TERMINAL,
  streamProgress,
} from "@/lib/campaigns";
import { useAuth } from "@/store/auth";
import { Reveal } from "@/components/admin/Reveal";

const cardBase = "bg-surface border rounded-[11px] p-4";

interface ContactList {
  id: string;
  name: string;
  total_contacts: number;
  valid_contacts: number;
  merge_columns: string[];
  phone_column: string | null;
  email_column: string | null;
}

interface MessageTemplate {
  id: string;
  name: string;
  type: string;
  sms_body: string | null;
  email_subject: string | null;
  email_html_body: string | null;
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
// Tags that REQUIRE a matching column. A tag with a `|default` fallback
// ({{name|there}}) is optional, so it's never flagged as unknown.
function requiredTags(text: string): string[] {
  const out = new Set<string>();
  for (const m of text.matchAll(/\{\{\s*([a-zA-Z0-9_]+)\s*(\|[^}]*?)?\s*\}\}/g)) {
    if (!m[2]) out.add(m[1].toLowerCase());
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
  const { data: listsData } = useApiQuery(
    ["dashboard", "composer", "lists"],
    () =>
      api<ContactList[]>("/contacts/lists", { auth: true }).catch(
        () => [] as ContactList[],
      ),
    { enabled: !!user },
  );
  const lists = listsData ?? null;
  const [listIdState, setListId] = useState<string>("");
  const listId = listIdState || lists?.[0]?.id || "";
  const [name, setName] = useState("");
  const [channel, setChannel] = useState<Channel>("sms");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState(
    "Hello, your balance is due today. Thank you for banking with us.",
  );
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  // Dispatch lifecycle: idle → sending → done.
  const [phase, setPhase] = useState<"idle" | "sending" | "done">("idle");
  const [savingDraft, setSavingDraft] = useState(false);
  const [progress, setProgress] = useState<Progress | null>(null);

  // ── Message templates (save / load reusable copy) ─────────────────────────
  const { data: templates, refetch: refetchTemplates } = useApiQuery(
    ["dashboard", "templates"],
    () => api<MessageTemplate[]>("/templates", { auth: true }).catch(() => [] as MessageTemplate[]),
    { enabled: !!user },
  );
  const [savingTemplate, setSavingTemplate] = useState(false);

  function loadTemplate(id: string) {
    const t = (templates ?? []).find((x) => x.id === id);
    if (!t) return;
    setChannel(t.type as Channel);
    if (t.email_subject) setSubject(t.email_subject);
    // SMS body is plain; for email-only templates fall back to the HTML stripped to text.
    const text = t.sms_body ?? (t.email_html_body ? t.email_html_body.replace(/<[^>]+>/g, "") : "");
    if (text) setBody(text);
    toast.success(`Loaded “${t.name}”`);
  }

  async function saveTemplate() {
    const tname = window.prompt("Save this message as a template. Name:");
    if (!tname || !tname.trim()) return;
    setSavingTemplate(true);
    try {
      await api("/templates", {
        method: "POST",
        auth: true,
        body: JSON.stringify({
          name: tname.trim(),
          type: channel,
          sms_body: showSms ? body : null,
          email_subject: showEmail ? subject : null,
          email_html_body: showEmail ? bodyToHtml(body) : null,
        }),
      });
      toast.success("Template saved");
      await refetchTemplates();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Couldn't save template");
    } finally {
      setSavingTemplate(false);
    }
  }
  const abortRef = useRef<AbortController | null>(null);

  // Tear down the SSE reader if the user navigates away mid-dispatch.
  useEffect(() => () => abortRef.current?.abort(), []);

  const selected = useMemo(
    () => lists?.find((l) => l.id === listId) ?? null,
    [lists, listId],
  );

  // Only the selected list's real columns are valid — the backend rejects any
  // unknown tag ("Unknown merge tags…"), so we never offer a fake fallback.
  const mergeTags = useMemo(
    () => Array.from(new Set(selected?.merge_columns ?? [])),
    [selected],
  );

  // ── Audience segment (filter the list by contact tags) ────────────────────
  const [audienceTags, setAudienceTags] = useState<string[]>([]);
  // Tags are per-list — reset the filter when the list changes.
  useEffect(() => { setAudienceTags([]); }, [listId]);

  const { data: listTags } = useApiQuery(
    ["composer", "tags", listId],
    () =>
      api<Record<string, number>>(`/contacts/lists/${listId}/tags`, { auth: true }).catch(
        () => ({}) as Record<string, number>,
      ),
    { enabled: !!listId },
  );
  const { data: segCount } = useApiQuery(
    ["composer", "count", listId, audienceTags.join(",")],
    () =>
      api<{ count: number }>(
        `/contacts/lists/${listId}/count?tags=${encodeURIComponent(audienceTags.join(","))}`,
        { auth: true },
      ).catch(() => ({ count: 0 })),
    { enabled: !!listId && audienceTags.length > 0 },
  );
  const toggleAudienceTag = (t: string) =>
    setAudienceTags((cur) => (cur.includes(t) ? cur.filter((x) => x !== t) : [...cur, t]));

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
  const audience =
    audienceTags.length > 0 ? (segCount?.count ?? 0) : (selected?.valid_contacts ?? 0);
  const busy = phase === "sending" || savingDraft;

  const validation = useMemo<string | null>(() => {
    if (!selected) return "Pick a contact list.";
    if (!name.trim()) return "Give the campaign a name.";
    if (!body.trim()) return "Write a message.";
    if (showEmail && !subject.trim()) return "Add an email subject.";
    // Mirror the backend's merge-tag check so users see the problem before sending.
    const allowed = new Set(mergeTags.map((t) => t.toLowerCase()));
    const used = [...requiredTags(body), ...(showEmail ? requiredTags(subject) : [])];
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
      audience_tags: audienceTags,
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
    <div className="space-y-[18px]">

      {/* ── Header ────────────────────────────────────────────────────────── */}
      <Reveal>
        <Link
          href="/dashboard/campaigns"
          className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-teal hover:underline transition-colors"
        >
          <ArrowLeft size={14} aria-hidden /> Campaigns
        </Link>
        <h2 className="mt-2 font-display text-[20px] font-extrabold text-fg">
          New campaign
        </h2>
        <p className="mt-1 text-[11px] text-fg-muted">
          Compose once — personalised per recipient with merge tags.
        </p>
      </Reveal>

      {/* ── Two-column grid: composer (left) + preview/actions (right) ─────── */}
      <div className="grid gap-[18px] lg:grid-cols-[1.3fr_1fr]">

        {/* ---- Composer panels ---- */}
        <div className="space-y-[18px]">

          {/* Campaign name */}
          <Reveal delay={0.02}>
            <section className={cardBase}>
              <label
                className="text-[10.5px] font-bold uppercase tracking-[0.06em] text-fg-muted"
                htmlFor="campaign-name"
              >
                Campaign name
              </label>
              <p className="mb-3 mt-1 text-[11px] text-fg-muted">
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
          </Reveal>

          {/* Audience */}
          <Reveal delay={0.04}>
            <section className={cardBase}>
              <label className="text-[10.5px] font-bold uppercase tracking-[0.06em] text-fg-muted">
                Audience
              </label>
              <p className="mb-3 mt-1 text-[11px] text-fg-muted">
                Pick an imported contact list. Counts come from your live contacts.
              </p>
              {lists === null ? (
                <div className="h-10 animate-pulse rounded-[7px] bg-surface-2" />
              ) : lists.length === 0 ? (
                <div className="rounded-[7px] border border-dashed p-4 text-[12px] text-fg-muted">
                  No contact lists yet.{" "}
                  <Link
                    href="/dashboard/contacts"
                    className="font-semibold text-teal hover:underline"
                  >
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
                    <span
                      className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[10.5px] font-bold"
                      style={{ background: "rgba(0,212,170,0.12)", color: "#00D4AA" }}
                    >
                      <Sparkles size={12} aria-hidden />
                      {audience.toLocaleString()} valid recipients
                      {audienceTags.length > 0 && (
                        <span className="opacity-70">· segment of {selected.valid_contacts.toLocaleString()}</span>
                      )}
                    </span>
                  )}
                </div>
              )}
              {selected && listTags && Object.keys(listTags).length > 0 && (
                <div className="mt-3">
                  <div className="mb-1.5 text-[11px] font-semibold text-neutral-500">
                    Send only to contacts tagged (any of):
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {Object.entries(listTags)
                      .sort((a, b) => b[1] - a[1])
                      .map(([tag, count]) => {
                        const on = audienceTags.includes(tag);
                        return (
                          <button
                            key={tag}
                            type="button"
                            onClick={() => toggleAudienceTag(tag)}
                            aria-pressed={on}
                            className="inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-semibold transition"
                            style={
                              on
                                ? { background: "#00D4AA", borderColor: "#00D4AA", color: "#04241d" }
                                : { borderColor: "rgba(120,120,120,0.35)", color: "inherit" }
                            }
                          >
                            {tag}
                            <span className="opacity-60">{count}</span>
                          </button>
                        );
                      })}
                    {audienceTags.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setAudienceTags([])}
                        className="text-[11px] font-semibold text-neutral-500 underline"
                      >
                        clear
                      </button>
                    )}
                  </div>
                </div>
              )}
            </section>
          </Reveal>

          {/* Channel */}
          <Reveal delay={0.08}>
            <section className={cardBase}>
              <label className="text-[10.5px] font-bold uppercase tracking-[0.06em] text-fg-muted">
                Channel
              </label>
              <div className="mt-3 flex flex-wrap gap-2">
                {CHANNELS.map(({ key, label, icon: Icon }) => {
                  const active = channel === key;
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setChannel(key)}
                      className={`inline-flex items-center gap-2 rounded-[7px] border px-4 py-2 text-[12px] font-semibold transition-colors ${
                        active
                          ? "border-navy bg-navy text-white"
                          : "text-fg-muted hover:border-teal hover:text-teal"
                      }`}
                    >
                      <Icon size={14} aria-hidden /> {label}
                    </button>
                  );
                })}
              </div>
            </section>
          </Reveal>

          {/* Message body */}
          <Reveal delay={0.12}>
            <section className={cardBase}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <label className="text-[10.5px] font-bold uppercase tracking-[0.06em] text-fg-muted">
                  Message
                </label>
                {/* Template library — load a saved message or save this one */}
                <div className="flex items-center gap-2">
                  {(templates?.length ?? 0) > 0 && (
                    <select
                      aria-label="Load a saved template"
                      defaultValue=""
                      onChange={(e) => {
                        if (e.target.value) loadTemplate(e.target.value);
                        e.target.value = "";
                      }}
                      className="input text-[11px]"
                      style={{ padding: "4px 8px" }}
                    >
                      <option value="">Load template…</option>
                      {(templates ?? []).map((t) => (
                        <option key={t.id} value={t.id}>{t.name}</option>
                      ))}
                    </select>
                  )}
                  <button
                    type="button"
                    onClick={saveTemplate}
                    disabled={savingTemplate || !body.trim()}
                    className="rounded-[5px] border px-2 py-1 text-[11px] font-semibold text-fg-muted transition-colors hover:border-teal hover:text-teal disabled:opacity-40"
                  >
                    {savingTemplate ? "Saving…" : "Save as template"}
                  </button>
                </div>
              </div>

              {/* Merge tag insert buttons */}
              <div className="mt-3 flex flex-wrap items-center gap-2">
                {mergeTags.length > 0 ? (
                  <>
                    <span className="text-[11px] text-fg-muted">
                      Insert tag:
                    </span>
                    {mergeTags.map((tag) => (
                      <button
                        key={tag}
                        type="button"
                        onClick={() => insertTag(tag)}
                        className="rounded-[5px] border px-2 py-1 font-mono text-[11px] font-semibold text-fg-muted transition-colors hover:border-teal hover:text-teal"
                      >
                        {`{{${tag}}}`}
                      </button>
                    ))}
                    <span className="text-[10.5px] text-fg-muted">
                      Tip: add a fallback with <code className="font-mono">{`{{name|there}}`}</code>.
                    </span>
                  </>
                ) : (
                  <span className="text-[11px] text-fg-muted">
                    This list has no personalisation columns — import a CSV with
                    named columns to use merge tags.
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
                <div className="mt-2 flex items-center justify-between text-[10.5px] text-fg-muted">
                  <span>
                    {smsLen} characters · {segments} SMS segment
                    {segments === 1 ? "" : "s"}
                  </span>
                  {smsLen > 160 && (
                    <span className="text-amber">Multi-part SMS</span>
                  )}
                </div>
              )}
            </section>
          </Reveal>

        </div>

        {/* ---- Preview + actions ---- */}
        <div className="space-y-[18px]">

          {/* Live preview panel */}
          <Reveal delay={0.16}>
            <div className={`sticky top-4 ${cardBase}`}>
              <div className="mb-3 flex items-center gap-2">
                <Sparkles size={14} style={{ color: "#00D4AA" }} aria-hidden />
                <span className="font-display text-[14px] font-bold text-fg">
                  Live preview
                </span>
              </div>
              <p className="mb-4 text-[11px] text-fg-muted">
                Rendered for a sample recipient. Every contact gets their own
                values.
              </p>

              {showSms && (
                <div className="mb-4">
                  <div className="mb-1.5 text-[10.5px] font-bold uppercase tracking-[0.06em] text-fg-muted">
                    SMS
                  </div>
                  <div
                    className="max-w-[85%] rounded-2xl rounded-tl-sm px-4 py-2.5 text-[12px] text-fg"
                    style={{ background: "var(--bg)" }}
                  >
                    {renderPreview(body) || "Your message preview…"}
                  </div>
                </div>
              )}

              {showEmail && (
                <div>
                  <div className="mb-1.5 text-[10.5px] font-bold uppercase tracking-[0.06em] text-fg-muted">
                    Email
                  </div>
                  <div className="rounded-[7px] border">
                    <div className="border-b px-4 py-2 text-[12px] font-semibold text-fg">
                      {subject ? renderPreview(subject) : "No subject"}
                    </div>
                    <div className="whitespace-pre-wrap px-4 py-3 text-[12px] leading-relaxed text-fg-muted">
                      {renderPreview(body) || "Your message preview…"}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </Reveal>

          {/* Dispatch: idle / sending / done */}
          {phase === "idle" ? (
            <Reveal delay={0.2}>
              <div className="space-y-3">
                <div
                  className="rounded-[11px] border p-4"
                  style={{
                    borderColor: "rgba(0,212,170,0.3)",
                    background: "rgba(0,212,170,0.05)",
                  }}
                >
                  <div className="flex gap-2.5">
                    <Info
                      size={14}
                      className="mt-0.5 flex-shrink-0"
                      style={{ color: "#00D4AA" }}
                      aria-hidden
                    />
                    <p className="text-[11px] leading-relaxed text-fg-muted">
                      Sending dispatches to{" "}
                      <span className="font-semibold text-fg">
                        {audience.toLocaleString()}
                      </span>{" "}
                      valid recipients via the live provider. Each contact gets
                      their own personalised message.
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
                  <p className="text-center text-[11px] text-fg-muted">
                    {validation}
                  </p>
                )}
              </div>
            </Reveal>
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
    <div className={cardBase}>
      <div className="mb-3 flex items-center gap-2">
        {completed ? (
          <CheckCircle2 size={15} style={{ color: "#10B981" }} aria-hidden />
        ) : failed ? (
          <XCircle size={15} style={{ color: "#EF4444" }} aria-hidden />
        ) : (
          <Loader2
            size={15}
            className="animate-spin"
            style={{ color: "#00D4AA" }}
            aria-hidden
          />
        )}
        <span className="text-[13px] font-semibold text-fg">
          {completed ? "Campaign sent" : failed ? "Dispatch failed" : "Sending…"}
        </span>
      </div>

      {/* Progress bar */}
      <div className="mb-1.5 flex items-center justify-between text-[10.5px] text-fg-muted">
        <span>
          {(p?.sent ?? 0).toLocaleString()} of {(p?.total ?? 0).toLocaleString()}{" "}
          delivered
        </span>
        <span className="font-mono font-semibold text-fg">{pct}%</span>
      </div>
      <div
        className="h-1.5 overflow-hidden rounded-full"
        style={{ background: "var(--bg)" }}
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`${pct}% dispatched`}
      >
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{
            width: `${pct}%`,
            background: failed ? "#EF4444" : "#00D4AA",
          }}
        />
      </div>

      {/* Counters */}
      <div className="mt-4 grid grid-cols-3 gap-2 text-center">
        {[
          { label: "Sent", value: p?.sent ?? 0, color: "#10B981" },
          { label: "Failed", value: p?.failed ?? 0, color: "#EF4444" },
          { label: "Pending", value: p?.pending ?? 0, color: "var(--navy)" },
        ].map((c) => (
          <div
            key={c.label}
            className="rounded-[7px] border p-2.5"
            style={{ background: "var(--bg)" }}
          >
            <div
              className="font-mono text-[18px] font-semibold"
              style={{ color: c.color }}
            >
              {c.value.toLocaleString()}
            </div>
            <div className="text-[10px] font-bold uppercase tracking-[0.06em] text-fg-muted">
              {c.label}
            </div>
          </div>
        ))}
      </div>

      {done && (
        <div className="mt-4 flex gap-3">
          <Link
            href="/dashboard/reports"
            className="btn-outline flex-1 text-center"
          >
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

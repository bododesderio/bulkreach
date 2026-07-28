"use client";

import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import {
  AlertTriangle,
  CheckCircle2,
  Loader2,
  MessageSquarePlus,
} from "lucide-react";
import { toast } from "sonner";
import { api, ApiError } from "@/lib/api";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ApprovalData {
  managed_id: string;
  account_name: string;
  status: string;
  brief_text: string | null;
  copy_sms: string | null;
  copy_email_subject: string | null;
  copy_email_body: string | null;
  expires_at: string;
}

type PageState = "loading" | "invalid" | "review" | "approved" | "changes_requested";

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function ManagedApprovePage() {
  const params = useParams<{ token: string }>();
  const token = params.token;

  const [pageState, setPageState] = useState<PageState>("loading");
  const [data, setData] = useState<ApprovalData | null>(null);
  const [showChangeForm, setShowChangeForm] = useState(false);
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const noteRef = useRef<HTMLTextAreaElement>(null);

  // On mount: fetch the approval record (no auth header needed)
  useEffect(() => {
    api<ApprovalData>(`/managed-approve/${token}`)
      .then((d) => {
        setData(d);
        setPageState("review");
      })
      .catch((e) => {
        if (e instanceof ApiError && e.status === 404) {
          setPageState("invalid");
        } else {
          // Treat any other error as invalid so the client sees a friendly message
          setPageState("invalid");
        }
      });
  }, [token]);

  // Focus the textarea when the change-request form is revealed
  function revealChangeForm() {
    setShowChangeForm(true);
    // Defer one tick to allow the element to render
    setTimeout(() => noteRef.current?.focus(), 50);
  }

  async function handleApprove() {
    if (submitting) return;
    setSubmitting(true);
    try {
      await api(`/managed-approve/${token}/approve`, { method: "POST" });
      setPageState("approved");
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Could not submit approval.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleRequestChanges() {
    if (!note.trim()) {
      toast.error("Please describe the changes needed.");
      noteRef.current?.focus();
      return;
    }
    if (submitting) return;
    setSubmitting(true);
    try {
      await api(`/managed-approve/${token}/request-changes`, {
        method: "POST",
        body: JSON.stringify({ note }),
      });
      setPageState("changes_requested");
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Could not send change request.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="flex min-h-screen flex-col items-center justify-center px-4 py-12"
      style={{ background: "var(--bg)" }}
    >
      {/* ------------------------------------------------------------------ */}
      {/* Card                                                                */}
      {/* ------------------------------------------------------------------ */}
      <div
        className="w-full overflow-hidden"
        style={{
          maxWidth: "560px",
          borderRadius: "20px",
          boxShadow: "0 24px 64px rgba(0,0,0,0.10)",
          background: "white",
          border: "1px solid var(--border)",
        }}
      >
        {/* Brand header */}
        <div
          className="flex items-center justify-center px-8 py-5"
          style={{ background: "var(--navy-dark)" }}
          role="banner"
        >
          <span
            className="font-display font-bold text-[22px] tracking-tight select-none"
            style={{ color: "var(--teal)" }}
            aria-label="BulkReach"
          >
            BulkReach
          </span>
        </div>

        {/* Body */}
        <main className="px-6 py-8 sm:px-10">
          {/* --- Loading -------------------------------------------------- */}
          {pageState === "loading" && (
            <div
              className="flex min-h-[220px] items-center justify-center"
              aria-live="polite"
              aria-busy="true"
            >
              <Loader2
                className="h-7 w-7 animate-spin"
                style={{ color: "var(--teal)" }}
                aria-label="Loading your campaign copy…"
              />
            </div>
          )}

          {/* --- Invalid / expired --------------------------------------- */}
          {pageState === "invalid" && (
            <div
              className="flex flex-col items-center gap-4 py-8 text-center"
              role="alert"
            >
              <AlertTriangle
                className="h-11 w-11"
                style={{ color: "var(--amber)" }}
                aria-hidden="true"
              />
              <h1
                className="font-display font-bold text-[22px]"
                style={{ color: "var(--navy)" }}
              >
                Link unavailable
              </h1>
              <p
                className="max-w-[340px] text-[14px] leading-relaxed"
                style={{ color: "var(--text-muted)" }}
              >
                This approval link is invalid or has expired. Please contact your
                account manager to have a new link sent to you.
              </p>
            </div>
          )}

          {/* --- Approved success ---------------------------------------- */}
          {pageState === "approved" && (
            <div
              className="flex flex-col items-center gap-4 py-8 text-center"
              role="status"
              aria-live="polite"
            >
              <CheckCircle2
                className="h-12 w-12"
                style={{ color: "var(--success)" }}
                aria-hidden="true"
              />
              <h1
                className="font-display font-bold text-[22px]"
                style={{ color: "var(--navy)" }}
              >
                Copy approved
              </h1>
              <p
                className="max-w-[380px] text-[14px] leading-relaxed"
                style={{ color: "var(--text-muted)" }}
              >
                Thanks — your copy is approved. Your campaign will be scheduled
                shortly.
              </p>
            </div>
          )}

          {/* --- Change request sent ------------------------------------- */}
          {pageState === "changes_requested" && (
            <div
              className="flex flex-col items-center gap-4 py-8 text-center"
              role="status"
              aria-live="polite"
            >
              <MessageSquarePlus
                className="h-12 w-12"
                style={{ color: "var(--teal)" }}
                aria-hidden="true"
              />
              <h1
                className="font-display font-bold text-[22px]"
                style={{ color: "var(--navy)" }}
              >
                Change request sent
              </h1>
              <p
                className="max-w-[380px] text-[14px] leading-relaxed"
                style={{ color: "var(--text-muted)" }}
              >
                Thanks — we&apos;ve sent your change request to your account manager.
                They&apos;ll be in touch soon.
              </p>
            </div>
          )}

          {/* --- Review screen ------------------------------------------- */}
          {pageState === "review" && data && (
            <div className="space-y-7">
              {/* Heading */}
              <div>
                <h1
                  className="font-display font-bold text-[22px]"
                  style={{ color: "var(--navy)" }}
                >
                  Review your campaign copy
                </h1>
                <p
                  className="mt-1.5 text-[14px]"
                  style={{ color: "var(--text-muted)" }}
                >
                  {data.account_name} — please review the draft below and either
                  approve it or request changes.
                </p>
              </div>

              {/* SMS card */}
              {data.copy_sms && (
                <section aria-label="SMS copy">
                  <h2
                    className="mb-2.5 text-[11px] font-semibold uppercase tracking-widest"
                    style={{ color: "var(--teal)" }}
                  >
                    SMS
                  </h2>
                  <div
                    className="rounded-[12px] p-4"
                    style={{
                      background: "#f0fdf9",
                      border: "1.5px solid rgba(0,212,170,0.28)",
                    }}
                  >
                    {/* Phone-ish mono block */}
                    <pre
                      className="whitespace-pre-wrap break-words rounded-[8px] bg-white px-4 py-3 font-mono text-[13.5px] leading-relaxed"
                      style={{
                        border: "1px solid var(--border)",
                        color: "var(--text)",
                      }}
                    >
                      {data.copy_sms}
                    </pre>
                    <p
                      className="mt-2 text-[12px]"
                      style={{ color: "var(--text-muted)" }}
                    >
                      {data.copy_sms.length} characters
                    </p>
                  </div>
                </section>
              )}

              {/* Email card */}
              {(data.copy_email_subject || data.copy_email_body) && (
                <section aria-label="Email copy">
                  <h2
                    className="mb-2.5 text-[11px] font-semibold uppercase tracking-widest"
                    style={{ color: "var(--teal)" }}
                  >
                    Email
                  </h2>
                  <div
                    className="overflow-hidden rounded-[12px]"
                    style={{ border: "1.5px solid var(--border)" }}
                  >
                    {/* Subject row */}
                    {data.copy_email_subject && (
                      <div
                        className="flex flex-wrap items-baseline gap-2 px-5 py-3"
                        style={{
                          background: "#f7f8fc",
                          borderBottom: "1px solid var(--border)",
                        }}
                      >
                        <span
                          className="shrink-0 text-[11px] font-semibold uppercase tracking-widest"
                          style={{ color: "var(--text-muted)" }}
                        >
                          Subject
                        </span>
                        <span
                          className="font-semibold text-[15px]"
                          style={{ color: "var(--text)" }}
                        >
                          {data.copy_email_subject}
                        </span>
                      </div>
                    )}
                    {/* HTML body — client's own drafted copy */}
                    {data.copy_email_body && (
                      <div
                        className="px-5 py-4 text-[14px] leading-relaxed"
                        style={{ color: "var(--text)" }}
                        // The body is the client's own drafted campaign copy served
                        // from the managed-service backend — not user-generated input
                        // from untrusted third parties.
                        dangerouslySetInnerHTML={{ __html: data.copy_email_body }}
                      />
                    )}
                  </div>
                </section>
              )}

              {/* Brief text (informational, not approvable copy) */}
              {data.brief_text && (
                <section aria-label="Campaign brief">
                  <h2
                    className="mb-2 text-[11px] font-semibold uppercase tracking-widest"
                    style={{ color: "var(--text-muted)" }}
                  >
                    Campaign brief
                  </h2>
                  <p
                    className="text-[13px] leading-relaxed"
                    style={{ color: "var(--text-md)" }}
                  >
                    {data.brief_text}
                  </p>
                </section>
              )}

              {/* -------------------------------------------------------- */}
              {/* Action area                                               */}
              {/* -------------------------------------------------------- */}
              {!showChangeForm ? (
                /* Primary actions */
                <div className="flex flex-col gap-3 pt-1">
                  <button
                    type="button"
                    onClick={handleApprove}
                    disabled={submitting}
                    aria-busy={submitting}
                    className="btn-primary w-full text-[15px] disabled:cursor-not-allowed disabled:opacity-60"
                    style={{ height: "var(--input-height)" }}
                  >
                    {submitting ? (
                      <>
                        <Loader2
                          className="mr-2 h-4 w-4 animate-spin"
                          aria-hidden="true"
                        />
                        Approving…
                      </>
                    ) : (
                      "Approve copy"
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={revealChangeForm}
                    disabled={submitting}
                    className="btn-outline w-full text-[14px] disabled:cursor-not-allowed disabled:opacity-60"
                    style={{ height: "var(--input-height)" }}
                  >
                    Request changes
                  </button>
                </div>
              ) : (
                /* Change-request form */
                <div className="space-y-3 pt-1">
                  <div>
                    <label
                      htmlFor="change-note"
                      className="mb-1.5 block text-[13px] font-medium"
                      style={{ color: "var(--text-md)" }}
                    >
                      Describe the changes needed{" "}
                      <span style={{ color: "var(--error)" }} aria-hidden="true">
                        *
                      </span>
                    </label>
                    <textarea
                      id="change-note"
                      ref={noteRef}
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      required
                      aria-required="true"
                      rows={4}
                      placeholder="e.g. Please adjust the SMS to be more formal, and correct the product name in the second paragraph of the email…"
                      className="input resize-y text-[14px]"
                      style={{ minHeight: "100px" }}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={handleRequestChanges}
                    disabled={submitting || !note.trim()}
                    aria-busy={submitting}
                    className="btn-primary w-full text-[15px] disabled:cursor-not-allowed disabled:opacity-60"
                    style={{ height: "var(--input-height)" }}
                  >
                    {submitting ? (
                      <>
                        <Loader2
                          className="mr-2 h-4 w-4 animate-spin"
                          aria-hidden="true"
                        />
                        Sending…
                      </>
                    ) : (
                      "Send change request"
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowChangeForm(false);
                      setNote("");
                    }}
                    disabled={submitting}
                    className="btn-outline w-full text-[14px] disabled:cursor-not-allowed disabled:opacity-60"
                    style={{ height: "var(--input-height)" }}
                  >
                    Cancel
                  </button>
                </div>
              )}
            </div>
          )}
        </main>
      </div>

      {/* Footer */}
      <p className="mt-6 text-[12px]" style={{ color: "var(--text-muted)" }}>
        Powered by{" "}
        <span className="font-semibold" style={{ color: "var(--navy)" }}>
          BulkReach
        </span>
      </p>
    </div>
  );
}

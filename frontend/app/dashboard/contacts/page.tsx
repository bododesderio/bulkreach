/**
 * @author Bodo Desderio <rooiboktechltd@gmail.com>
 * @copyright 2026 Rooibok Technologies. All rights reserved.
 */
"use client";

import { useCallback, useState } from "react";
import { useDropzone } from "react-dropzone";
import { FileText, Tags, Trash2, Upload, Users } from "lucide-react";
import { toast } from "sonner";
import { api, apiUpload } from "@/lib/api";
import { useApiQuery, useApiMutation } from "@/lib/hooks";
import { useAuth } from "@/store/auth";
import { Reveal } from "@/components/admin/Reveal";
import DataTable, { Column } from "@/components/admin/DataTable";
import ContactsDrawer from "@/components/dashboard/ContactsDrawer";

const cardBase = "bg-surface border rounded-[11px] p-4";

interface ContactList {
  id: string;
  name: string;
  source_format: string | null;
  total_contacts: number;
  valid_contacts: number;
  duplicate_count: number;
  columns: string[];
  phone_column: string | null;
  email_column: string | null;
  merge_columns: string[];
  created_at: string;
}

interface ImportResult {
  list: ContactList;
  error_count: number;
  errors: string[];
  preview: Record<string, string | null>[];
}

export default function ContactsPage() {
  const { user } = useAuth();
  const [tab, setTab] = useState<"upload" | "paste">("upload");
  const [pasteName, setPasteName] = useState("");
  const [pasteText, setPasteText] = useState("");
  const [lastImport, setLastImport] = useState<ImportResult | null>(null);
  const [viewList, setViewList] = useState<ContactList | null>(null);

  const { data: listsData } = useApiQuery(
    ["dashboard", "contacts"],
    () =>
      api<ContactList[]>("/contacts/lists", { auth: true }).catch(
        () => [] as ContactList[],
      ),
    { enabled: !!user },
  );
  const lists = listsData ?? null;

  const importMut = useApiMutation(
    async (file: File) => {
      const form = new FormData();
      form.append("file", file);
      form.append("name", file.name);
      return apiUpload<ImportResult>("/contacts/upload", form);
    },
    {
      invalidate: [["dashboard", "contacts"]],
      onSuccess: (res, file) => {
        setLastImport(res);
        toast.success(
          `Imported ${res.list.valid_contacts} contacts from ${file.name}`,
        );
      },
      onError: (e) => toast.error(e instanceof Error ? e.message : "Upload failed"),
    },
  );

  const pasteMut = useApiMutation(
    (vars: { name: string; text: string }) =>
      api<ImportResult>("/contacts/paste", {
        method: "POST",
        auth: true,
        body: JSON.stringify(vars),
      }),
    {
      invalidate: [["dashboard", "contacts"]],
      onSuccess: (res) => {
        setLastImport(res);
        setPasteText("");
        setPasteName("");
        toast.success(`Imported ${res.list.valid_contacts} contacts`);
      },
      onError: (e) => toast.error(e instanceof Error ? e.message : "Import failed"),
    },
  );

  const deleteMut = useApiMutation(
    (id: string) => api(`/contacts/lists/${id}`, { method: "DELETE", auth: true }),
    {
      invalidate: [["dashboard", "contacts"]],
      onSuccess: () => toast.success("List deleted"),
      onError: (e) => toast.error(e instanceof Error ? e.message : "Delete failed"),
    },
  );

  const busy = importMut.isPending || pasteMut.isPending;

  const onDrop = useCallback(
    (files: File[]) => {
      if (!files.length) return;
      importMut.mutate(files[0]);
    },
    [importMut],
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      "text/csv": [".csv"],
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [
        ".xlsx",
      ],
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
        [".docx"],
      "application/pdf": [".pdf"],
    },
    multiple: false,
    disabled: busy,
  });

  function submitPaste() {
    if (!pasteText.trim() || !pasteName.trim()) {
      toast.error("Enter a name and some contacts");
      return;
    }
    pasteMut.mutate({ name: pasteName, text: pasteText });
  }

  function remove(list: ContactList) {
    if (
      !window.confirm(
        `Delete the list "${list.name}"? This permanently removes it and cannot be undone.`,
      )
    ) {
      return;
    }
    deleteMut.mutate(list.id);
  }

  const listColumns: Column<ContactList>[] = [
    {
      key: "name",
      label: "List",
      render: (l) => (
        <div className="flex items-center gap-2.5">
          <div
            className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg"
            style={{ background: "var(--bg)", color: "var(--navy)" }}
          >
            <FileText className="h-4 w-4" aria-hidden />
          </div>
          <span className="font-semibold text-fg">{l.name}</span>
        </div>
      ),
    },
    {
      key: "source_format",
      label: "Source",
      render: (l) => (
        <span className="text-fg-muted">{l.source_format ?? "—"}</span>
      ),
    },
    {
      key: "valid_contacts",
      label: "Contacts",
      align: "right",
      render: (l) => (
        <span className="font-mono">{l.valid_contacts.toLocaleString()}</span>
      ),
    },
    {
      key: "duplicate_count",
      label: "Dupes removed",
      align: "right",
      render: (l) => (
        <span className="font-mono text-fg-muted">
          {l.duplicate_count.toLocaleString()}
        </span>
      ),
    },
    {
      key: "actions",
      label: "",
      align: "right",
      render: (l) => (
        <div className="flex items-center justify-end gap-1.5">
          <button
            onClick={() => setViewList(l)}
            aria-label={`View & tag contacts in ${l.name}`}
            className="inline-flex items-center gap-1 rounded-[5px] border px-2 py-1 text-[11px] font-semibold text-fg-muted transition hover:text-teal hover:border-teal"
          >
            <Tags className="h-3.5 w-3.5" aria-hidden />
            Tags
          </button>
          <button
            onClick={() => remove(l)}
            disabled={deleteMut.isPending}
            aria-label={`Delete ${l.name}`}
            className="inline-flex items-center justify-center rounded-[5px] border p-1.5 text-fg-muted transition hover:text-[#EF4444] hover:border-[#EF4444]"
          >
            <Trash2 className="h-3.5 w-3.5" aria-hidden />
          </button>
        </div>
      ),
    },
  ];

  if (!user) return null;

  return (
    <div className="space-y-[18px]">

      {/* ── Description ──────────────────────────────────────────────────────── */}
      <Reveal>
        <p className="text-[12px] text-fg-muted">
          Import a contact list to send your first campaign.
        </p>
      </Reveal>

      {/* ── Import card ──────────────────────────────────────────────────────── */}
      <Reveal delay={0.1}>
        <div className="bg-surface border rounded-[11px] p-5">
          <div className="font-display text-[14px] font-bold text-fg mb-4">
            Import contacts
          </div>

          {/* Tabs */}
          <div className="mb-4 flex gap-2">
            <button
              onClick={() => setTab("upload")}
              data-testid="tab-upload"
              className="text-[12px] rounded-[7px] border font-semibold px-3 py-1.5 transition"
              style={
                tab === "upload"
                  ? {
                      background: "#1B1F4A",
                      color: "#fff",
                      borderColor: "#1B1F4A",
                    }
                  : {
                      background: "transparent",
                      color: "#6B7280",
                      borderColor: "var(--border)",
                    }
              }
            >
              Upload file
            </button>
            <button
              onClick={() => setTab("paste")}
              data-testid="tab-paste"
              className="text-[12px] rounded-[7px] border font-semibold px-3 py-1.5 transition"
              style={
                tab === "paste"
                  ? {
                      background: "#1B1F4A",
                      color: "#fff",
                      borderColor: "#1B1F4A",
                    }
                  : {
                      background: "transparent",
                      color: "#6B7280",
                      borderColor: "var(--border)",
                    }
              }
            >
              Paste
            </button>
          </div>

          {tab === "upload" ? (
            <div
              key="upload-pane"
              {...getRootProps()}
              data-testid="dropzone"
              className="flex cursor-pointer flex-col items-center justify-center rounded-[9px] border-2 border-dashed p-10 text-center transition"
              style={{
                borderColor: isDragActive ? "#00D4AA" : "var(--border)",
                background: isDragActive ? "rgba(0,212,170,0.06)" : "transparent",
              }}
            >
              <input {...getInputProps()} data-testid="file-input" />
              <div
                className="flex h-10 w-10 items-center justify-center rounded-xl"
                style={{ background: "var(--bg)", color: "var(--navy)" }}
              >
                <Upload className="h-5 w-5" aria-hidden />
              </div>
              <p className="mt-3 text-[13px] font-semibold text-fg">
                {busy ? "Importing…" : "Drop a file or click to browse"}
              </p>
              <p className="mt-1 text-[11px] text-fg-muted">
                CSV, Excel (.xlsx), Word (.docx), or PDF · max 50MB
              </p>
            </div>
          ) : (
            <div key="paste-pane" className="space-y-3">
              <input
                className="input"
                data-testid="paste-name"
                placeholder="List name (e.g. Q3 Customers)"
                value={pasteName}
                onChange={(e) => setPasteName(e.target.value)}
              />
              <textarea
                className="input min-h-[140px] font-mono"
                data-testid="paste-text"
                placeholder="Paste phone numbers or emails, one per line or comma-separated"
                value={pasteText}
                onChange={(e) => setPasteText(e.target.value)}
              />
              <button
                onClick={submitPaste}
                disabled={busy}
                data-testid="paste-submit"
                className="btn-primary"
              >
                {busy ? "Importing…" : "Import contacts"}
              </button>
            </div>
          )}

          {lastImport && (
            <div
              data-testid="import-result"
              className="mt-4 rounded-[9px] p-4 text-[12px]"
              style={{
                background: "var(--bg)",
                border: "1px solid var(--border)",
              }}
            >
              <p className="font-semibold text-fg">
                {lastImport.list.name}: {lastImport.list.valid_contacts} valid ·{" "}
                {lastImport.list.duplicate_count} duplicates ·{" "}
                {lastImport.error_count} errors
              </p>
              {lastImport.list.phone_column && (
                <p className="mt-1 text-fg-muted">
                  Detected phone: <b>{lastImport.list.phone_column}</b>
                  {lastImport.list.email_column && (
                    <>
                      {" "}
                      · email: <b>{lastImport.list.email_column}</b>
                    </>
                  )}
                  {lastImport.list.merge_columns.length > 0 && (
                    <>
                      {" "}
                      · merge tags:{" "}
                      {lastImport.list.merge_columns
                        .map((c) => `{{${c}}}`)
                        .join(", ")}
                    </>
                  )}
                </p>
              )}
            </div>
          )}
        </div>
      </Reveal>

      {/* ── Contact lists ─────────────────────────────────────────────────────── */}
      <Reveal delay={0.2}>
        <div className={cardBase}>
          <div className="font-display text-[14px] font-bold text-fg mb-3">
            Your contact lists
          </div>

          {lists === null ? (
            <div className="space-y-3 py-2">
              {[0, 1].map((i) => (
                <div
                  key={i}
                  className="h-12 animate-pulse rounded-[9px] bg-surface-2"
                />
              ))}
            </div>
          ) : lists.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-center">
              <div
                className="flex h-10 w-10 items-center justify-center rounded-xl"
                style={{ background: "rgba(0,212,170,0.12)", color: "#00D4AA" }}
              >
                <Users className="h-5 w-5" aria-hidden />
              </div>
              <p className="mt-3 font-semibold text-fg">
                No contact lists yet
              </p>
              <p className="mt-1 text-[11px] text-fg-muted">
                Import one above to get started.
              </p>
            </div>
          ) : (
            <div data-testid="lists">
              <DataTable<ContactList>
                columns={listColumns}
                rows={lists}
                rowKey={(l) => l.id}
              />
            </div>
          )}
        </div>
      </Reveal>

      {viewList && (
        <ContactsDrawer
          listId={viewList.id}
          listName={viewList.name}
          onClose={() => setViewList(null)}
        />
      )}
    </div>
  );
}

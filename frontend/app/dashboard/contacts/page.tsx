"use client";

import { useCallback, useEffect, useState } from "react";
import { useDropzone } from "react-dropzone";
import { FileText, Trash2, Upload, Users } from "lucide-react";
import { toast } from "sonner";
import { api, apiUpload } from "@/lib/api";
import { useAuth } from "@/store/auth";

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
  const [lists, setLists] = useState<ContactList[] | null>(null);
  const [tab, setTab] = useState<"upload" | "paste">("upload");
  const [pasteName, setPasteName] = useState("");
  const [pasteText, setPasteText] = useState("");
  const [busy, setBusy] = useState(false);
  const [lastImport, setLastImport] = useState<ImportResult | null>(null);

  const refresh = useCallback(async () => {
    try {
      setLists(await api<ContactList[]>("/contacts/lists", { auth: true }));
    } catch {
      setLists([]);
    }
  }, []);
  useEffect(() => {
    if (user) refresh();
  }, [user, refresh]);

  const onDrop = useCallback(
    async (files: File[]) => {
      if (!files.length) return;
      setBusy(true);
      try {
        const form = new FormData();
        form.append("file", files[0]);
        form.append("name", files[0].name);
        const res = await apiUpload<ImportResult>("/contacts/upload", form);
        setLastImport(res);
        toast.success(`Imported ${res.list.valid_contacts} contacts from ${files[0].name}`);
        refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Upload failed");
      } finally {
        setBusy(false);
      }
    },
    [refresh],
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      "text/csv": [".csv"],
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [".xlsx"],
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [".docx"],
      "application/pdf": [".pdf"],
    },
    multiple: false,
    disabled: busy,
  });

  async function submitPaste() {
    if (!pasteText.trim() || !pasteName.trim()) {
      toast.error("Enter a name and some contacts");
      return;
    }
    setBusy(true);
    try {
      const res = await api<ImportResult>("/contacts/paste", {
        method: "POST",
        auth: true,
        body: JSON.stringify({ name: pasteName, text: pasteText }),
      });
      setLastImport(res);
      setPasteText("");
      setPasteName("");
      toast.success(`Imported ${res.list.valid_contacts} contacts`);
      refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Import failed");
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    try {
      await api(`/contacts/lists/${id}`, { method: "DELETE", auth: true });
      toast.success("List deleted");
      refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Delete failed");
    }
  }

  if (!user) return null;

  return (
    <div>
      <p className="text-muted-foreground">Import a contact list to send your first campaign.</p>

      <div className="mt-6">
        {/* Import card */}
        <div className="mt-6 rounded-xl border bg-card p-6">
          <div className="mb-4 flex gap-2">
            <button
              onClick={() => setTab("upload")}
              data-testid="tab-upload"
              className={`rounded-lg px-3 py-1.5 text-sm font-medium ${tab === "upload" ? "bg-primary text-primary-foreground" : "hover:bg-accent"}`}
            >
              Upload file
            </button>
            <button
              onClick={() => setTab("paste")}
              data-testid="tab-paste"
              className={`rounded-lg px-3 py-1.5 text-sm font-medium ${tab === "paste" ? "bg-primary text-primary-foreground" : "hover:bg-accent"}`}
            >
              Paste
            </button>
          </div>

          {tab === "upload" ? (
            <div
              key="upload-pane"
              {...getRootProps()}
              data-testid="dropzone"
              className={`flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed p-10 text-center transition ${
                isDragActive ? "border-primary bg-accent" : "border-input hover:border-primary/60"
              }`}
            >
              <input {...getInputProps()} data-testid="file-input" />
              <Upload className="h-8 w-8 text-muted-foreground" />
              <p className="mt-3 font-medium">{busy ? "Importing…" : "Drop a file or click to browse"}</p>
              <p className="mt-1 text-sm text-muted-foreground">CSV, Excel (.xlsx), Word (.docx), or PDF · max 50MB</p>
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
              <button onClick={submitPaste} disabled={busy} data-testid="paste-submit" className="btn-primary">
                {busy ? "Importing…" : "Import contacts"}
              </button>
            </div>
          )}

          {lastImport && (
            <div data-testid="import-result" className="mt-5 rounded-lg border bg-background p-4 text-sm">
              <p className="font-semibold">
                {lastImport.list.name}: {lastImport.list.valid_contacts} valid ·{" "}
                {lastImport.list.duplicate_count} duplicates · {lastImport.error_count} errors
              </p>
              {lastImport.list.phone_column && (
                <p className="mt-1 text-muted-foreground">
                  Detected phone: <b>{lastImport.list.phone_column}</b>
                  {lastImport.list.email_column && <> · email: <b>{lastImport.list.email_column}</b></>}
                  {lastImport.list.merge_columns.length > 0 && (
                    <> · merge tags: {lastImport.list.merge_columns.map((c) => `{{${c}}}`).join(", ")}</>
                  )}
                </p>
              )}
            </div>
          )}
        </div>

        {/* Lists */}
        <h2 className="mt-10 text-lg font-semibold">Your contact lists</h2>
        {lists === null ? (
          <div className="mt-4 space-y-3">
            {[0, 1].map((i) => (
              <div key={i} className="h-16 animate-pulse rounded-xl border bg-card" />
            ))}
          </div>
        ) : lists.length === 0 ? (
          <div className="mt-4 rounded-xl border bg-card p-10 text-center text-muted-foreground">
            No contact lists yet. Import one above to get started.
          </div>
        ) : (
          <div className="mt-4 space-y-3" data-testid="lists">
            {lists.map((l) => (
              <div key={l.id} className="flex items-center justify-between rounded-xl border bg-card p-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent text-accent-foreground">
                    <FileText className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="font-medium">{l.name}</p>
                    <p className="text-sm text-muted-foreground">
                      <Users className="mr-1 inline h-3.5 w-3.5" />
                      {l.valid_contacts} contacts · {l.source_format ?? "—"}
                      {l.duplicate_count > 0 && ` · ${l.duplicate_count} dupes removed`}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => remove(l.id)}
                  aria-label={`Delete ${l.name}`}
                  className="rounded-lg p-2 text-muted-foreground transition hover:bg-destructive/10 hover:text-destructive"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

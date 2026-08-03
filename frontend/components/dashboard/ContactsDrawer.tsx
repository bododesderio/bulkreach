/**
 * @author Bodo Desderio <rooiboktechltd@gmail.com>
 * @copyright 2026 Rooibok Technologies. All rights reserved.
 */
"use client";

import { useState } from "react";
import { Tag, X } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { useApiQuery, useApiMutation } from "@/lib/hooks";
import { Modal } from "@/components/ui/Modal";

interface Row {
  id: string;
  phone: string | null;
  email: string | null;
  is_valid: boolean;
  tags: string[];
}

interface Paginated {
  items: Row[];
  total: number;
}

/** Editable tag chips for a single contact; PATCHes the whole tag set on change. */
function TagCell({ listId, row }: { listId: string; row: Row }) {
  const [tags, setTags] = useState<string[]>(row.tags ?? []);
  const [draft, setDraft] = useState("");

  const save = useApiMutation(
    (next: string[]) =>
      api<Row>(`/contacts/lists/${listId}/contacts/${row.id}`, {
        method: "PATCH",
        auth: true,
        body: JSON.stringify({ tags: next }),
      }),
    {
      onError: (e) => toast.error(e instanceof Error ? e.message : "Could not save tags"),
    },
  );

  function commit(next: string[]) {
    setTags(next);
    save.mutate(next);
  }

  function add() {
    const t = draft.trim().toLowerCase();
    if (!t || tags.includes(t)) {
      setDraft("");
      return;
    }
    commit([...tags, t].slice(0, 20));
    setDraft("");
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {tags.map((t) => (
        <span
          key={t}
          className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10.5px] font-semibold"
          style={{ background: "rgba(0,212,170,0.12)", color: "#00A98A" }}
        >
          {t}
          <button
            type="button"
            aria-label={`Remove tag ${t}`}
            onClick={() => commit(tags.filter((x) => x !== t))}
            className="opacity-60 hover:opacity-100"
          >
            <X size={11} aria-hidden />
          </button>
        </span>
      ))}
      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            add();
          }
        }}
        onBlur={add}
        placeholder="+ tag"
        aria-label={`Add tag to ${row.phone ?? row.email ?? "contact"}`}
        className="w-16 rounded-full border px-2 py-0.5 text-[10.5px] outline-none focus:border-teal"
        style={{ borderColor: "var(--border)" }}
      />
    </div>
  );
}

export default function ContactsDrawer({
  listId,
  listName,
  onClose,
}: {
  listId: string;
  listName: string;
  onClose: () => void;
}) {
  const [bulkTag, setBulkTag] = useState("");

  const { data, refetch, isFetching } = useApiQuery(
    ["dashboard", "contacts", listId, "rows"],
    () =>
      api<Paginated>(`/contacts/lists/${listId}/rows?page_size=200`, {
        auth: true,
      }).catch(() => ({ items: [], total: 0 }) as Paginated),
    { enabled: !!listId },
  );

  const tagAll = useApiMutation(
    (tag: string) =>
      api<{ tagged: number }>(`/contacts/lists/${listId}/tags`, {
        method: "POST",
        auth: true,
        body: JSON.stringify({ tag }),
      }),
    {
      onSuccess: (res) => {
        toast.success(`Tagged ${res.tagged} contact${res.tagged === 1 ? "" : "s"}`);
        setBulkTag("");
        refetch();
      },
      onError: (e) => toast.error(e instanceof Error ? e.message : "Could not tag list"),
    },
  );

  const rows = data?.items ?? [];

  return (
    <Modal open onClose={onClose} title={`Contacts · ${listName}`} size="lg">
      {/* Tag everyone at once */}
      <div className="mb-4 flex flex-wrap items-end gap-2 rounded-[9px] border p-3">
        <div className="flex-1 min-w-[180px]">
          <label className="mb-1 block text-[11px] font-semibold text-text-muted">
            Tag every valid contact in this list
          </label>
          <div className="flex items-center gap-2">
            <Tag size={14} className="text-text-muted" aria-hidden />
            <input
              value={bulkTag}
              onChange={(e) => setBulkTag(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && bulkTag.trim()) tagAll.mutate(bulkTag.trim().toLowerCase());
              }}
              placeholder="e.g. vip"
              className="input flex-1"
            />
          </div>
        </div>
        <button
          type="button"
          onClick={() => bulkTag.trim() && tagAll.mutate(bulkTag.trim().toLowerCase())}
          disabled={!bulkTag.trim() || tagAll.isPending}
          className="btn-primary"
        >
          {tagAll.isPending ? "Tagging…" : "Tag all"}
        </button>
      </div>

      {/* Rows */}
      <div className="max-h-[52vh] overflow-y-auto">
        {isFetching && rows.length === 0 ? (
          <div className="space-y-2 py-2">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-10 animate-pulse rounded-[9px] bg-bg" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <p className="py-8 text-center text-[12px] text-text-muted">
            No contacts in this list.
          </p>
        ) : (
          <table className="w-full text-[12px]">
            <thead>
              <tr className="text-left text-text-muted">
                <th className="pb-2 font-semibold">Contact</th>
                <th className="pb-2 font-semibold">Tags</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t align-top">
                  <td className="py-2 pr-3">
                    <div className="font-medium text-navy">{r.phone ?? "—"}</div>
                    {r.email && (
                      <div className="text-[11px] text-text-muted break-all">{r.email}</div>
                    )}
                  </td>
                  <td className="py-2">
                    <TagCell listId={listId} row={r} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <p className="mt-3 text-[11px] text-text-muted">
        Showing up to 200 contacts. Tags feed the composer&apos;s audience segment filter.
      </p>
    </Modal>
  );
}

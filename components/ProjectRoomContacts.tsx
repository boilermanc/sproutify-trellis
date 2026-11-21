import React, { useEffect, useState } from "react";
import { Mail, Phone, Plus, Star } from "lucide-react";
import {
  callRoom,
  type ClientContact,
  type RoomClient,
} from "../services/projectRoomService";

export default function ProjectRoomContacts(
  { client, onSaved, onReload, onError }: {
    client: RoomClient;
    onSaved: () => Promise<void>;
    onReload: () => Promise<void>;
    onError: (message: string) => void;
  },
) {
  const [contacts, setContacts] = useState<ClientContact[]>(
    client.contacts || [],
  );
  const [version, setVersion] = useState(client.version);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!dirty) {
      setContacts(client.contacts || []);
      setVersion(client.version);
    }
  }, [client.contacts, client.version, dirty]);
  function change(id: string, patch: Partial<ClientContact>) {
    setContacts((items) =>
      items.map((c) =>
        c.id === id
          ? { ...c, ...patch }
          : patch.is_primary
          ? { ...c, is_primary: false }
          : c
      )
    );
    setDirty(true);
    setError("");
  }
  async function save() {
    setBusy(true);
    setError("");
    try {
      const result = await callRoom<{ client: RoomClient }>(
        "client_contacts_save",
        {
          client_id: client.id,
          client_version: version,
          contacts,
        },
      );
      setContacts(result.client.contacts || []);
      setVersion(result.client.version);
      // Refresh before clearing dirty so an older parent snapshot cannot replace the save.
      await onSaved();
      setDirty(false);
      setEditing(null);
    } catch (e) {
      const message = (e as Error).message;
      setError(message);
      onError(message);
    } finally {
      setBusy(false);
    }
  }
  const stale = dirty && version !== client.version;
  return (
    <section className="pr-panel" aria-label="Client contacts">
      <h2>Client contacts</h2>
      <p className="pr-muted">
        People at {client.name}, shared across this company’s projects.
      </p>
      <div className="pr-actions">
        <button
          className="pr-button"
          disabled={busy || contacts.length >= 30}
          onClick={() => {
            const id = crypto.randomUUID();
            setContacts(
              (items) => [...items, {
                id,
                name: "",
                role: "",
                email: "",
                phone: "",
                notes: "",
                archived: false,
                is_primary: !items.some((c) => !c.archived),
              }],
            );
            setEditing(id);
            setDirty(true);
          }}
        >
          <Plus size={16} />Add contact
        </button>
        {contacts.some((c) => c.archived) && (
          <button
            className="pr-button"
            onClick={() => setShowArchived(!showArchived)}
          >
            {showArchived ? "Hide archived contacts" : "Show archived contacts"}
          </button>
        )}
      </div>
      {!contacts.some((c) => !c.archived) && (
        <p className="pr-muted">
          No active contacts yet. Add the person you work with at this company.
        </p>
      )}
      <div className="pr-stack">
        {contacts.filter((c) => showArchived || !c.archived).map((c) => (
          <article
            className="rounded-xl border border-slate-200 p-4 min-w-0"
            key={c.id}
          >
            {editing === c.id
              ? (
                <fieldset disabled={busy} className="pr-stack">
                  <legend className="font-semibold">Edit contact</legend>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {(["name", "role", "email", "phone"] as const).map(
                      (field) => (
                        <label className="pr-field" key={field}>
                          {{
                            name: "Contact name",
                            role: "Role / job title",
                            email: "Contact email",
                            phone: "Contact phone",
                          }[field]}
                          <input
                            className="w-full min-w-0 rounded-lg border p-3"
                            type={field === "email"
                              ? "email"
                              : field === "phone"
                              ? "tel"
                              : "text"}
                            maxLength={field === "email"
                              ? 254
                              : field === "phone"
                              ? 60
                              : 140}
                            value={c[field]}
                            onChange={(e) =>
                              change(c.id, { [field]: e.target.value })}
                          />
                        </label>
                      ),
                    )}
                  </div>
                  <label className="pr-field">
                    Contact notes<textarea
                      className="w-full rounded-lg border p-3"
                      rows={3}
                      maxLength={2000}
                      value={c.notes}
                      onChange={(e) => change(c.id, { notes: e.target.value })}
                    />
                  </label>
                  <label className="flex gap-2 items-center">
                    <input
                      type="checkbox"
                      checked={c.is_primary}
                      disabled={c.archived}
                      onChange={(e) =>
                        change(c.id, { is_primary: e.target.checked })}
                    />Primary contact
                  </label>
                  <button
                    className="pr-button"
                    onClick={() => setEditing(null)}
                  >
                    Close contact editor
                  </button>
                </fieldset>
              )
              : (
                <>
                  <h3 className="font-bold break-words">
                    {c.name || "New contact"}{" "}
                    {c.is_primary && (
                      <span className="pr-tag">
                        <Star size={12} /> Primary
                      </span>
                    )} {c.archived && <span className="pr-tag">Archived</span>}
                  </h3>
                  {c.role && <p className="pr-muted break-words">{c.role}</p>}
                  {c.email && (
                    <a
                      className="flex items-center gap-2 break-all text-blue-700 py-2"
                      href={`mailto:${encodeURIComponent(c.email)}`}
                    >
                      <Mail size={15} className="shrink-0" />
                      {c.email}
                    </a>
                  )}
                  {c.phone && (
                    <a
                      className="flex items-center gap-2 break-all text-blue-700 py-2"
                      href={`tel:${c.phone.replace(/[^+0-9]/g, "")}`}
                    >
                      <Phone size={15} />
                      {c.phone}
                    </a>
                  )}
                  {c.notes && (
                    <p className="whitespace-pre-wrap break-words text-sm">
                      {c.notes}
                    </p>
                  )}
                  <div className="pr-actions">
                    <button
                      className="pr-button"
                      disabled={busy}
                      onClick={() => setEditing(c.id)}
                    >
                      Edit {c.name || "contact"}
                    </button>
                    <button
                      className="pr-button"
                      disabled={busy}
                      onClick={() =>
                        change(c.id, {
                          archived: !c.archived,
                          is_primary: false,
                        })}
                    >
                      {c.archived ? "Restore contact" : "Archive contact"}
                    </button>
                  </div>
                </>
              )}
          </article>
        ))}
      </div>
      {dirty && (
        <p className="pr-muted" role="status">
          You have unsaved contact changes.
        </p>
      )}
      {stale && (
        <p role="alert">
          Company details changed while you were editing. Reload saved contacts
          before editing again.
        </p>
      )}
      {error && <p role="alert" className="text-red-700">{error}</p>}
      <div className="pr-actions">
        <button
          className="pr-button pr-primary"
          disabled={!dirty || busy || stale}
          onClick={save}
        >
          {busy ? "Saving contacts…" : "Save contacts"}
        </button>
        {dirty && (
          <button
            className="pr-button"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await onReload();
                setDirty(false);
                setEditing(null);
                setError("");
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            Discard edits and reload contacts
          </button>
        )}
      </div>
    </section>
  );
}

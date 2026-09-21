"use client";

import React from "react";
import { Button, Modal } from "@devdigest/ui";

export interface ConfirmModalProps {
  title: string;
  body: React.ReactNode;
  confirmLabel: string;
  cancelLabel: string;
  /** Destructive confirmations (delete) use the danger style. */
  danger?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}

/** Confirm / cancel / ✕ dialog. Callers mount it only while a confirmation is pending. */
export function ConfirmModal({
  title,
  body,
  confirmLabel,
  cancelLabel,
  danger,
  busy,
  onConfirm,
  onClose,
}: ConfirmModalProps) {
  return (
    <Modal
      width={440}
      title={title}
      onClose={onClose}
      footer={
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, width: "100%" }}>
          <Button kind="ghost" onClick={onClose} disabled={busy}>
            {cancelLabel}
          </Button>
          <Button kind={danger ? "danger" : "primary"} onClick={onConfirm} loading={busy} disabled={busy}>
            {confirmLabel}
          </Button>
        </div>
      }
    >
      <div style={{ padding: "18px 22px", fontSize: 13.5, lineHeight: 1.5, color: "var(--text-secondary)" }}>{body}</div>
    </Modal>
  );
}

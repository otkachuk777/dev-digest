-- pr_intent is a derived cache (re-computed on the next review run / Re-derive).
-- Rows written by older branches lack head_sha/model/confidence, which the next
-- migration adds as NOT NULL — clear them first so it applies on any DB.
DELETE FROM "pr_intent";

-- Migration 0022: Firebase Auth integration columns.
--
-- Adds:
--   users.firebase_uid        -- the Firebase Auth UID, links to our UUID
--   users.email_verified     -- mirror of Firebase Auth's email_verified
--   users.last_seen_at       -- for inbox unread counts
--   products.image_url_signed -- canonical public URL (set by the
--                                Storage signed-URL endpoint; nullable
--                                for backward-compat with image_url)
--   chat_messages.attachment_url  -- nullable media URL (image/file)
--   chat_messages.attachment_mime -- nullable mime type
--   chat_messages.thread_parent_id -- nullable for reply threads
--   chat_messages.deleted_at       -- soft-delete
--   chat_messages.read_by          -- JSONB array of uids that have read
--
-- The Firebase Auth user is the new source of identity. The existing
-- phone/email+password user table stays for backward compat — new
-- users via Firebase are auto-provisioned into users with role='buyer'
-- by the auth-middleware.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS firebase_uid TEXT,
  ADD COLUMN IF NOT EXISTS email_verified BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ;

-- Unique partial index — one row per firebase UID, but allow NULL
-- (legacy phone/password users have no firebase_uid).
CREATE UNIQUE INDEX IF NOT EXISTS users_firebase_uid_uidx
  ON users(firebase_uid)
  WHERE firebase_uid IS NOT NULL;

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS image_url_signed TEXT;

ALTER TABLE chat_messages
  ADD COLUMN IF NOT EXISTS attachment_url TEXT,
  ADD COLUMN IF NOT EXISTS attachment_mime TEXT,
  ADD COLUMN IF NOT EXISTS thread_parent_id UUID REFERENCES chat_messages(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS read_by JSONB NOT NULL DEFAULT '[]'::jsonb;

CREATE INDEX IF NOT EXISTS chat_messages_thread_parent_idx
  ON chat_messages(thread_parent_id)
  WHERE thread_parent_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS chat_messages_session_created_idx
  ON chat_messages(session_id, created_at DESC);

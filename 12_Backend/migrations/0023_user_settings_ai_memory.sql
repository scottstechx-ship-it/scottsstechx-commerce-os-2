-- Migration 0023: per-user settings + AI personalisation table.
--
-- Creates:
--   user_settings  -- one row per user, flat key/value layout
--   ai_personalization -- one row per user, JSONB columns for
--                          categories, recent searches, etc.

CREATE TABLE IF NOT EXISTS user_settings (
  user_id                      uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  theme                        text NOT NULL DEFAULT 'system',
  language                     text NOT NULL DEFAULT 'en',
  notifications_enabled        boolean NOT NULL DEFAULT TRUE,
  notification_sound           boolean NOT NULL DEFAULT TRUE,
  location_sharing             text NOT NULL DEFAULT 'approximate'
                                  CHECK (location_sharing IN ('off','approximate','precise')),
  privacy_show_receipts        boolean NOT NULL DEFAULT TRUE,
  privacy_show_transactions    boolean NOT NULL DEFAULT TRUE,
  ai_personalization_enabled   boolean NOT NULL DEFAULT TRUE,
  preferred_language           text NOT NULL DEFAULT 'en',
  preferred_currency           text NOT NULL DEFAULT 'UGX',
  created_at                   timestamptz NOT NULL DEFAULT NOW(),
  updated_at                   timestamptz NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ai_personalization (
  user_id          uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  recent_searches  text[] NOT NULL DEFAULT '{}',
  top_categories   text[] NOT NULL DEFAULT '{}',
  followed_sellers text[] NOT NULL DEFAULT '{}',
  price_low_minor  bigint,
  price_high_minor bigint,
  ai_open_count    integer NOT NULL DEFAULT 0,
  cleared_at        timestamptz,
  created_at        timestamptz NOT NULL DEFAULT NOW(),
  updated_at        timestamptz NOT NULL DEFAULT NOW()
);

-- RLS for user_settings
ALTER TABLE user_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_settings FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS user_settings_self ON user_settings;
CREATE POLICY user_settings_self ON user_settings
  USING (user_id::text = current_setting('app.user_id', true));

ALTER TABLE ai_personalization ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_personalization FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ai_personalization_self ON ai_personalization;
CREATE POLICY ai_personalization_self ON ai_personalization
  USING (user_id::text = current_setting('app.user_id', true));

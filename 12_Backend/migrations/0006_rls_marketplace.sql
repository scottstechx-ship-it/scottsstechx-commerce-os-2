-- 0006_rls_marketplace.sql
-- ScottsTechX marketplace RLS policies.
--
-- Pattern matches 0002_rls.sql: identity comes from
-- current_setting('app.user_id', true)::uuid which the JWT middleware
-- sets via withTransaction() in db.ts. Anonymous context is the empty
-- string, so any predicate that doesn't match produces zero rows.
--
-- The `app` role here is the cluster superuser (embedded-postgres uses
-- a single connection role for tests). Tests that need to verify RLS
-- behavior must SET LOCAL ROLE rls_tester; see test/rls-marketplace.test.ts.

-- =========================================================
-- Helper: is the current session a particular user?
-- =========================================================
-- (We re-use the same predicate style as 0002_rls.sql. Policies below
-- use INLINE expressions to avoid creating a SQL function the migrator
-- doesn't have permission for in every cluster config.)

-- =========================================================
-- seller_profiles — read public, write own
-- =========================================================
ALTER TABLE seller_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE seller_profiles FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS seller_profiles_read_all ON seller_profiles;
CREATE POLICY seller_profiles_read_all ON seller_profiles
  FOR SELECT
  USING (true);

DROP POLICY IF EXISTS seller_profiles_update_own ON seller_profiles;
CREATE POLICY seller_profiles_update_own ON seller_profiles
  FOR UPDATE
  USING (user_id::text = current_setting('app.user_id', true))
  WITH CHECK (user_id::text = current_setting('app.user_id', true));

DROP POLICY IF EXISTS seller_profiles_insert_self ON seller_profiles;
CREATE POLICY seller_profiles_insert_self ON seller_profiles
  FOR INSERT
  WITH CHECK (user_id::text = current_setting('app.user_id', true));

-- =========================================================
-- product_media — anyone reads, only the product's seller writes
-- =========================================================
ALTER TABLE product_media ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_media FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS product_media_read_all ON product_media;
CREATE POLICY product_media_read_all ON product_media
  FOR SELECT
  USING (true);

DROP POLICY IF EXISTS product_media_write_own ON product_media;
CREATE POLICY product_media_write_own ON product_media
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM products p
       WHERE p.id = product_media.product_id
         AND p.seller_id::text = current_setting('app.user_id', true)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM products p
       WHERE p.id = product_media.product_id
         AND p.seller_id::text = current_setting('app.user_id', true)
    )
  );

-- =========================================================
-- seller_reviews — anyone authenticated may insert their own;
-- read all; only the reviewer may update or delete their own.
-- =========================================================
ALTER TABLE seller_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE seller_reviews FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS seller_reviews_read_all ON seller_reviews;
CREATE POLICY seller_reviews_read_all ON seller_reviews
  FOR SELECT
  USING (true);

DROP POLICY IF EXISTS seller_reviews_insert_self ON seller_reviews;
CREATE POLICY seller_reviews_insert_self ON seller_reviews
  FOR INSERT
  WITH CHECK (reviewer_user_id::text = current_setting('app.user_id', true));

DROP POLICY IF EXISTS seller_reviews_modify_own ON seller_reviews;
CREATE POLICY seller_reviews_modify_own ON seller_reviews
  FOR UPDATE
  USING (reviewer_user_id::text = current_setting('app.user_id', true))
  WITH CHECK (reviewer_user_id::text = current_setting('app.user_id', true));

DROP POLICY IF EXISTS seller_reviews_delete_own ON seller_reviews;
CREATE POLICY seller_reviews_delete_own ON seller_reviews
  FOR DELETE
  USING (reviewer_user_id::text = current_setting('app.user_id', true));

-- =========================================================
-- chat_messages — only sender or recipient may read; sender sets
-- sender_user_id on insert.
-- =========================================================
ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_messages FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS chat_messages_read_participants ON chat_messages;
CREATE POLICY chat_messages_read_participants ON chat_messages
  FOR SELECT
  USING (
    sender_user_id::text = current_setting('app.user_id', true)
    OR recipient_user_id::text = current_setting('app.user_id', true)
  );

DROP POLICY IF EXISTS chat_messages_insert_self ON chat_messages;
CREATE POLICY chat_messages_insert_self ON chat_messages
  FOR INSERT
  WITH CHECK (sender_user_id::text = current_setting('app.user_id', true));

-- =========================================================
-- ai_suggestions — sellers read their own; service role may insert
-- (via SECURITY DEFINER trigger would be cleaner but the in-process
-- model puts the LLM call inside the user's JWT context so the same
-- rule works).
-- =========================================================
ALTER TABLE ai_suggestions ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_suggestions FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ai_suggestions_read_own_seller ON ai_suggestions;
CREATE POLICY ai_suggestions_read_own_seller ON ai_suggestions
  FOR SELECT
  USING (
    seller_id::text = current_setting('app.user_id', true)
    OR user_id::text = current_setting('app.user_id', true)
  );

DROP POLICY IF EXISTS ai_suggestions_insert_self ON ai_suggestions;
CREATE POLICY ai_suggestions_insert_self ON ai_suggestions
  FOR INSERT
  WITH CHECK (
    (seller_id IS NOT NULL AND seller_id::text = current_setting('app.user_id', true))
    OR (user_id IS NOT NULL AND user_id::text = current_setting('app.user_id', true))
  );

DROP POLICY IF EXISTS ai_suggestions_update_own ON ai_suggestions;
CREATE POLICY ai_suggestions_update_own ON ai_suggestions
  FOR UPDATE
  USING (
    seller_id::text = current_setting('app.user_id', true)
    OR user_id::text = current_setting('app.user_id', true)
  )
  WITH CHECK (
    seller_id::text = current_setting('app.user_id', true)
    OR user_id::text = current_setting('app.user_id', true)
  );

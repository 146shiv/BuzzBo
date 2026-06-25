-- Rich comment log fields for Electron activity panel
ALTER TABLE commented_posts
  ADD COLUMN IF NOT EXISTS post_url TEXT,
  ADD COLUMN IF NOT EXISTS comment_text TEXT;

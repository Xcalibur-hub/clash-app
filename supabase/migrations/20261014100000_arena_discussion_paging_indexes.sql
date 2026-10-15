-- Local migration only. Optimizes paged root threads and direct replies.
-- RLS / moderation policy is unchanged; do not deploy to quarantined hosted staging.
create index if not exists comments_discussion_roots_new_idx
  on public.comments (take_id, created_at desc, id desc)
  where is_removed = false and parent_comment_id is null;

create index if not exists comments_discussion_roots_best_idx
  on public.comments (take_id, upvotes_count desc, created_at desc, id desc)
  where is_removed = false and parent_comment_id is null;

create index if not exists comments_discussion_replies_new_idx
  on public.comments (take_id, parent_comment_id, created_at desc, id desc)
  where is_removed = false and parent_comment_id is not null;

create index if not exists comments_discussion_replies_best_idx
  on public.comments (take_id, parent_comment_id, upvotes_count desc, created_at desc, id desc)
  where is_removed = false and parent_comment_id is not null;

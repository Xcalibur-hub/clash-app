-- Phase: Arena expressive media (saved, trending memes, reaction palette)
begin;
select no_plan();

select has_function('public', 'toggle_arena_saved_expressive_media', 'toggle saved exists');
select has_function('public', 'list_arena_saved_expressive_media', 'list saved exists');
select has_function('public', 'list_trending_clash_memes', 'trending memes exists');
select has_function('public', 'post_arena_clash_media_reshare', 'meme reshare exists');

select is(
  has_table_privilege('authenticated', 'public.arena_saved_expressive_media', 'SELECT'),
  false,
  'saved table is not directly readable'
);

select ok(
  '😂' = any (public.arena_reaction_vocabulary()),
  'quick reaction emoji is in server vocabulary'
);

select ok(
  '🫡' = any (public.arena_reaction_vocabulary()),
  'salute emoji is in server vocabulary'
);

select * from finish();
rollback;

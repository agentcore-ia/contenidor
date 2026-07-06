-- Track background image-render failures so the dashboard can surface them
-- instead of a post silently staying in "generated" with no image.
alter table generated_posts add column if not exists render_error text;

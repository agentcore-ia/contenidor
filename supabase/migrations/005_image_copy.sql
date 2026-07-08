-- Dedicated short copy for the visual piece: the long-form hook/body stays in
-- the caption, while the render only carries a punchy headline and an
-- optional 1-2 line subline.
alter table generated_posts add column if not exists image_headline text;
alter table generated_posts add column if not exists image_subline text;

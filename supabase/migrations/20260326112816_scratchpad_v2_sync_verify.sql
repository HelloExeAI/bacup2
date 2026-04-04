drop trigger if exists "trg_blocks_set_updated_at" on "public"."blocks";

drop trigger if exists "trg_pages_set_updated_at" on "public"."pages";

drop function if exists "public"."bacup_set_updated_at"();

drop index if exists "public"."blocks_user_date_parent_order_idx";

drop index if exists "public"."blocks_user_page_parent_order_idx";

drop index if exists "public"."blocks_user_updated_at_idx";

alter table "public"."blocks" drop column "client_updated_at";

alter table "public"."blocks" drop column "deleted_at";

alter table "public"."blocks" drop column "updated_at";

alter table "public"."pages" drop column "updated_at";



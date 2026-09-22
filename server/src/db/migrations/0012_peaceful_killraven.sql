ALTER TABLE "conventions" ADD COLUMN "category" text;--> statement-breakpoint
ALTER TABLE "conventions" ADD COLUMN "evidence_start" integer;--> statement-breakpoint
ALTER TABLE "conventions" ADD COLUMN "evidence_end" integer;--> statement-breakpoint
ALTER TABLE "conventions" ADD COLUMN "evidence_sha" text;--> statement-breakpoint
ALTER TABLE "conventions" ADD COLUMN "sample_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "conventions" ADD COLUMN "created_at" timestamp with time zone DEFAULT now() NOT NULL;
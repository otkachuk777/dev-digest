CREATE TABLE "eval_case_results" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" uuid NOT NULL,
	"case_id" uuid,
	"case_name" text NOT NULL,
	"result" jsonb NOT NULL,
	"status" text NOT NULL,
	CONSTRAINT "eval_case_results_result_object" CHECK (jsonb_typeof("eval_case_results"."result") = 'object')
);
--> statement-breakpoint
CREATE TABLE "eval_cases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"agent_id" uuid NOT NULL,
	"name" text NOT NULL,
	"expectation_type" text NOT NULL,
	"expected" jsonb NOT NULL,
	"input_diff" text NOT NULL,
	"input_meta" jsonb NOT NULL,
	"source_finding_id" uuid,
	"source_decision" text,
	"last_result" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "eval_cases_expected_array" CHECK (jsonb_typeof("eval_cases"."expected") = 'array')
);
--> statement-breakpoint
CREATE TABLE "eval_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"agent_id" uuid NOT NULL,
	"agent_version" integer NOT NULL,
	"status" text DEFAULT 'running' NOT NULL,
	"error" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"config" jsonb NOT NULL,
	"cases_done" integer DEFAULT 0 NOT NULL,
	"total" integer DEFAULT 0 NOT NULL,
	"passed" integer DEFAULT 0 NOT NULL,
	"errored" integer DEFAULT 0 NOT NULL,
	"recall" double precision,
	"precision" double precision,
	"citation_accuracy" double precision,
	"cost_usd" double precision,
	"duration_ms" integer,
	"llm_calls" integer DEFAULT 0 NOT NULL,
	"tokens_in" integer DEFAULT 0 NOT NULL,
	"tokens_out" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "eval_runs_config_object" CHECK (jsonb_typeof("eval_runs"."config") = 'object')
);
--> statement-breakpoint
ALTER TABLE "eval_case_results" ADD CONSTRAINT "eval_case_results_run_id_eval_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."eval_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eval_case_results" ADD CONSTRAINT "eval_case_results_case_id_eval_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."eval_cases"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eval_cases" ADD CONSTRAINT "eval_cases_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eval_cases" ADD CONSTRAINT "eval_cases_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eval_runs" ADD CONSTRAINT "eval_runs_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eval_runs" ADD CONSTRAINT "eval_runs_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "eval_case_results_run_idx" ON "eval_case_results" USING btree ("run_id");--> statement-breakpoint
CREATE INDEX "eval_case_results_case_idx" ON "eval_case_results" USING btree ("case_id");--> statement-breakpoint
CREATE UNIQUE INDEX "eval_cases_agent_name_uq" ON "eval_cases" USING btree ("agent_id","name");--> statement-breakpoint
CREATE UNIQUE INDEX "eval_cases_agent_source_finding_uq" ON "eval_cases" USING btree ("agent_id","source_finding_id");--> statement-breakpoint
CREATE INDEX "eval_cases_workspace_idx" ON "eval_cases" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "eval_runs_agent_started_idx" ON "eval_runs" USING btree ("agent_id","started_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "eval_runs_workspace_status_started_idx" ON "eval_runs" USING btree ("workspace_id","status","started_at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "eval_runs_one_running_per_agent" ON "eval_runs" USING btree ("agent_id") WHERE "eval_runs"."status" = 'running';
CREATE TABLE "fund_nav" (
	"id" serial PRIMARY KEY NOT NULL,
	"fund_id" text NOT NULL,
	"date" timestamp with time zone NOT NULL,
	"nav" numeric(14, 4) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "funds" (
	"id" serial PRIMARY KEY NOT NULL,
	"fund_id" text NOT NULL,
	"name" text NOT NULL,
	"type" text,
	"category" text,
	CONSTRAINT "funds_fund_id_unique" UNIQUE("fund_id")
);
--> statement-breakpoint
CREATE TABLE "holdings" (
	"id" serial PRIMARY KEY NOT NULL,
	"fund_id" text NOT NULL,
	"units" numeric(14, 4) NOT NULL,
	"purchase_nav" numeric(14, 4) NOT NULL,
	"purchase_date" timestamp with time zone,
	"source_file" text
);
--> statement-breakpoint
CREATE TABLE "request_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"question" text NOT NULL,
	"tools_called" jsonb,
	"status" text DEFAULT 'ok' NOT NULL,
	"latency_ms" integer,
	"answer" text,
	"error" text
);
--> statement-breakpoint
CREATE TABLE "transactions" (
	"id" serial PRIMARY KEY NOT NULL,
	"date" timestamp with time zone NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"merchant" text NOT NULL,
	"merchant_canonical" text NOT NULL,
	"category" text NOT NULL,
	"description" text,
	"source_file" text
);
--> statement-breakpoint
ALTER TABLE "fund_nav" ADD CONSTRAINT "fund_nav_fund_id_funds_fund_id_fk" FOREIGN KEY ("fund_id") REFERENCES "public"."funds"("fund_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "holdings" ADD CONSTRAINT "holdings_fund_id_funds_fund_id_fk" FOREIGN KEY ("fund_id") REFERENCES "public"."funds"("fund_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_nav_fund_date" ON "fund_nav" USING btree ("fund_id","date");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_nav_fund_date" ON "fund_nav" USING btree ("fund_id","date");--> statement-breakpoint
CREATE INDEX "idx_tx_date" ON "transactions" USING btree ("date");--> statement-breakpoint
CREATE INDEX "idx_tx_merchant_canonical" ON "transactions" USING btree ("merchant_canonical");--> statement-breakpoint
CREATE INDEX "idx_tx_category" ON "transactions" USING btree ("category");
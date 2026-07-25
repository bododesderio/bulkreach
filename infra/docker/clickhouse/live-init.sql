-- Live analytics — delivery events (Section 4.2). 2-year TTL.
CREATE DATABASE IF NOT EXISTS bulkreach;

CREATE TABLE IF NOT EXISTS bulkreach.delivery_events (
    event_id    String,
    campaign_id String,
    account_id  String,
    channel     LowCardinality(String),          -- 'sms' | 'email'
    recipient   String,
    status      LowCardinality(String),          -- delivered|failed|opened|clicked|bounced
    provider    LowCardinality(String),          -- 'africastalking' | 'mailgun'
    message_id  String,
    cost        String,
    error       String,
    created_at  DateTime64(3, 'UTC')
) ENGINE = MergeTree()
PARTITION BY toYYYYMM(created_at)
ORDER BY (campaign_id, channel, created_at)
TTL toDateTime(created_at) + INTERVAL 2 YEAR;

-- Totals per campaign/channel/status/day
CREATE MATERIALIZED VIEW IF NOT EXISTS bulkreach.campaign_stats_mv
ENGINE = SummingMergeTree()
ORDER BY (campaign_id, channel, status, day)
AS SELECT
    campaign_id,
    channel,
    status,
    toDate(created_at) AS day,
    count() AS events
FROM bulkreach.delivery_events
GROUP BY campaign_id, channel, status, day;

-- Totals per account/channel/day (billing + analytics)
CREATE MATERIALIZED VIEW IF NOT EXISTS bulkreach.account_daily_stats_mv
ENGINE = SummingMergeTree()
ORDER BY (account_id, channel, day)
AS SELECT
    account_id,
    channel,
    toDate(created_at) AS day,
    count() AS events
FROM bulkreach.delivery_events
GROUP BY account_id, channel, day;

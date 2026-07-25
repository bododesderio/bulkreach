-- Archive analytics — delivery events (Section 19.3). 7-year TTL (or never).
CREATE DATABASE IF NOT EXISTS bulkreach;

CREATE TABLE IF NOT EXISTS bulkreach.delivery_events (
    event_id    String,
    campaign_id String,
    account_id  String,
    channel     LowCardinality(String),
    recipient   String,
    status      LowCardinality(String),
    provider    LowCardinality(String),
    message_id  String,
    cost        String,
    error       String,
    created_at  DateTime64(3, 'UTC')
) ENGINE = MergeTree()
PARTITION BY toYYYYMM(created_at)
ORDER BY (campaign_id, channel, created_at)
TTL toDateTime(created_at) + INTERVAL 7 YEAR;

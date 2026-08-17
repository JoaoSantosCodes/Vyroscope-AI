ALTER TABLE `user_limits` ADD `limit_action` varchar(8) DEFAULT 'block' NOT NULL;
ALTER TABLE `user_limits` ADD `weekly_token_limit` int DEFAULT 0 NOT NULL;
ALTER TABLE `user_limits` ADD `weekly_quota_limit` int DEFAULT 0 NOT NULL;
ALTER TABLE `user_limits` ADD `monthly_token_limit` int DEFAULT 0 NOT NULL;
ALTER TABLE `user_limits` ADD `monthly_quota_limit` int DEFAULT 0 NOT NULL;
ALTER TABLE `user_limits` ADD `override_until` bigint DEFAULT 0 NOT NULL;
CREATE TABLE `blocked_attempts` (...); -- applied via SQL direto

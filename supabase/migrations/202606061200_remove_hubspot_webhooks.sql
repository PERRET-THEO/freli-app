-- Remove legacy HubSpot integration rows (replaced by outbound webhooks).
DELETE FROM integrations WHERE provider = 'hubspot';

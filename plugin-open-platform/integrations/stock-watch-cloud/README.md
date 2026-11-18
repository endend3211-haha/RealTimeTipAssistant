# Deployed relay

Production: https://memo-naver-stock-relay.majorfacet1.chatgpt.site
Sites project identity is in .openai/hosting.json. Source is synchronized by the Sites workflow; do not create a second project. Public read-only access was explicitly approved by the user.

Build: node scripts/assemble.mjs
Test: node --test scripts/relay.test.mjs
Validate: node scripts/validate-artifact.mjs

worker/index.js is a generated, standalone Worker ESM containing worker/naver-core.mjs and worker/relay.mjs. No runtime secrets, account credentials, or client watchlists are stored. Source credentials are never written here. Public /health, /search and /data routes support CORS for plugin requests. Fixed Naver domains only; no arbitrary URL proxy. In-memory rate limits/cache are per isolate, not a durable global quota.

The phone plugin ships the deployed HTTPS origin in cloud.mjs. Version 1.2.1 uses protocol compatibility instead of a strict glass ID requirement.

Version 1.3.0: basic quotes have a 10-second cache; search/history/intraday retain 60 seconds. The phone polls visible quotes every 15 seconds and marks failed refreshes as previous values. This is polling, not tick streaming.



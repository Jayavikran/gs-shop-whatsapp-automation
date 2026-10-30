# MongoDB Atlas Backup and Disaster Recovery Procedure
**GS Shop Alangulam WhatsApp Automation**

This document establishes the official backup, retention, and disaster recovery procedures for the GS Shop WhatsApp Automation MongoDB Atlas production database.

---

## 1. Automated Continuous Cloud Backups (Recommended)

MongoDB Atlas provides fully managed, continuous cloud backups with point-in-time recovery (PITR) to protect customer consent records, campaign audit logs, and message histories.

### A. Snapshot Frequency & Retention Policy
| Tier | Frequency | Retention Window | Purpose |
|---|---|---|---|
| **Continuous Oplog** | Real-time | 24 Hours | Point-in-time restore to any second |
| **Hourly Snapshots** | Every 6 hours | 7 Days | Rapid rollback from application defects |
| **Daily Snapshots** | Daily at 02:00 IST | 30 Days | Monthly compliance and audit |
| **Monthly Snapshots** | 1st of every month | 365 Days | Long-term customer consent archives |

### B. Enabling in Atlas Web Console
1. Log in to the [MongoDB Atlas Console](https://cloud.mongodb.com/).
2. Select the cluster: `gs-shop-cluster`.
3. Navigate to **Deployment** > **Database** > Cluster Name.
4. Click the **Backup** tab.
5. Under **Backup Policy**, confirm **Cloud Backup** is toggled **ON**.
6. Select your retention schedule matching the policy table above.

---

## 2. On-Demand Snapshot Procedure (Before Deployments)

Before applying significant application upgrades, schema migrations, or major batch operations, trigger an on-demand cloud snapshot:

1. In MongoDB Atlas, go to **Database** > **Backup** > **Snapshots**.
2. Click **Take Snapshot Now**.
3. Provide a clear description (e.g. `pre-deployment-phase4-security-fixes-2026-10-30`).
4. Wait for snapshot status to transition to **Completed** (typically 1–3 minutes).

---

## 3. Manual Encrypted CLI Backup Procedure (`mongodump`)

For off-site compliance backups or secondary disaster-recovery archives, execute `mongodump` using a secured TLS connection.

> **CRITICAL SECURITY NOTE:**
> - Never hardcode or log the database password in scripts or commit histories.
> - Store database backups on encrypted storage (AES-256).

### A. Exporting Database via Encrypted Connection
```bash
# Set credentials securely in the local session only (do not write to disk)
export MONGODB_URI="mongodb+srv://<DB_USER>:<DB_PASSWORD>@<CLUSTER>.mongodb.net/gs_shop_whatsapp_demo"

# Create timestamped backup directory
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_DIR="./backups/gs_shop_backup_${TIMESTAMP}"

# Run mongodump with gzip compression and archive format
mongodump \
  --uri="${MONGODB_URI}" \
  --archive="${BACKUP_DIR}.archive.gz" \
  --gzip

# Clear environment variable immediately after export
unset MONGODB_URI
```

### B. Collections Included in Backup
The backup archive captures all operational and compliance collections:
- `customers` (Customer contacts, opt-in dates, consent sources)
- `campaigns` (Broadcast definitions, schedules, delivery metrics)
- `messagelogs` (Idempotency keys, provider message IDs, delivery statuses)
- `autoreplyrules` (Bilingual keywords and configured auto-responses)
- `conversations` (Incoming WhatsApp inquiries and agent handovers)
- `webhooklogs` (Meta webhook event deduplication audit logs)
- `owners` (Hashed admin credentials)
- `shopsettings` (Store profile and default customer communications)

---

## 4. Disaster Recovery & Restoration Procedure (`mongorestore`)

### A. Restoring via MongoDB Atlas Console (Point-in-Time)
1. In MongoDB Atlas, navigate to **Backup** > **Snapshots**.
2. Select the desired snapshot or choose **Point-in-Time Recovery**.
3. Select the exact date and timestamp (e.g. 5 minutes before the incident).
4. Choose **Restore to this cluster** (or restore to a staging cluster to verify first).
5. Confirm the cluster name to begin restore.

### B. Restoring from a Manual Archive (`mongorestore`)
```bash
# To safely restore to a dedicated test/recovery database first:
export MONGODB_URI="mongodb+srv://<DB_USER>:<DB_PASSWORD>@<CLUSTER>.mongodb.net/gs_shop_whatsapp_demo"

mongorestore \
  --uri="${MONGODB_URI}" \
  --archive="./backups/gs_shop_backup_YYYYMMDD_HHMMSS.archive.gz" \
  --gzip \
  --nsInclude="gs_shop_whatsapp_demo.*" \
  --drop

unset MONGODB_URI
```
> **Warning**: `--drop` replaces existing collections with the backup archive data. Ensure an active pre-restore snapshot exists before executing `--drop`.

---

## 5. Post-Restoration Verification Checklist

After restoring the database, perform these validation checks before redirecting traffic:

1. **Verify Opt-In Consent Integrity**:
   Confirm that all customer records preserve valid `consentStatus` (`opted_in` / `opted_out`) and `consentAt` timestamps.
2. **Verify Idempotency Keys**:
   Confirm the unique index on `messagelogs.idempotencyKey` is intact to prevent duplicate WhatsApp dispatch.
3. **Verify Operating Guard**:
   Confirm `DRY_RUN=true` remains enforced in the environment.
4. **Execute Health Check**:
   Send `GET /api/health` and confirm HTTP 200 with `{ ok: true, mode: "demo_no_send" }`.

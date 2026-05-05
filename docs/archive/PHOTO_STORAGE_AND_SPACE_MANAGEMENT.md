# 📸 Photo Storage & Database Space Management

## 📍 Where Photos Are Stored

Photos are stored in **Supabase Storage** (cloud storage), organized in the following buckets:

### Storage Buckets:
1. **`task-photos`** - Photos of completed tasks (feeding, cleaning, maintenance)
2. **`mortality-photos`** - Photos documenting mortality events
3. **`flock-photos`** - Photos of flocks at various growth stages
4. **`health-photos`** - Photos of health issues, injuries, vaccinations
5. **`expense-receipts`** - Photos of receipts and expense documentation
6. **`inventory-photos`** - Photos of feed, medications, equipment inventory
7. **`weight-photos`** - Photos of weighing processes and scales
8. **`farm-infrastructure`** - Photos of coops, equipment, facilities

### Storage Structure:
```
bucket-name/
  └── farm_id/
      └── flock_id/ (or 'general')
          └── timestamp_filename.jpg
```

**Example:**
```
task-photos/
  └── abc123-farm-id/
      └── xyz789-flock-id/
          └── 1703123456789.jpg
```

## 🖼️ How to Access Photos

### 1. **View Photos in App:**
- Photos are displayed automatically in:
  - Task completion records
  - Egg collection logs
  - Mortality records
  - Expense receipts
  - Weight check records

### 2. **Access via Supabase Dashboard:**
1. Go to Supabase Dashboard
2. Navigate to **Storage** → Select bucket (e.g., `task-photos`)
3. Browse by farm_id → flock_id → files

### 3. **Programmatic Access:**
Photos are stored with URLs like:
```
https://[project].supabase.co/storage/v1/object/public/task-photos/farm_id/flock_id/timestamp.jpg
```

## ⏱️ How Long Photos Remain Stored

**Currently: Photos are stored indefinitely** until manually deleted.

### Recommended Retention Policy:
- **Active Records**: Keep all photos for active flocks
- **Archived Flocks**: Keep photos for 1-2 years after flock is archived
- **Old Records**: Consider deleting photos older than 2-3 years

## 💾 Database Space Management

### Current Space Usage:
- **Photos**: Stored in Supabase Storage (separate from database)
- **Database Records**: Stored in PostgreSQL tables

### Space Optimization Features:

#### 1. **Image Compression** (Already Implemented)
- Photos are automatically compressed before upload
- Target size: ~500KB per image
- Format: JPEG (reduces file size by ~70-80%)

#### 2. **Record Deletion Feature** (To Be Implemented)
We'll add a feature to delete old records:

**Location**: Settings → Data Management → Clean Up Old Records

**Options**:
- Delete photos older than X months/years
- Delete expense records older than X years
- Delete archived flock data older than X years
- Delete old activity logs (keep last 6 months)

#### 3. **Automatic Cleanup** (Recommended)
Set up automatic cleanup policies:
- Delete photos from archived flocks after 2 years
- Archive old activity logs to cold storage
- Compress old records

## 🗑️ How to Delete Photos

### Manual Deletion (Supabase Dashboard):
1. Go to **Storage** → Select bucket
2. Navigate to file
3. Click **Delete**

### Programmatic Deletion (Future Feature):
```typescript
// Delete photo from storage
await supabase.storage
  .from('task-photos')
  .remove([`${farmId}/${flockId}/${filename}`]);
```

## 📊 Space Monitoring

### Check Storage Usage:
1. **Supabase Dashboard** → **Storage** → View bucket sizes
2. **Database** → Check table sizes in PostgreSQL

### Recommended Limits:
- **Free Tier**: 1GB storage
- **Pro Tier**: 100GB storage
- **Team Tier**: 200GB storage

## 🔧 Best Practices

1. **Compress Before Upload**: ✅ Already implemented
2. **Delete Old Photos**: Set up periodic cleanup
3. **Archive Old Data**: Move old records to archive tables
4. **Monitor Usage**: Check storage monthly
5. **Use Appropriate Buckets**: Store photos in correct bucket for easy management

## 🚀 Next Steps

1. **Add Cleanup UI**: Settings page with record deletion options
2. **Automatic Cleanup**: Scheduled jobs to delete old records
3. **Storage Analytics**: Dashboard showing storage usage
4. **Retention Policies**: Configurable retention periods per data type

---

**Note**: Photos are stored separately from database records, so deleting photos won't affect your data records. However, deleting database records should also delete associated photos to save space.












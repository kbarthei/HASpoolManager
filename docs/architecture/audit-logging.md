# Audit Logging

## Overview

The admin SQL endpoints (`/api/v1/admin/sql/execute` and `/api/v1/admin/query`) include comprehensive audit logging to track all database operations performed through the admin interface.

## What Gets Logged

Every SQL operation is recorded with:

- **User Identity**: API key name and ID (or "web-ui" for unauthenticated requests)
- **SQL Statement**: Full SQL query or command
- **Parameters**: Bound parameters (for execute endpoint)
- **Operation Type**: UPDATE, INSERT, DELETE, SELECT, etc.
- **Execution Result**: Success/failure status
- **Performance Metrics**: Execution time in milliseconds
- **Impact**: Number of rows affected/returned
- **Error Details**: Full error message for failed operations
- **Request Context**: IP address, user agent
- **Flags**: Dry-run indicator

## Database Schema

```sql
CREATE TABLE audit_logs (
  id TEXT PRIMARY KEY,
  action TEXT NOT NULL,              -- 'sql_execute' | 'sql_query'
  user_id TEXT NOT NULL,             -- API key name or 'web-ui'
  user_key_id TEXT NOT NULL,         -- API key ID or 'web-ui'
  sql_statement TEXT NOT NULL,       -- Full SQL statement
  sql_params TEXT,                   -- JSON array of parameters
  operation TEXT,                    -- 'UPDATE' | 'INSERT' | 'DELETE' | 'SELECT'
  dry_run INTEGER NOT NULL,          -- Boolean: was this a dry-run?
  success INTEGER NOT NULL,          -- Boolean: did it succeed?
  rows_affected INTEGER,             -- Number of rows changed/returned
  error_message TEXT,                -- Full error for debugging
  execution_time_ms INTEGER,         -- Performance metric
  ip_address TEXT,                   -- Client IP
  user_agent TEXT,                   -- Client user agent
  created_at TEXT NOT NULL           -- ISO-8601 timestamp
);
```

## Endpoints

### SQL Execute (`/api/v1/admin/sql/execute`)

Logs all write operations (UPDATE, INSERT, DELETE):

```typescript
{
  action: "sql_execute",
  operation: "UPDATE",
  sql_statement: "UPDATE spools SET notes = ? WHERE id = ?",
  sql_params: '["Updated note", "spool-123"]',
  dry_run: false,
  success: true,
  rows_affected: 1,
  execution_time_ms: 5
}
```

### SQL Query (`/api/v1/admin/query`)

Logs all read operations (SELECT):

```typescript
{
  action: "sql_query",
  operation: "SELECT",
  sql_statement: "SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT 50",
  sql_params: null,
  dry_run: false,
  success: true,
  rows_affected: 50,
  execution_time_ms: 12
}
```

## Viewing Audit Logs

### Admin UI

The Admin page includes an "SQL Audit Log" card showing the last 50 operations with:

- Visual success/failure indicators
- SQL statement preview (truncated)
- User, timestamp, execution time
- Rows affected
- Error messages for failures
- Expandable parameter details
- Dry-run badges

### Direct Database Query

```sql
SELECT 
  datetime(created_at) as timestamp,
  user_id,
  operation,
  success,
  rows_affected,
  execution_time_ms,
  substr(sql_statement, 1, 50) as sql_preview
FROM audit_logs 
ORDER BY created_at DESC 
LIMIT 100;
```

## Security Considerations

### What's Logged

- **Full SQL statements**: Stored for debugging and accountability
- **Full error messages**: Internal errors are logged (but sanitized in API responses)
- **User identification**: Tracks who performed each operation
- **Request metadata**: IP and user agent for security analysis

### What's Protected

- **API responses**: Error messages are sanitized before returning to client
- **Non-blocking**: Audit log failures don't break the main operation
- **Separate transactions**: Audit logging uses separate DB connection

### Privacy Notes

- Audit logs may contain sensitive data from SQL statements
- Consider retention policies for compliance
- Logs are stored in the same database (no separate audit DB)

## Performance Impact

- **Minimal overhead**: ~1-5ms per operation
- **Async logging**: Fire-and-forget pattern
- **Indexed queries**: Efficient retrieval via created_at, user_id, action indexes
- **No blocking**: Main operation completes even if audit logging fails

## Use Cases

### Security Auditing

Track who made what changes:

```sql
SELECT * FROM audit_logs 
WHERE user_id = 'admin-key' 
  AND success = 1 
  AND operation IN ('UPDATE', 'DELETE')
ORDER BY created_at DESC;
```

### Performance Analysis

Find slow queries:

```sql
SELECT 
  operation,
  AVG(execution_time_ms) as avg_time,
  MAX(execution_time_ms) as max_time,
  COUNT(*) as count
FROM audit_logs 
WHERE success = 1
GROUP BY operation;
```

### Error Investigation

Review failed operations:

```sql
SELECT 
  datetime(created_at) as timestamp,
  user_id,
  sql_statement,
  error_message
FROM audit_logs 
WHERE success = 0
ORDER BY created_at DESC
LIMIT 20;
```

### Compliance Reporting

Generate activity reports:

```sql
SELECT 
  DATE(created_at) as date,
  user_id,
  COUNT(*) as operations,
  SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) as successful,
  SUM(CASE WHEN success = 0 THEN 1 ELSE 0 END) as failed
FROM audit_logs 
WHERE created_at >= datetime('now', '-30 days')
GROUP BY DATE(created_at), user_id
ORDER BY date DESC, user_id;
```

## Maintenance

### Retention Policy

Consider implementing automatic cleanup:

```sql
-- Delete audit logs older than 90 days
DELETE FROM audit_logs 
WHERE created_at < datetime('now', '-90 days');
```

### Backup Considerations

Audit logs are included in standard database backups. For long-term archival:

1. Export old logs to separate storage
2. Delete from main database
3. Keep archives for compliance period

## Testing

Use the provided test script:

```bash
./test-audit-log.sh
```

This tests:
- Successful operations (dry-run)
- Failed operations (blocked SELECT, syntax errors)
- Audit log retrieval and display

## Future Enhancements

Potential improvements:

- [ ] Separate audit database for better isolation
- [ ] Automatic log rotation and archival
- [ ] Real-time audit log streaming
- [ ] Advanced filtering in UI
- [ ] Export audit logs to CSV
- [ ] Integration with external SIEM systems
- [ ] Audit log integrity verification (checksums)
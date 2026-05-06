# Sync Worker Health Monitoring

## Overview

The sync worker is a critical background process that maintains real-time synchronization between Home Assistant and HASpoolManager. Health monitoring provides visibility into its operation, enabling proactive issue detection and troubleshooting.

## Architecture

### Components

1. **Health Tracking Module** (`lib/sync-worker-health.ts`)
   - Collects metrics from sync worker operations
   - Maintains state for printers, events, and subsystems
   - Provides health status API

2. **Sync Worker Integration** (`lib/sync-worker.ts`)
   - Calls health tracking functions at key points
   - Updates printer state after syncs
   - Records events and subsystem status

3. **Health Endpoint** (`/api/v1/health`)
   - Simple mode: Load balancer health checks
   - Detailed mode: Admin dashboard metrics

## Health Metrics

### Overall Status

- **healthy**: All systems operational
- **degraded**: Minor issues detected (warnings)
- **unhealthy**: Critical issues detected (errors)

### WebSocket Connection

```typescript
{
  connected: boolean;           // Currently connected to HA
  connectionUptime: number;     // Milliseconds since last connect
  reconnectCount: number;       // Total reconnections since startup
  lastDisconnectAt: number;     // Timestamp of last disconnect
}
```

**Health Checks:**
- ✗ WebSocket disconnected → **unhealthy**
- ⚠ Recently reconnected (<1 min) → **degraded**

### Printer Health

```typescript
{
  printerId: string;
  deviceId: string;
  name: string;
  isActive: boolean;            // Currently printing
  lastEventAt: number;          // Last HA event received
  lastSyncAt: number;           // Last successful sync
  timeSinceLastEvent: number;   // Milliseconds
  timeSinceLastSync: number;    // Milliseconds
  entityCount: number;          // Mapped entities
  pendingSwaps: number;         // Filament swaps in progress
  status: "healthy" | "warning" | "error";
  issues: string[];
}
```

**Health Checks per Printer:**
- ⚠ No events for 10+ minutes → **warning** (printer offline?)
- ✗ Active print but no sync for 15+ minutes → **error** (stuck sync)
- ⚠ Idle but no sync for 30+ minutes → **warning** (watchdog issue?)
- ✗ No entities mapped → **error** (discovery failed)

### Event Metrics

```typescript
{
  stateChangedCount: number;    // state_changed events (last 60s)
  bambuEventCount: number;      // bambu_lab_event events (last 60s)
  lastEventAt: number;          // Last event timestamp
}
```

**Health Checks:**
- ⚠ No events for 30+ minutes (with printers) → **degraded**

### Watchdog

```typescript
{
  running: boolean;             // Watchdog timer active
  lastRunAt: number;            // Last watchdog execution
}
```

**Health Checks:**
- ⚠ Watchdog hasn't run in 5+ minutes → **degraded**
- ⚠ Watchdog not running (with printers) → **degraded**

### Backup Scheduler

```typescript
{
  schedulerRunning: boolean;    // Scheduler timer active
  lastBackupAt: number;         // Last backup timestamp
  backupCount: number;          // Total backups available
}
```

**Health Checks:**
- ⚠ No backup in 48+ hours → **degraded**

## API Usage

### Simple Health Check

For load balancers, monitoring tools, uptime checks:

```bash
GET /api/v1/health
```

**Response (200 OK):**
```json
{
  "status": "ok",
  "version": "1.1.23",
  "timestamp": "2026-05-06T13:00:00.000Z"
}
```

**Response (200 OK - degraded):**
```json
{
  "status": "degraded",
  "version": "1.1.23",
  "timestamp": "2026-05-06T13:00:00.000Z",
  "message": "Watchdog hasn't run in 5+ minutes"
}
```

**Response (503 Service Unavailable):**
```json
{
  "status": "error",
  "version": "1.1.23",
  "timestamp": "2026-05-06T13:00:00.000Z",
  "message": "WebSocket disconnected from Home Assistant"
}
```

### Detailed Health Metrics

For admin dashboard, troubleshooting:

```bash
GET /api/v1/health?detailed=true
```

**Response:**
```json
{
  "version": "1.1.23",
  "status": "healthy",
  "uptime": 3600000,
  "websocket": {
    "connected": true,
    "connectionUptime": 3600000,
    "reconnectCount": 1,
    "lastDisconnectAt": null
  },
  "printers": {
    "total": 2,
    "active": 1,
    "healthy": 2,
    "warning": 0,
    "error": 0,
    "details": [
      {
        "printerId": "abc123",
        "deviceId": "device_xyz",
        "name": "X1C",
        "isActive": true,
        "lastEventAt": 1715000000000,
        "lastSyncAt": 1715000000000,
        "timeSinceLastEvent": 5000,
        "timeSinceLastSync": 5000,
        "entityCount": 45,
        "pendingSwaps": 0,
        "status": "healthy",
        "issues": []
      }
    ]
  },
  "events": {
    "stateChangedCount": 150,
    "bambuEventCount": 5,
    "lastEventAt": 1715000000000
  },
  "watchdog": {
    "running": true,
    "lastRunAt": 1715000000000
  },
  "backup": {
    "schedulerRunning": true,
    "lastBackupAt": 1714950000000,
    "backupCount": 7
  },
  "issues": [],
  "timestamp": "2026-05-06T13:00:00.000Z"
}
```

## Monitoring Integration

### Prometheus

Export metrics for Prometheus scraping:

```yaml
# prometheus.yml
scrape_configs:
  - job_name: 'haspoolmanager'
    metrics_path: '/api/v1/health'
    params:
      detailed: ['true']
    static_configs:
      - targets: ['haspoolmanager:3002']
```

### Uptime Monitoring

Configure uptime monitors (UptimeRobot, Pingdom, etc.):

- **URL**: `https://your-domain/api/v1/health`
- **Method**: GET
- **Expected Status**: 200
- **Expected Content**: `"status":"ok"`
- **Interval**: 5 minutes

### Alerting Rules

**Critical Alerts (PagerDuty, Slack):**
- WebSocket disconnected for 5+ minutes
- Active print with no sync for 15+ minutes
- No entities mapped (discovery failed)

**Warning Alerts (Email, Slack):**
- Printer offline for 10+ minutes
- No events for 30+ minutes
- Watchdog not running
- No backup in 48+ hours

## Troubleshooting

### WebSocket Disconnected

**Symptoms:**
- `websocket.connected: false`
- Status: **unhealthy**

**Causes:**
1. Home Assistant restarted
2. Network connectivity issues
3. Bambu Lab integration disabled

**Resolution:**
1. Check HA is running: `ha core info`
2. Check Bambu Lab integration: HA → Settings → Devices & Services
3. Check network: `ping homeassistant.local`
4. Restart addon: `ha addons restart haspoolmanager`

### Stuck Sync (Active Print)

**Symptoms:**
- Printer status: **error**
- Issue: "Active print but no sync for 15+ minutes"

**Causes:**
1. HA entities unavailable
2. API endpoint unresponsive
3. Database locked

**Resolution:**
1. Check HA entity states in Developer Tools
2. Check addon logs: `ha addons logs haspoolmanager`
3. Restart addon if necessary

### Watchdog Not Running

**Symptoms:**
- `watchdog.running: false`
- Status: **degraded**

**Causes:**
1. Sync worker crashed
2. Startup incomplete

**Resolution:**
1. Check addon logs for errors
2. Restart addon
3. Check HA connection

### No Events Received

**Symptoms:**
- `lastEventAt` > 30 minutes ago
- Status: **degraded**

**Causes:**
1. Printers offline
2. HA event subscription failed
3. Bambu Lab integration issues

**Resolution:**
1. Check printer power and network
2. Check HA logs for Bambu Lab errors
3. Reload Bambu Lab integration
4. Restart addon

## Implementation Details

### Health Tracking Functions

```typescript
// Initialize on worker startup
health.initializeHealth();

// WebSocket lifecycle
health.recordWebSocketConnected();
health.recordWebSocketDisconnected();

// Event tracking
health.recordStateChangedEvent();
health.recordBambuEvent();

// Subsystem tracking
health.setWatchdogRunning(true);
health.recordWatchdogRun();
health.setBackupSchedulerRunning(true);
health.recordBackup();

// Printer state updates
health.updatePrinterHealth(
  printerId,
  deviceId,
  name,
  isActive,
  lastEventAt,
  lastSyncAt,
  entityCount,
  pendingSwaps
);

// Cleanup
health.removePrinter(deviceId);
health.resetEventCounters();
```

### Health Status Determination

```typescript
// Overall status logic
if (errorCount > 0 || !wsConnected) {
  status = "unhealthy";
} else if (warningCount > 0 || issues.length > 0) {
  status = "degraded";
} else {
  status = "healthy";
}
```

## Best Practices

### For Operators

1. **Monitor regularly**: Check `/api/v1/health?detailed=true` daily
2. **Set up alerts**: Configure uptime monitoring and alerting
3. **Review logs**: Check addon logs when status is degraded/unhealthy
4. **Restart proactively**: Restart addon if issues persist

### For Developers

1. **Add health tracking**: Call health functions for new subsystems
2. **Define thresholds**: Set appropriate timeout values for health checks
3. **Test failure modes**: Verify health status changes correctly
4. **Document issues**: Add new issue types to this documentation

## Related Documentation

- [Sync Worker Architecture](./sync-worker.md) - How the sync worker operates
- [Home Assistant Integration](../operator/ha-integration.md) - HA setup and configuration
- [Troubleshooting Guide](../operator/troubleshooting.md) - Common issues and solutions
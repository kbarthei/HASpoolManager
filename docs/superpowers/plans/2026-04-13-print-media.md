# Print Media Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Show a camera snapshot and 3D model thumbnail on every completed print record.

**Architecture:** The sync worker captures two images during print lifecycle: (1) the cover image (3D preview from slicer, available at print start via HA image entity) and (2) a camera snapshot (captured at print finish via HA camera.snapshot service call). Both stored as files under /config/snapshots/ and referenced by path on the print record.

**Tech Stack:** Next.js 16, SQLite/Drizzle ORM, HA REST API, sync worker websocket events.

---

## 9 Tasks — see full plan in conversation history

Plan was presented inline. Key tasks:
1. Add callHAService to ha-api.ts
2. Add coverImagePath + snapshotPath columns to prints schema
3. Map cover image entity in ha-discovery.ts
4. Capture images in sync worker (cover at start, snapshot at finish)
5. API endpoints to store image paths
6. Serve snapshot images via API route
7. Display images on prints page + hero card
8. Integration test
9. Deploy + verify

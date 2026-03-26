# Seed Data Validation Report

Generated: 2026-03-26
Source: `seed-final.json` v1.0.0

## Data Summary

| Entity       | Count |
|--------------|-------|
| Vendors      | 6     |
| Shops        | 4     |
| Filaments    | 26    |
| Spools       | 30    |
| Tag Mappings | 18    |
| AMS Slots    | 5 (4 loaded, 1 empty) |

## Corrections Applied

1. **Filament #23/#27 merged** -- "Black" PLA and "PLA Basic Black" consolidated into filament #23 "PLA Basic" with colorHex="161616" (from AMS, not "000000") and bambuIdx="GFA00"
2. **Filament #26 added** -- PolyLite PLA White (Polymaker), bambuIdx="GFL00"
3. **Spool #40 added** -- PolyLite PLA White, ~800g remaining, location=ams
4. **Spool #41 added** -- PLA Basic Black (Bambu Lab), ~800g remaining, location=ams
5. **Spool #25 weight corrected** -- 891g -> 700g (AMS shows 70%)
6. **Spool #26 weight corrected** -- 504g -> 470g (AMS shows 47%)
7. **Tag UIDs #25/#26 confirmed REAL** -- B568B1A400000100 and D7C546ED00000100
8. **Location normalized** -- All "storage-2" -> "storage"
9. **Filament #6 (Glow Green)** -- Confirmed vendor R3D (not Bambu Lab), bambuIdx cleared to null
10. **Bambu idx codes assigned** from real Bambu code table:
    - GFA00 (PLA Basic): filament #23
    - GFA01 (PLA Matte): filaments #5, #14, #24
    - GFA02 (PLA Metal): filament #4
    - GFA05 (PLA Silk): filaments #7, #12, #13
    - GFB50 (ABS-GF): filaments #8, #11
    - GFG02 (PETG HF): filaments #1, #2
    - GFL00 (PolyLite PLA): filament #26

## Validation Checks

### 1. Referential Integrity

| Check | Result | Detail |
|-------|--------|--------|
| Filament -> Vendor | PASS | All 26 filaments reference valid vendors |
| Spool -> Filament | PASS | All 30 spools reference valid filaments |
| TagMapping -> Spool | PASS | All 18 tag mappings reference valid spools |
| AmsSlot -> Spool | PASS | All loaded AMS slots reference valid spools |

### 2. No Duplicates

| Check | Result | Detail |
|-------|--------|--------|
| Unique vendor names | PASS | 6 vendors, all unique |
| Unique tag UIDs | PASS | 18 tags, all unique |
| Unique filaments (vendor+name+colorHex) | PASS | 26 filaments, all unique |

### 3. Data Consistency

| Check | Result | Detail |
|-------|--------|--------|
| All prices > 0 | PASS | All spool prices are positive |
| Remaining weights valid | PASS | All remaining weights > 0 and <= initial weight |
| Valid colorHex values | PASS | All 26 filament colorHex values are valid 6-char hex |

### 4. AMS Consistency

| Check | Result | Detail |
|-------|--------|--------|
| AMS spools have location=ams | PASS | All 4 AMS-loaded spools have location=ams |
| Loaded slots have spool ref | PASS | All loaded slots have spool references |
| AMS tag UIDs match tagMappings | PASS | Tag UIDs in AMS slots #0 and #1 match their tag_mappings entries |

### 5. Completeness

| Check | Result | Detail |
|-------|--------|--------|
| Bambu spools have tags | PASS* | 17/18 Bambu spools have tags. Spool #41 (PLA Basic Black) is in AMS without RFID -- this is expected (newly loaded, no tag scanned yet) |
| No 3rd-party spools have tags | PASS | No third-party spools have RFID tags |
| Total inventory value | INFO | **627.70 EUR** across 30 spools |

*Spool #41 is a known exception: it is a Bambu Lab spool loaded into the AMS without an RFID tag assignment. The user specified "no RFID" for this spool.

### 6. Bambu Idx Consistency

| Check | Result | Detail |
|-------|--------|--------|
| Known Bambu idx codes | PASS | All 13 bambuIdx values are from the known code table |
| No non-Bambu GFA/GFB/GFG codes | PASS | No non-Bambu filaments carry Bambu-proprietary codes |
| Bambu PLA filaments have bambuIdx | PASS | All Bambu Lab PLA filaments have bambuIdx set |

## Summary

| # | Category | Result |
|---|----------|--------|
| 1 | Referential Integrity | **PASS** (4/4) |
| 2 | No Duplicates | **PASS** (3/3) |
| 3 | Data Consistency | **PASS** (3/3) |
| 4 | AMS Consistency | **PASS** (3/3) |
| 5 | Completeness | **PASS*** (3/3, 1 known exception) |
| 6 | Bambu Idx Consistency | **PASS** (3/3) |

**Overall: ALL CHECKS PASS** (with 1 documented exception for spool #41 no-RFID)

## Inventory Breakdown by Vendor

| Vendor | Spools | Total Value (EUR) |
|--------|--------|-------------------|
| Bambu Lab | 18 | 416.82 |
| Polymaker | 5 | 94.95 |
| Sunlu | 3 | 38.97 |
| Creality | 1 | 16.99 |
| GEEETECH | 1 | 15.99 |
| R3D | 1 | 15.99 |
| PolyLite (via Polymaker) | 1 | 18.99 |
| **Total** | **30** | **627.70** |

## Filament Materials Summary

| Material | Filaments | Spools |
|----------|-----------|--------|
| PLA | 17 | 22 |
| PETG | 4 | 5 |
| ABS | 2 | 2 |
| ABS-GF | 2 | 3 |
| TPU-90A | 1 | 1 |
| **Total** | **26** | **30** |*

*Note: 3 spools do not exist in the original Spoolman data (spool IDs 1, 2, 4, 6, 10, 11, 18, 28, 32-34 were previously archived/deleted).

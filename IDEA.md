# IDEA

## Project Title
Climate Resilience and Hydrometeorological Disaster Management

## Problem

The Philippines faces roughly twenty tropical cyclones a year. When severe typhoons hit, infrastructure damage routinely severs internet and cellular service — cutting off cloud-based early warning systems exactly when communities need them most. National weather data also rarely gets translated into specific, street-level evacuation instructions residents can act on, and affordable, localized water-level monitoring for real-time flood alerts remains largely unavailable to smaller communities.

## Solution

A barangay-scale resilience system built around one idea: **the neighborhood itself becomes both the delivery network and the sensor network.**

- **Multi-channel alert delivery** — alerts reach residents over live internet first; if that's down, over SMS (which typically survives longer than mobile data during PH typhoon outages); if even that's unreachable, residents still see the last-known alert and their zone's evacuation instructions, pre-cached on their device before the storm hit.
- **Street-level evacuation guidance** — each zone (barangay or sub-zone) has pre-authored, specific instructions ("Zone 3 → evacuate to San Isidro Elementary via Rizal St."), not a generic bulletin.
- **Crowdsourced water-level sensing** — residents report flood depth against a simple visual reference (ankle/knee/waist/neck-deep). Enough reports crossing a threshold in one zone automatically triggers an alert — a zero-hardware, instantly-scalable substitute for physical water-level sensors.
- **Phone-to-phone relay (roadmap)** — a future upgrade where alerts and reports hop directly between nearby phones over Bluetooth when both internet and SMS are down, for full-blackout resilience.

## Target Users

Residents of flood- and typhoon-prone barangays, and local Disaster Risk Reduction and Management Offices (DRRMOs) responsible for issuing evacuation guidance.

## Why It's Different

Existing Philippine tools — national hazard maps, flood dashboards, cell broadcast, even crowdsourced flood-report apps — all still assume a live connection to reach people or to collect data. This system is built for the moment that assumption fails: a real fallback delivery channel (not just pre-storm caching) keeps new alerts moving through an outage, and the community's own observations stand in for sensor hardware nobody can afford to deploy at scale. It complements official sources like PAGASA and Project NOAH by solving distribution and ground-truth data at the exact moment their usual channels go dark.

## Feasibility

Phase 1 (this challenge): a web-based, installable app (PWA) — offline-cached alerts, per-zone evacuation instructions, SMS fallback delivery, and crowdsourced water-level reporting with auto-triggered alerts. Built on a proven stack (Next.js + Supabase), developed hi-fi prototype first, then functional build, full implementation, and final testing. Phone-to-phone mesh relay is the defined next-phase upgrade once the core system is proven.

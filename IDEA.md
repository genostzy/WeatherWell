# IDEA

## Project Title
WeatherWell

*(Challenge: Climate Resilience and Hydrometeorological Disaster Management)*

## Problem

The Philippines faces roughly twenty tropical cyclones a year. When severe typhoons hit, infrastructure damage routinely severs internet and cellular service — cutting off cloud-based early warning systems exactly when communities need them most. National weather data also rarely gets translated into specific, street-level evacuation instructions residents can act on, and affordable, localized water-level monitoring for real-time flood alerts remains largely unavailable to smaller communities.

## Solution

A barangay-scale resilience system built around one idea: **the neighborhood itself becomes both the delivery network and the sensor network.**

- **Multi-channel alert delivery** — alerts reach residents over live internet first; push notification with retry; if that's down, cached data pre-stored on the device. A "Share Alert" button lets residents forward alerts to neighbors via Messenger/WhatsApp/Viber/SMS through their own messaging apps.
- **Street-level evacuation guidance** — each zone (barangay or sub-zone) has pre-authored, specific instructions ("Zone 3 → evacuate to San Isidro Elementary via Rizal St."), not a generic bulletin.
- **Crowdsourced water-level sensing** — residents report flood depth against a simple visual reference (ankle/knee/waist/neck-deep). Enough reports crossing a threshold in one zone automatically triggers an alert — a zero-hardware, instantly-scalable substitute for physical water-level sensors.

## Target Users

Residents of flood- and typhoon-prone barangays, and local Disaster Risk Reduction and Management Offices (DRRMOs) responsible for issuing evacuation guidance.

## Why It's Different

Existing Philippine tools — national hazard maps, flood dashboards, cell broadcast, even crowdsourced flood-report apps — all still assume a live connection to reach people or to collect data. This system is built for the moment that assumption fails: a push notification with retry and user-initiated sharing keeps new alerts moving through an outage, and the community's own observations stand in for sensor hardware nobody can afford to deploy at scale. It complements official sources like PAGASA and Project NOAH by solving distribution and ground-truth data at the exact moment their usual channels go dark.

## Feasibility

Phase 1 (this challenge): a web-based, installable app (PWA) — offline-cached alerts, per-zone evacuation instructions, push notification with retry, and crowdsourced water-level reporting with auto-triggered alerts. Built on a proven stack (Next.js + Supabase), developed hi-fi prototype first, then functional build, full implementation, and final testing.

# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

<!-- Add new entries here as work is merged. Move them to a versioned section on release. -->

---

## [0.1-launch-candidate] — 2026-05-19

First official release of **OffGrid Solar Builder**, a professional-grade residential solar design estimator for homeowners and contractors.

**Tag:** `v0.1-launch-candidate` · **Commit:** `3967ae70c3` · **Branch:** `launch-mvp`

### Added

#### Guided Design Wizard
- Multi-step wizard collects property address (with geocoding via OpenStreetMap/Nominatim), annual energy usage, utility rate, and system goals (off-grid, grid-tied, or hybrid)
- Configurable backup autonomy hours and site conditions (shade, roof pitch, snow/wind environment)

#### Engineering Calculation Engine
- Dual-path sizing logic: uses NREL PVWatts v8 API when a key is provided, falls back to state-level peak sun hour (PSH) estimates
- Full loss modeling: inverter, wiring, shade, temperature, dirt, and battery round-trip losses
- Off-grid path sized to winter design sun / worst-month scenario; grid-tied path sized for annual bill offset
- Inverter surge reserve and battery temperature derating for cold climates

#### Solar Design Report
- System summary: recommended array size (kW), panel count, battery capacity (usable vs. total), and inverter rating
- Interactive monthly production and solar radiation charts (Recharts)
- Project location map (Leaflet / OpenStreetMap)
- Bill of Materials with live market price estimates across Economy, Mid-range, and Premium equipment tiers, with alternative brand options
- Context-aware design notes and safety warnings based on user inputs

#### Payments & Report Unlock
- Stripe Checkout integration gates the full design report (BOM, financial payback analysis, PDF download)
- Unpaid users see basic system sizing as a free preview

#### Project Management
- Dashboard to view and manage saved designs with aggregate stats
- UUID-based access tokens for private project sharing without requiring account creation

#### Admin & AI Tools
- Settings page for editing global calculation constants (panel wattage, cost-per-watt tiers, default losses)
- AI Solar Assistant chat interface for explaining solar terminology and design decisions

#### Infrastructure
- React + Vite frontend with shadcn/ui and Tailwind CSS (mobile-responsive)
- Express API server with PostgreSQL persistence via Drizzle ORM
- OpenAPI-generated type-safe client

---

[Unreleased]: https://github.com/inhouseconsulting2018-star/off-grid-builder/compare/v0.1-launch-candidate...HEAD
[0.1-launch-candidate]: https://github.com/inhouseconsulting2018-star/off-grid-builder/releases/tag/v0.1-launch-candidate

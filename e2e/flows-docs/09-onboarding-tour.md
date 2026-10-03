# 09-onboarding-tour

**Spec:** SPEC-02 (AC-4, AC-13, AC-18) — `specs/SPEC-02-onboarding-generator.md`.

**User journey:** Open a cloned repo's Onboarding Tour page, see the empty state, click Generate, get the tour in place.

**Fixture:** the seeded `acme/payments-api` has a clone directory (written by `scripts/e2e.sh` / `.github/workflows/e2e-web.yml` into `DEVDIGEST_CLONE_DIR`) and no stored tour.

**What it tests:**
- AC-13: empty state "Generate onboarding tour" with the cost line.
- AC-18: Generate renders the tour without a page reload (no `open` between click and assertions).
- AC-4: heading "Onboarding for payments-api", the "Generated from index of" line, and the five sections.

**Notes:**
- Keyless by construction (see flow 08): the API has no key, so generation returns the skeleton with reason `no_api_key`; the flow asserts the "Skeleton — AI summary unavailable: no API key for openrouter" banner. A stack with a key yields an AI tour and fails that step; use the hermetic runner.
- Not covered here: AI-generated banner (needs a paid call), section order (unit-tested, AC-4).

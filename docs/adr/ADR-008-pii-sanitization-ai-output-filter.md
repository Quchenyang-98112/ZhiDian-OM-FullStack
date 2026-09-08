# ADR-008: PII Sanitization & AI Output Filtering

- **Status:** Accepted
- **Date:** 2026-04-25
- **Deciders:** @qnbs
- **Supersedes:** Basic prompt injection sanitization only (pre-2026-04-25)

## Context

`sanitizeForPrompt()` in `apps/web/src/core/aiClient.ts` currently:
- ✅ Removes Unicode control characters
- ✅ Strips prompt injection prefixes (ignore/disregard/forget/override)
- ✅ Truncates to 64 characters

Missing:
- ❌ PII detection (email addresses, phone numbers, IBAN, IP addresses)
- ❌ AI output filtering (response validation before returning to UI)
- ❌ Sensitive data masking in structured output

This creates risk of:
1. User-entered device labels containing email addresses → leaked to external AI APIs
2. AI responses containing hallucinated PII about the user/location
3. AI output injection (model outputs malicious JS/HTML that UI renders)

## Decision

### 1. PII Masking in Input Sanitization

Extend `sanitizeForPrompt()` with PII pattern detection and masking:

```typescript
const PII_PATTERNS: Array<[RegExp, string]> = [
  [/\b[A-Z]{2}\d{2}[A-Z0-9]{11,27}\b/g, '[IBAN]'],
  [/\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g, '[IP]'],
  [/[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g, '[EMAIL]'],
  [/\b(\+\d{1,3}[-.\s]?)?\(?\d{1,4}\)?[-.\s]?\d{1,4}[-.\s]?\d{1,9}\b/g, '[PHONE]'],
];
```

### 2. AI Output Filtering

New `filterAIOutput()` function validates AI responses before returning to UI:

```typescript
export function filterAIOutput(response: string): string {
  // Remove any remaining PII patterns that leaked through
  // Strip script injection patterns
  // Validate JSON structure if structured output expected
  // Truncate to MAX_RESPONSE_LENGTH
}
```

### 3. Scope of Application

PII masking applied to:
- Device names, labels, location strings passed as context
- User-entered optimization notes
- Value strings from unknown sensor fields

**NOT applied to:**
- Numeric energy data (kW, kWh, €/kWh, SoC %)
- Provider names from the hardware registry
- Timestamps / ISO 8601 strings

## Rationale

- **GDPR compliance** — prevents accidental PII transmission to external AI APIs
- **Defense in depth** — supplements encrypted key vault with data-level protection
- **Output safety** — LLM outputs should never reach the DOM unfiltered

## Limitations

This implementation uses regex-based heuristics, which:
- May have false positives on legitimate device labels
- Cannot detect all PII forms (names, addresses not covered)
- Does not replace a full NLP-based PII scanner for regulated environments

For regulated deployments (GDPR Article 25 data minimization), consider:
- Microsoft Presidio (self-hosted PII scanning)
- AWS Comprehend (cloud PII detection)

## Consequences

**Positive:**
- Email/phone/IBAN in device labels masked before AI API calls
- AI responses filtered for injection patterns
- Audit log redacts PII from prompt context

**Negative:**
- Regex false positives may mask valid device label characters
- `[EMAIL]` / `[PHONE]` masked strings lose context for AI optimization
- Performance overhead: ~0.1 ms per sanitization call (acceptable)

## Related Files

- `apps/web/src/core/aiClient.ts` — implementation
- `apps/web/src/tests/pii-sanitization.test.ts` — tests
- `docs/Security-Architecture.md` — threat model
- `docs/Security-Roadmap-2026.md` — security planning

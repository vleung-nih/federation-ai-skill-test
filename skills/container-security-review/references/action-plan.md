# Phase 6 — Action Plan

**Do not apply any fix yet.** Present the plan and wait for user confirmation.

---

## 6a. Fix action deduplication

Before building the numbered list, group findings by their fix action:

- Multiple OS findings that share the same `(current FROM, candidate tag)` → one action. List all CVE IDs it resolves.
- Multiple App findings that share the same `(package name, target version, location)` → one action. List all CVE IDs it resolves.

Each numbered item is one unique fix action, not one CVE.

---

## 6b. Present the action plan

Use this format (target label depends on mode):

```
CVE Review — <target>
Scanners used: <scanner-1>, <scanner-2>

CRITICAL / HIGH — Action Required (<N> fix actions, resolves <X> CVEs)

[1] BASE IMAGE UPDATE · resolves <CVE-IDs>
    Current: <current-FROM>
    Candidates:
      a) <candidate-a> — <CRITICAL Δ> CRITICAL, <HIGH Δ> HIGH vs current (<note>)
      b) <candidate-b> — <CRITICAL Δ> CRITICAL, <HIGH Δ> HIGH vs current (<note>)
    → Recommend: <candidate-a> (<reason>)

[2] <CVE-ID> · <SEVERITY> · App · <package> <version> · <location>
    Fixed in: <fixed_in>
    → <ecosystem fix command>

[N] <CVE-ID> · <SEVERITY> · <category> · <package> · no fix available
    (listed for awareness — no action possible)

MEDIUM / LOW — For Awareness (<M> CVEs)
| CVE | Severity | Category | Package | Version | Fix available |
|---|---|---|---|---|---|
| CVE-... | MEDIUM | OS | curl | 7.68.0 | yes (7.88.1) |
...

Proceed with the action plan above? (all / select numbers / no)
```

If `MODE=prebuild`: omit `BASE IMAGE UPDATE` entries and include this note once at the top of the action list:
> "Base-image upgrade actions require image mode after build."

---

## 6c. Parse user confirmation

Wait for the user's reply. Accept the following forms:

| Input | Effect |
|---|---|
| `all` | Apply every numbered action |
| `1 2 3` or `1,2,3` or `1-3` | Apply only the listed action numbers |
| `no` or `n` | Apply nothing; proceed to Phase 8 with zero fixes attempted |

Build the confirmed action list and proceed to Phase 7.

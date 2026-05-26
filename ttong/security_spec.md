# Security Spec for Welshare App

## Data Invariants
1. **Identity Integrity**: All documents should be created by authenticated users.
2. **Drivers**: Must have `name` (string, max 50 chars) and `phone` (string, max 20 chars).
3. **Schedules**: Documents are keyed by `{year}_{month}_{sido}_{sigungu}`. `items` must be an array.
4. **Official Docs**: `timestamp` must be a valid ISO string or server timestamp.
5. **Settings**: Keys must be from a predefined set (`docFormatSettings`, `defaultSido`, etc.).

## The Dirty Dozen (Attack Vectors)
1. **Unauthenticated Write**: Attempting to add a driver without being logged in.
2. **ID Spoofing**: Attempting to write to `officialDocs/somebody_elses_id`.
3. **Invalid Type**: Sending a string for `year` in schedules.
4. **Resource Exhaustion**: Sending a 2MB string for `driver.name`.
5. **Shadow Fields**: Adding `isAdmin: true` to a driver document.
6. **Immutable field breach**: Trying to change the `year` of an existing schedule.
7. **Orphaned Writes**: Creating a schedule for a non-existent year (validation).
8. **PII Leak**: Reading all drivers without matching a specific organization (though orgs aren't implemented yet, we'll require basic auth).
9. **Query Scraping**: Listing all official docs without any filters (if we were to implement ownership).
10. **State Shortcutting**: Skipping doc number sequence (mostly application logic, but rules can enforce non-negative doc numbers).
11. **Regex Bypass**: Using `/../` as a doc ID.
12. **Null Poisoning**: Sending `null` for required fields.

## Test Runner (Conceptual)
We will verify that:
- `allow read, write: if isSignedIn()` is the baseline.
- `isValidDriver(incoming())` checks types and sizes.
- `affectedKeys().hasOnly(...)` ensures no ghost fields.

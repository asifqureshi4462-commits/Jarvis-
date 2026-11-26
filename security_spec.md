# J.A.R.V.I.S. Firestore Security Specification

## Data Invariants
1. Every document under `/users/{userId}` and its subcollections (`memories`, `tasks`, `messages`, `notes`, `settings`) is strictly private to the verified authenticated owner (`request.auth.uid == userId && request.auth.token.email_verified == true`).
2. Subcollection documents cannot exist without a valid parent `/users/{userId}` root document (`exists(/databases/$(database)/documents/users/$(userId))`).
3. Every subcollection document stores `userId == request.auth.uid`, immutable after creation.
4. All string fields enforce explicit `min`/`max` `.size()` boundaries; all document IDs enforce `^[a-zA-Z0-9_-]+$` and `<= 128` chars.
5. `createdAt` is immutable and must equal `request.time` on creation; `updatedAt` must equal `request.time` on creation and update.
6. No client write may inject extra shadow keys (`hasOnly(...)` enforced on both `create` and `affectedKeys()` on `update`).

## Dirty Dozen Adversarial Payloads
1. **Unauthenticated read/write**: `auth = null` attempting `get /users/u1/memories/m1` -> PERMISSION_DENIED.
2. **Unverified email write**: `auth = { uid: "u1", token: { email_verified: false } }` creating task -> PERMISSION_DENIED.
3. **Cross-tenant read**: `auth = { uid: "u2", token: { email_verified: true } }` listing `/users/u1/memories` -> PERMISSION_DENIED.
4. **Identity spoofing on create**: `u1` creates `/users/u1/memories/m1` with `{ userId: "u2", ... }` -> PERMISSION_DENIED.
5. **Shadow field injection**: `u1` creates `/users/u1/tasks/t1` with `{ ..., isAdmin: true }` -> PERMISSION_DENIED.
6. **Shadow update injection**: `u1` updates `/users/u1/tasks/t1` with `{ completed: true, ownerOverride: "x" }` -> PERMISSION_DENIED.
7. **Immutable field tampering**: `u1` updates `/users/u1/tasks/t1` changing `userId` or `createdAt` -> PERMISSION_DENIED.
8. **Timestamp forgery**: `u1` creates `/users/u1/notes/n1` with client-supplied past `createdAt` -> PERMISSION_DENIED.
9. **ID poisoning**: `u1` writes `/users/u1/memories/${'a'.repeat(200)}` -> PERMISSION_DENIED.
10. **Oversized payload DoW**: `u1` writes memory with `content` > 2000 chars -> PERMISSION_DENIED.
11. **Invalid enum / type**: `u1` writes task with `priority: "critical"` or `completed: "yes"` -> PERMISSION_DENIED.
12. **Orphaned subcollection write**: `u1` creates `/users/u1/memories/m1` when `/users/u1` does not exist -> PERMISSION_DENIED.

# Entity Relationship Diagram — UstoGo

**Version:** 1.0.0
**Last updated:** 2026-07-29
**Companion document:** `DATABASE.md` (field-level specification)

Diagrams below are Mermaid. Field lists are abbreviated to keys and discriminators; the full column specification lives in `DATABASE.md`.

---

## 1. Identity & Sessions

```mermaid
erDiagram
    USER ||--o| CLIENT_PROFILE : "has (role=CLIENT)"
    USER ||--o| MASTER_PROFILE : "has (role=MASTER)"
    USER ||--o{ REFRESH_TOKEN : owns
    USER ||--o{ PASSWORD_RESET_TOKEN : requests
    USER ||--o{ NOTIFICATION : receives
    USER ||--o{ AUDIT_LOG : "performs (admin)"
    CITY ||--o{ CLIENT_PROFILE : locates
    CITY ||--o{ MASTER_PROFILE : locates

    USER {
        uuid id PK
        citext email UK
        varchar phone UK
        varchar password_hash
        enum role
        enum status
        timestamptz deleted_at
    }
    CLIENT_PROFILE {
        uuid id PK
        uuid user_id FK,UK
        varchar first_name
        varchar last_name
        uuid city_id FK
        uuid avatar_file_id FK
    }
    MASTER_PROFILE {
        uuid id PK
        uuid user_id FK,UK
        varchar display_name
        enum approval_status
        boolean is_active
        decimal rating_average
        int rating_count
        varchar timezone
        tsvector search_vector
    }
    REFRESH_TOKEN {
        uuid id PK
        uuid user_id FK
        varchar token_hash UK
        uuid family_id
        timestamptz used_at
        timestamptz revoked_at
    }
```

---

## 2. Catalogue & Availability

```mermaid
erDiagram
    CATEGORY ||--o{ CATEGORY : "parent of (depth<=3)"
    CATEGORY ||--o{ SERVICE : classifies
    CATEGORY ||--o{ MASTER_CATEGORY : "attached via"
    MASTER_PROFILE ||--o{ MASTER_CATEGORY : declares
    MASTER_PROFILE ||--o{ SERVICE : publishes
    MASTER_PROFILE ||--o{ WORKING_DAY : "weekly availability"
    MASTER_PROFILE ||--o{ SCHEDULE_EXCEPTION : "date override"
    MASTER_PROFILE ||--o{ CERTIFICATE : proves

    CATEGORY {
        uuid id PK
        uuid parent_id FK
        varchar slug UK
        varchar name
        smallint depth
        boolean is_active
    }
    SERVICE {
        uuid id PK
        uuid master_profile_id FK
        uuid category_id FK
        varchar title
        enum price_type
        decimal price
        int duration_minutes
        boolean is_active
    }
    WORKING_DAY {
        uuid id PK
        uuid master_profile_id FK
        smallint weekday
        time start_time
        time end_time
    }
    SCHEDULE_EXCEPTION {
        uuid id PK
        uuid master_profile_id FK
        date date UK
        boolean is_day_off
        time start_time
        time end_time
    }
```

---

## 3. Booking Core

```mermaid
erDiagram
    CLIENT_PROFILE ||--o{ BOOKING : requests
    MASTER_PROFILE ||--o{ BOOKING : fulfils
    SERVICE ||--o{ BOOKING : "snapshotted into"
    BOOKING ||--o{ BOOKING_STATUS_HISTORY : "append-only trail"
    BOOKING ||--o| REVIEW : "may receive (1:1)"
    REVIEW ||--o| REVIEW_REPLY : "answered by"
    MASTER_PROFILE ||--o{ REVIEW : "is rated in"
    CLIENT_PROFILE ||--o{ REVIEW : writes

    BOOKING {
        uuid id PK
        varchar booking_number UK
        uuid client_profile_id FK
        uuid master_profile_id FK
        uuid service_id FK
        enum status
        timestamptz scheduled_at
        timestamptz ends_at
        varchar service_title "snapshot"
        decimal price "snapshot"
        boolean is_late_cancellation
    }
    BOOKING_STATUS_HISTORY {
        uuid id PK
        uuid booking_id FK
        enum from_status
        enum to_status
        enum actor_type
        uuid actor_user_id
        varchar reason
        timestamptz created_at
    }
    REVIEW {
        uuid id PK
        uuid booking_id FK,UK
        uuid client_profile_id FK
        uuid master_profile_id FK
        smallint rating
        varchar comment
        enum status
    }
    REVIEW_REPLY {
        uuid id PK
        uuid review_id FK,UK
        uuid master_profile_id FK
        varchar body
    }
```

**Critical constraints visible here**
- `REVIEW.booking_id` is **unique** → one review per booking (BR-51)
- `REVIEW_REPLY.review_id` is **unique** → one reply per review (BR-57)
- `BOOKING_STATUS_HISTORY` has no update or delete path → immutable audit of the lifecycle (BR-46)
- `BOOKING` carries a price/title snapshot → editing or deleting a `SERVICE` never rewrites history

---

## 4. Messaging, Notifications, Content

```mermaid
erDiagram
    CLIENT_PROFILE ||--o{ CONVERSATION : participates
    MASTER_PROFILE ||--o{ CONVERSATION : participates
    CONVERSATION ||--o{ MESSAGE : contains
    USER ||--o{ MESSAGE : sends
    MESSAGE ||--o{ MESSAGE_ATTACHMENT : carries
    FILE ||--o{ MESSAGE_ATTACHMENT : "stored as"
    FILE ||--o{ CERTIFICATE : "stored as"
    FILE ||--o{ BANNER : "stored as"
    USER ||--o{ BANNER : "created by (admin)"

    CONVERSATION {
        uuid id PK
        uuid client_profile_id FK
        uuid master_profile_id FK
        timestamptz last_message_at
    }
    MESSAGE {
        uuid id PK
        uuid conversation_id FK
        uuid sender_user_id FK
        varchar body
        timestamptz read_at
    }
    NOTIFICATION {
        uuid id PK
        uuid user_id FK
        enum type
        jsonb payload
        boolean is_read
    }
    FILE {
        uuid id PK
        varchar key UK
        varchar mime_type
        bigint size_bytes
        enum purpose
        boolean is_confirmed
    }
    BANNER {
        uuid id PK
        uuid image_file_id FK
        enum position
        int sort_order
        timestamptz starts_at
        timestamptz ends_at
        boolean is_active
    }
```

`CONVERSATION` has a unique `(client_profile_id, master_profile_id)` pair, so a client and a master can never accumulate duplicate threads (BR-60).

---

## 5. Full Model Overview

```mermaid
graph TD
    U[User] --> CP[ClientProfile]
    U --> MP[MasterProfile]
    U --> RT[RefreshToken]
    U --> PRT[PasswordResetToken]
    U --> N[Notification]
    U --> AL[AuditLog]

    CITY[City] --> CP
    CITY --> MP

    CAT[Category] --> CAT
    CAT --> SVC[Service]
    MP --> MC[MasterCategory] --> CAT
    MP --> SVC
    MP --> WD[WorkingDay]
    MP --> SE[ScheduleException]
    MP --> CERT[Certificate]

    CP --> B[Booking]
    MP --> B
    SVC -.snapshot.-> B
    B --> BSH[BookingStatusHistory]
    B --> REV[Review]
    REV --> RR[ReviewReply]

    CP --> CONV[Conversation]
    MP --> CONV
    CONV --> MSG[Message]
    MSG --> MA[MessageAttachment]

    F[File] --> CERT
    F --> MA
    F --> BAN[Banner]

    classDef core fill:#1f6feb,stroke:#0d419d,color:#fff
    classDef audit fill:#6e7681,stroke:#484f58,color:#fff
    class U,MP,CP,B core
    class AL,BSH audit
```

---

## 6. Cardinality Reference

| Relationship | Cardinality | Delete behaviour |
| --- | --- | --- |
| User → ClientProfile | 1 : 0..1 | Cascade |
| User → MasterProfile | 1 : 0..1 | Cascade |
| User → RefreshToken | 1 : 0..* | Cascade |
| MasterProfile ↔ Category | * : * (via MasterCategory) | Cascade on the join row |
| MasterProfile → Service | 1 : 0..* | Cascade (soft delete in practice) |
| Category → Service | 1 : 0..* | **Restrict** |
| Category → Category | 1 : 0..* | **Restrict** |
| MasterProfile → WorkingDay | 1 : 0..* | Cascade |
| MasterProfile → ScheduleException | 1 : 0..* | Cascade |
| ClientProfile → Booking | 1 : 0..* | **Restrict** |
| MasterProfile → Booking | 1 : 0..* | **Restrict** |
| Service → Booking | 1 : 0..* | **Restrict** (snapshot protects history) |
| Booking → BookingStatusHistory | 1 : 1..* | Cascade |
| Booking → Review | 1 : 0..1 | **Restrict** |
| Review → ReviewReply | 1 : 0..1 | Cascade |
| Conversation → Message | 1 : 0..* | Cascade |
| Message → MessageAttachment | 1 : 0..* | Cascade |
| File → any owner | 1 : 0..* | **Restrict** |

`Restrict` is the default because business entities are soft-deleted; a hard delete that would orphan history is a programming error and should fail loudly.

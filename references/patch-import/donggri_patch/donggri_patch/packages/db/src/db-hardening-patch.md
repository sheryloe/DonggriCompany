# SQLite 하드닝 패치 (claw-empire 레퍼런스)

`packages/db/src/index.ts` 또는 DB 초기화 코드에 아래 내용을 추가한다.

```typescript
// claw-empire 참조: WAL 모드 + busy_timeout으로 동시성 충돌 방지
db.exec("PRAGMA journal_mode = WAL");
db.exec("PRAGMA busy_timeout = 5000");  // 5초 대기 후 SQLITE_BUSY 에러
db.exec("PRAGMA foreign_keys = ON");
db.exec("PRAGMA synchronous = NORMAL"); // WAL과 함께 쓸 때 성능/안전 균형
```

## 적용 이유

| PRAGMA | 효과 |
|--------|------|
| `journal_mode = WAL` | Write-Ahead Logging으로 읽기/쓰기 동시성 개선. 다중 리더 + 단일 라이터 패턴에서 lock 충돌 대폭 감소. |
| `busy_timeout = 5000` | lock 경합 시 즉시 에러 대신 최대 5초 재시도. 고아 트랜잭션이 끝날 때까지 대기. |
| `foreign_keys = ON` | 외래 키 제약 활성화. SQLite 기본값은 OFF이므로 명시 필요. |
| `synchronous = NORMAL` | WAL 모드 사용 시 FULL보다 빠르고 OFF보다 안전한 균형점. |

## 적용 예시

```typescript
import Database from "better-sqlite3";

export function openDb(path: string): Database.Database {
  const db = new Database(path);
  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA busy_timeout = 5000");
  db.exec("PRAGMA foreign_keys = ON");
  db.exec("PRAGMA synchronous = NORMAL");
  return db;
}
```

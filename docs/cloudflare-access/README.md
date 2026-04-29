# Cloudflare Access 개인 전용 운영 명세서 세트

작성일: 2026-04-29
대상: DonggriCompany 외부 접속 대시보드
기준: Cloudflare Tunnel + Cloudflare Access, ISO 9001:2015 품질경영 체계

## 결론

DonggriCompany는 정적 웹 호스팅 대상이 아니라 로컬 실행형 운영 시스템이다.

따라서 외부 접속은 다음 구조로 고정한다.

```text
외부 브라우저
  -> Cloudflare Access 인증
  -> Cloudflare Tunnel
  -> 내 PC 또는 Docker의 DonggriCompany 서버
  -> SQLite / Codex runner / Telegram relay / WebSocket
```

## 생성 문서

| 문서 | 목적 |
| --- | --- |
| [00-required-cloudflare-info.md](./00-required-cloudflare-info.md) | 사용자가 제공해야 하는 Cloudflare 정보와 제공 금지 secret 구분 |
| [01-prn-cloudflare-access.md](./01-prn-cloudflare-access.md) | PRN 요구사항 명세서 |
| [02-build-cloudflare-access.md](./02-build-cloudflare-access.md) | 구축 명세서 및 PowerShell 실행 절차 |
| [03-design-cloudflare-access.md](./03-design-cloudflare-access.md) | 시스템 설계 명세서 |
| [04-iso9001-qms-cloudflare-access.md](./04-iso9001-qms-cloudflare-access.md) | ISO 9001 품질운영 명세서 |

## 지금 필요한 정보

아래 정보만 보내면 된다. token, secret, credentials JSON은 보내지 않는다.

```text
1. 사용할 도메인:
2. 사용할 서브도메인:
3. Cloudflare DNS full setup 여부:
4. Access 로그인 방식:
5. 허용할 내 이메일:
6. 세션 유지 시간:
7. Tunnel 이름:
8. 원본 서버 포트:
9. Docker 기준으로 운영할지:
10. Telegram Web App을 2차 단계로 만들지:
```

권장 기본값:

```text
도메인: 사용자가 보유한 Cloudflare 활성 도메인
서브도메인: donggri-company.<도메인>
DNS: full setup
로그인: Google 또는 One-time PIN
허용 이메일: 사용자 본인 이메일 1개
세션 유지: 8h
Tunnel 이름: donggri-company
원본 서버 포트: 8900
운영 방식: Docker
Telegram Web App: 후순위
```

## 공식 기준

- Cloudflare Access self-hosted application은 Access application을 먼저 만들고 tunnel route를 연결해야 공개 노출을 막을 수 있다.
- Cloudflare Access policy는 Allow, Block, Bypass, Service Auth로 접근을 결정한다. 운영 대시보드에는 Bypass를 쓰지 않는다.
- ISO 공식 문서 기준 현재 운영 기준은 ISO 9001:2015다. ISO/FDIS 9001은 정식 승인 전 단계이므로 본 명세는 `ISO 9001:2015 기반 + 2026 전환 대비`로 작성한다.

## 참고 자료

- [Cloudflare self-hosted app 공식 문서](https://developers.cloudflare.com/cloudflare-one/applications/configure-apps/self-hosted-apps/)
- [Cloudflare Access policy 공식 문서](https://developers.cloudflare.com/cloudflare-one/access-controls/policies/)
- [ISO 9001:2015 공식 문서](https://www.iso.org/standard/62085.html)
- [ISO/FDIS 9001 개발 상태](https://www.iso.org/standard/88464.html)

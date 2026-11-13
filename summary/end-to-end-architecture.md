# End-to-End Architecture

This diagram captures the full runtime flow for SyncMove, including user traffic, app services, message delivery, database persistence, media relay, and failover patterns.

```mermaid
flowchart LR
    U[Users / Browser Clients]

    subgraph Browser[Browser / Client Runtime]
      WEB[Next.js Web App]
      AUTH[Clerk Auth]
      SOCK[Socket.IO / realtime channel]
      E2EE[App-layer E2EE\nAES-GCM + X3DH]
      MEDIA[WebRTC media session\nICE + DTLS-SRTP]
    end

    subgraph Ingress[Ingress / Edge]
      NGINX[NGINX\nPort 80\nLoad balancer]
    end

    subgraph App[Application Nodes]
      A1[App Node 1\nNext.js API\nmessage logic]
      A2[App Node 2\nNext.js API\nmessage logic]
      REDIS[Redis\nPub/Sub + fan-out\nstate coordination]
    end

    subgraph Data[Durable Data Layer]
      PRIMARY[MariaDB Primary\nACID write source]
      REPLICA[MariaDB Replica\nread scale / reporting]
      FAILOVER[Failover watcher\npromote replica on primary loss]
    end

    subgraph MediaNet[Media / Relay]
      TURN[Coturn TURN\nNAT traversal / relay]
      WEBRTC[Audio / Video rooms\nbrowser codecs + ICE]
    end

    subgraph External[External Services]
      UPLOAD[UploadThing\nfile storage]
      CLERK[Clerk\nidentity provider]
    end

    U --> WEB
    AUTH --> CLERK
    WEB --> NGINX
    SOCK --> NGINX
    MEDIA --> TURN

    NGINX --> A1
    NGINX --> A2

    A1 <--> REDIS
    A2 <--> REDIS

    A1 -->|write transaction| PRIMARY
    A2 -->|write transaction| PRIMARY
    A1 -->|read / reporting| REPLICA
    A2 -->|read / reporting| REPLICA

    PRIMARY --> FAILOVER
    FAILOVER -->|promote on outage| REPLICA
    FAILOVER -->|rejoin recovered primary| PRIMARY

    WEB -->|encrypted text / file payloads| E2EE
    E2EE --> A1
    E2EE --> A2

    WEB -->|upload encrypted file| UPLOAD
    UPLOAD -->|metadata + file refs| PRIMARY

    WEBRTC -->|browser media codec compression| MEDIA
    MEDIA --> TURN
    TURN -->|relay fallback| WEBRTC

    WEB -->|Socket events| A1
    WEB -->|Socket events| A2

    classDef app fill:#E8F1FF,stroke:#4C78A8,color:#111;
    classDef data fill:#EAF7EA,stroke:#3B7A57,color:#111;
    classDef media fill:#FFF4D6,stroke:#B07A00,color:#111;
    classDef ext fill:#FDECEC,stroke:#B23A48,color:#111;

    class A1,A2,REDIS app;
    class PRIMARY,REPLICA,FAILOVER data;
    class TURN,WEBRTC,MEDIA media;
    class UPLOAD,CLERK ext;
```

## End-to-end flow

1. User opens the Next.js app in the browser.
2. Authentication is provided by Clerk and session identity is established.
3. Browser sends realtime messages and channel actions through NGINX to the app nodes.
4. App nodes coordinate realtime delivery with Redis pub/sub and fan-out logic.
5. Message and file data are persisted in MariaDB primary; reads can be served by the replica.
6. Text and file payloads are compressed and encrypted in the app layer before transport and storage.
7. Audio and video calls use WebRTC transport encryption via DTLS-SRTP, with TURN used as the relay/fallback for NAT traversal.
8. If the primary MariaDB becomes unavailable, the failover watcher promotes the replica. Once the old primary recovers, it rejoins as a replica of the promoted primary.

## Failure and scale considerations

- One app node can fail without taking the whole stack down.
- Primary DB outage blocks writes unless failover promotes the replica.
- Redis is the first major bottleneck under heavy message fan-out.
- TURN is required for peer-to-peer media when direct UDP connectivity is blocked by NAT or firewalls.
- The local stack is sized for staging and bounded developer deployments rather than massive global traffic.

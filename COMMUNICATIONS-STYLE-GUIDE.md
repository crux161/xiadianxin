Treat Architecture: Identity, Burners, & 0RTT Friendship
This document outlines the architectural responsibilities across the Treat (XiaDianxin) ecosystem for handling user identities, ephemeral connections (Burner Codes), and the cryptographic transition from temporary peers to persistent friends.

The system spans three distinct codebases:

Omiai (Elixir): The signaling and presence registry.

Sankaku-Core / Jet-Alone (Rust): The QUIC-based peer-to-peer transport and cryptographic engine.

XiaDianxin (Tauri/React): The user-facing client.

1. Omiai (Elixir Signaling Server)
Omiai acts as the central switchboard. It does not handle media or bulk data; it strictly routes initial connection intents and maintains the global mapping of active peers.

1.1 QuicDial Registration & Presence

State Management: When a user boots Treat, the app connects to Omiai via WebSockets (or WebTransport). Omiai maps the user's persistent 9-digit QuicDial code to their current public IP address and port.

Heartbeat: Clients ping Omiai periodically. If a client drops, Omiai removes their IP mapping, marking them "offline."

1.2 Burner Code Lifecycle

Burner codes are ephemeral routing addresses designed for physical distribution (e.g., printed stickers) or one-time digital sharing.

Generation: The client requests a Burner Code. Omiai generates a unique, temporary sequence (distinct from standard 9-digit QuicDial codes) and maps it to the requesting user's current session.

Routing: When Peer B dials the Burner Code, Omiai looks up the underlying user (Peer A) and forwards the QUIC connection intent.

The "Burn" (Invalidation): The instant Omiai successfully brokers the handshake between Peer A and Peer B, the Burner Code is permanently deleted from the database. Subsequent attempts to dial it will return a 404 Not Found or Invalid Code error.

2. Sankaku-Core "Jet-Alone" (Rust P2P Engine)
Once Omiai brokers the connection, sankaku-core takes over. The QUIC connection (quinn) established between the two peers is fully end-to-end encrypted using self-signed certificates.

2.1 The Burner Session

During a Burner call, both peers possess temporary, randomized identities. They are communicating over a secure QUIC tunnel, but neither peer has cryptographically verified the other's long-term identity.

2.2 The Friendship Key Exchange

When users in a Burner session decide to become "Friends," they must exchange a verifiable proof of identity to bypass the Burner system in the future.

Key Generation: Upon accepting a friend request, Sankaku generates a unique Symmetric Pair Key (or exchanges public Ed25519 identity keys) specifically for this relationship.

Secure Transit: This key is sent over the already-secured QUIC data stream (sankaku-core/src/call_ffi.rs), ensuring it cannot be intercepted by Omiai or local network snoopers.

Mutual Authentication: Both peers store this Shared Key locally.

2.3 0RTT Friendship Connections

Once the Shared Key is stored, future calls between these two peers bypass standard signaling overhead:

If discovered via local mDNS, Sankaku immediately establishes a QUIC connection using the Shared Key for mutual authentication (0-RTT).

If on different networks, the client asks Omiai for the friend's IP. Omiai provides the IP, but Sankaku establishes the secure tunnel using the Shared Key, proving cryptographic continuity from the original Burner session.

3. XiaDianxin (Tauri / React Frontend)
The frontend is responsible for abstracting the complex cryptography into a seamless, fluid user experience.

3.1 Identity UI

Main Profile: Displays the permanent 9-digit QuicDial code.

Burner Generator: A distinct UI (e.g., inside the Dialer Modal) allowing the user to generate a Burner Code. This should visually differentiate itself from the main QuicDial (e.g., using a different format or displaying an "Ephemeral" warning) to clarify its one-time use.

3.2 In-Call Friendship Flow

The Request: During an active Burner session, the CallView.tsx component exposes an "Add Friend" button. Tapping this sends a control signal via the Sankaku Rust bridge to the other peer.

The Acceptance: The receiving peer gets a Semi Design <Toast> or <Modal> notification: "Peer wants to connect permanently. Accept?"

The Handshake: If accepted, the React frontend commands the Rust backend to execute the Friendship Key Exchange (Section 2.2).

3.3 Peer List Management

Visual Hierarchy: Once the Friendship Key is successfully exchanged, the peer is added to the local friends array in the React state.

Sorting: The App.tsx sidebar must automatically pin verified friends to the top of the "Peers" list.

Status Indication: Unverified/mDNS peers are listed below friends. If a friend drops offline (detected via Omiai presence or mDNS timeout), their avatar is grayed out, but they remain in the list permanently.

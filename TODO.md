# SyncMove - Development TODO

## Completed ✅
- E2EE Core Infrastructure (lib/e2ee/*) - X3DH, Double Ratchet, Key Storage
- Architecture Paper (papers/ZeroKnowledgeE2EEArchitecture.md)

---

## 1. BUG FIXES: Video/Audio Transfer Issues

### 1.1 WebRTC Issues
- [ ] **ICE Candidate Race Condition** - `pendingCandidates` uses wrong key (socketId vs fromId)
- [ ] **DTLS-SRTP Enforcement** - Add mandatory DTLS for encrypted media transport
- [ ] **TURN Servers** - Add NAT traversal support for corporate firewalls
- [ ] **WebRTC Certificate** - Generate TLS certificate for DTLS

### 1.2 Socket Issues  
- [ ] **Socket-level Auth** - Validate Clerk session on socket handshake
- [ ] **Heartbeat/Ping-Pong** - Add keepalive mechanism
- [ ] **Connection State** - Prevent race conditions on reconnect

---

## 2. REMOVE MOBILE-RELATED CODE (Laptop-Only)

### 2.1 Delete Files
- [ ] Delete `components/navigation/mobile-navigation.tsx`

### 2.2 Layout Simplification
- [ ] `app/(main)/(routes)/layout.tsx` - Remove mobile nav, use fixed sidebar
- [ ] `app/(main)/(routes)/servers/[serverID]/layout.tsx` - Remove responsive sidebar
- [ ] `app/(main)/(routes)/servers/[serverID]/channels/[channelID]/page.tsx` - Fix height calculation

### 2.3 Remove Responsive Classes
- [ ] Remove all `md:hidden` classes
- [ ] Remove all `md:flex` conditional layouts  
- [ ] Remove `pb-16` mobile padding
- [ ] Remove `sm:px-6` desktop overrides
- [ ] Use fixed `100vh` height

---

## 3. UI/UX IMPROVEMENTS

### 3.1 Z-Index Layering (Fix Modal/Popover Stacking)
| Location | Current | Fixed |
|----------|---------|-------|
| Emoji picker | z-20 | z-50 |
| Settings dropdown | z-30 | z-50 |
| All modals | varies | z-50 |
| Tooltips | z-40 | z-60 |

### 3.2 Border Radius Consistency
- **Standard**: All interactive elements use `rounded-xl`
- **Modals**: `rounded-2xl` (unified with nav items)
- **Buttons**: `rounded-xl`
- **Inputs**: `rounded-xl`
- **Cards**: `rounded-xl` or `rounded-2xl`

### 3.3 Interactive States
- [ ] Add proper hover transitions on all interactive elements
- [ ] Add focus-visible rings for keyboard navigation
- [ ] Add active/pressed states for buttons
- [ ] Fix emoji picker hover feedback

### 3.4 Accessibility
- [ ] Add `aria-label` to all icon-only buttons
- [ ] Add `aria-label` to navigation items
- [ ] Add keyboard shortcuts documentation
- [ ] Add focus management for modals

---

## 4. E2EE INTEGRATION

### 4.1 Key Bundle API
- [ ] `app/api/keys/route.ts` - Upload key bundle
- [ ] `app/api/keys/[userId]/route.ts` - Download peer's bundle
- [ ] `app/api/keys/[keyId]/route.ts` - Revoke keys

### 4.2 Prisma Schema Update
```prisma
model KeyBundle {
  id            String   @id @default(uuid())
  userId        String   @unique
  identityKey   String   @db.Text
  signedPreKey  String   @db.Text
  signature     String   @db.Text
  oneTimePreKey String?  @db.Text
  created       DateTime @default(now())
}
```

### 4.3 Message Hooks
- [ ] Encrypt in chat-input before send
- [ ] Decrypt in chat-messages on receive
- [ ] Handle encrypted file attachments
- [ ] Graceful fallback for non-E2EE messages

---

## 5. COMPONENT IMPROVEMENTS

### 5.1 CallRoom (Video/Audio)
- [ ] Fix border radius consistency
- [ ] Improve participant tile layout
- [ ] Add connection quality indicator
- [ ] Add error boundary for WebRTC failures

### 5.2 Chat Messages
- [ ] Improve message bubble design
- [ ] Add hover actions consistently
- [ ] Fix load older messages button styling
- [ ] Improve search results display

### 5.3 Chat Input
- [ ] Fix z-index for emoji picker
- [ ] Add emoji category tabs
- [ ] Improve file upload progress indicator
- [ ] Add typing indicator

### 5.4 Navigation
- [ ] Remove mobile navigation completely
- [ ] Improve active state indicators
- [ ] Add keyboard navigation
- [ ] Smooth hover transitions

---

## 6. VISUAL DESIGN SYSTEM

### 6.1 Color Consistency
| Element | Current | Standard |
|---------|---------|----------|
| Background | varies | #1e1f22 (dark) |
| Surface | varies | #2b2d31 |
| Hover | varies | #35373c |
| Border | varies | #404249 |
| Primary | varies | #5865f2 |
| Text primary | varies | #f2f3f5 |
| Text secondary | varies | #949ba4 |

### 6.2 Spacing System
- Base unit: 4px (0.25rem)
- xs: 4px (0.25rem) - gap-1
- sm: 8px (0.5rem) - gap-2
- md: 12px (0.75rem) - gap-3
- lg: 16px (1rem) - gap-4
- xl: 24px (1.5rem) - gap-6
- 2xl: 32px (2rem) - gap-8

### 6.3 Typography
- Headings: font-semibold, text-white
- Body: text-[#f2f3f5]
- Muted: text-[#949ba4]
- Links: text-[#a5b4fc]

---

## Implementation Order

1. **Week 1: Core Bug Fixes**
   - WebRTC ICE fix
   - DTLS enforcement  
   - Socket auth
   - Mobile removal (2-3 days)

2. **Week 2: UI Polish**
   - Z-index fixes
   - Border radius consistency
   - Interactive states
   - Accessibility

3. **Week 3: E2EE Integration**
   - Key bundle API
   - Message hooks
   - Database migration

4. **Week 4: Polish & Testing**
   - Visual design system
   - Component improvements
   - Testing

---

## Notes

### Design Principles
- **Desktop-first**: Remove all mobile responsive code
- **Consistency**: Unified border-radius, spacing, colors
- **Accessibility**: Full keyboard navigation, ARIA labels
- **Performance**: Lazy load heavy components

### File Changes Summary
| Action | Files |
|--------|-------|
| Delete | mobile-navigation.tsx |
| Modify | layout.tsx (x3) |
| Modify | call-room.tsx |
| Modify | chat-input.tsx |
| Modify | chat-messages.tsx |
| Modify | navigation-*.tsx (x4) |
| Modify | modals (x5) |
| New | api/keys/* |

### Testing Checklist
- [ ] Video call connects successfully
- [ ] Audio call connects successfully  
- [ ] ICE candidates exchanged correctly
- [ ] DTLS encryption active
- [ ] Mobile nav completely removed
- [ ] No responsive breakpoints remain
- [ ] All z-index layers correct
- [ ] Border radius consistent
- [ ] Hover states work
- [ ] Focus states work
- [ ] Aria labels present
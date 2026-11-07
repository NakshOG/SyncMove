# Implementation Plan

## Overview

This implementation plan details the tasks required to implement the UI/UX Improvements feature for SyncMove. The feature enhances user experience across member lists, chat messages, direct messages, chat input, and general styling.

## Tasks

## Phase 1: UI Foundation Components

### 1.1 Create reusable UI components

- [ ] 1.1.1 Create LoadingSpinner component
  - Add `components/ui/loading-spinner.tsx`
  - Implement size variants (sm, md, lg)
  - Add Lucide Loader2 icon with animate-spin class
  - Expose size prop for flexibility
  - Use consistent text-muted-foreground color
  - _Requirements: 5.3_
  - _Design: Loading States section

- [ ] 1.1.2 Create EmptyState component
  - Add `components/ui/empty-state.tsx`
  - Define props: icon, title, description, action
  - Use flexbox for center alignment
  - Support optional action button
  - Match design specs from chat empty state
  - _Requirements: 2.3_
  - _Design: Empty States section

- [ ] 1.1.3 Create scrollbar utility classes
  - Add to `app/globals.css`
  - Define `.scrollbar-thin` utility
  - Style webkit scrollbar (Chrome, Safari, Edge)
  - Style Firefox scrollbar
  - Add hover states for scrollbar track
  - Use CSS custom properties for theming
  - _Requirements: 5.1_
  - _Design: Scrollbar Styling section

### 1.2 Add global focus state styles

- [ ] 1.2.1 Enhance focus-visible styles
  - Add to `app/globals.css`
  - Define consistent focus ring styles
  - Use existing --ring CSS variable
  - Add focus-ring utility class
  - Ensure outline-offset for visibility
  - _Requirements: 5.2_
  - _Design: Focus States section

## Phase 2: Member List Improvements

### 2.1 Create MemberRoleBadge component

- [ ] 2.1.1 Create member-role-badge.tsx
  - Add `components/members/member-role-badge.tsx`
  - Define ROLE_LABELS constant for proper capitalization
  - Handle unknown roles gracefully (fallback to raw value)
  - Apply Tailwind styles:
    - Background: `bg-indigo-500/10` (light), `bg-indigo-500/20` (dark)
    - Text: `text-indigo-500` (light), `text-indigo-400` (dark)
    - Padding: `px-2.5 py-0.5`
    - Border radius: `rounded-full`
    - Font size: `text-xs`
    - Font weight: `font-medium`
  - Accept role prop and optional className
  - _Requirements: 1.1_
  - _Design: Role Badge Capitalization section

- [ ] 2.1.2 Update existing member components to use role badge
  - Find existing member components using role displays
  - Replace inline role labels with MemberRoleBadge
  - Ensure consistency across all member views
  - _Requirements: 1.1_

### 2.2 Create MemberListSkeleton component

- [ ] 2.2.1 Create member-list-skeleton.tsx
  - Add `components/members/member-list-skeleton.tsx`
  - Use Card wrapper matching existing design
  - Implement shimmer animation with animate-pulse
  - Match skeleton structure to member list:
    - Header placeholder (h-4, w-1/4)
    - Avatar placeholder (h-10 w-10 rounded-full)
    - Name placeholder (h-4, w-1/3)
    - Role placeholder (h-3, w-1/4)
  - Display 5 skeleton items (typical member list size)
  - Use bg-muted class for placeholder colors
  - _Requirements: 1.2_
  - _Design: Loading Skeleton section

- [ ] 2.2.2 Integrate skeleton into member list page
  - Add to `app/(main)/(routes)/servers/[serverID]/page.tsx`
  - Show skeleton while member data is loading
  - Hide skeleton once data is loaded
  - Use React state to track loading status
  - _Requirements: 1.2_

### 2.3 Enhance MemberActions component

- [ ] 2.3.1 Create or update member-actions.tsx
  - Add `components/members/member-actions.tsx`
  - Implement action buttons:
    - Add member button (variant: ghost, size: sm)
    - More options dropdown (variant: outline, size: sm)
  - Style buttons:
    - Height: h-8 (32px minimum touch target)
    - Icon size: h-4 w-4
    - Gap between buttons: gap-2
  - Add UserPlus icon to add button
  - Add MoreHorizontal icon to dropdown trigger
  - _Requirements: 1.3_
  - _Design: Action Buttons Enhancement section

- [ ] 2.3.2 Implement dropdown menu actions
  - Use existing DropdownMenu components
  - Add Edit and Remove actions
  - Ensure keyboard navigation works
  - Add hover states for menu items
  - _Requirements: 1.3_

## Phase 3: Chat Messages Improvements

### 3.1 Create ChatMessagesSkeleton component

- [ ] 3.1.1 Create chat-messages-skeleton.tsx
  - Add `components/chat/chat-messages-skeleton.tsx`
  - Replicate chat message structure:
    - Alternating left/right layout (flex-row-reverse on even items)
    - Avatar placeholder (h-10 w-10 rounded-full)
    - Name header placeholder (h-4 w-24)
    - Message bubble placeholder (h-16 max-w-[70%])
  - Use animate-pulse for shimmer effect
  - Display 6 skeleton items (typical message history)
  - Use bg-muted for placeholders
  - _Requirements: 2.1_
  - _Design: Skeleton Loading section

- [ ] 3.1.2 Integrate skeleton into chat messages component
  - Add to `components/chat/chat-messages.tsx`
  - Show while message history is loading
  - Hide once messages are loaded
  - Match existing component structure
  - _Requirements: 2.1_

### 3.2 Create RelativeTimestamp component

- [ ] 3.2.1 Create relative-timestamp.tsx
  - Add `components/ui/relative-timestamp.tsx`
  - Implement formatRelativeTime function:
    - < 60s: "Just now"
    - < 60m: "{N}m ago"
    - < 24h: "{N}h ago"
    - < 7d: "{N}d ago"
    - >= 7d: absolute date format
  - Accept date (Date | string) and optional className
  - Use React hooks for time updates
  - Add tooltip showing absolute date on hover
  - Handle invalid dates gracefully
  - _Requirements: 2.2_
  - _Design: Relative Timestamps section

- [ ] 3.2.2 Update chat messages to use relative timestamps
  - Modify `components/chat/chat-messages.tsx`
  - Replace existing timestamp display
  - Add hover tooltip for absolute time
  - Ensure auto-update works correctly
  - _Requirements: 2.2_

### 3.3 Create ChatEmptyState component

- [ ] 3.3.1 Create chat-empty-state.tsx
  - Add `components/chat/chat-empty-state.tsx`
  - Use EmptyState UI component from Phase 1
  - Display MessageSquare icon (h-12 w-12)
  - Title: "No messages yet"
  - Description: "Be the first to send a message in this channel!"
  - Optional action: Send Message button
  - Center alignment with py-12 px-4 padding
  - _Requirements: 2.3_
  - _Design: Empty States section

- [ ] 3.3.2 Integrate empty state into chat
  - Add to `components/chat/chat-messages.tsx`
  - Show when message array is empty
  - Hide when messages exist
  - Add type prop for different empty scenarios
  - _Requirements: 2.3_

## Phase 4: Direct Messages Improvements

### 4.1 Create DMSearch component

- [ ] 4.1.1 Create dm-search.tsx
  - Add `components/direct/dm-search.tsx`
  - Implement search input with search icon
  - Add clear button (X icon) when query exists
  - Implement search filtering:
    - Filter by conversation name
    - Filter by participant names
    - Case-insensitive matching
  - Use useMemo for efficient filtering
  - _Requirements: 3.1_
  - _Design: Search Functionality section

- [ ] 4.1.2 Add debounced search
  - Import debounce utility or create one
  - Implement 300ms debounce delay
  - Use useMemo with cleanup on unmount
  - Pass filtered results to parent
  - Handle empty query (return all conversations)
  - _Requirements: 3.1_

- [ ] 4.1.3 Integrate search into DM list
  - Add to `components/direct/direct-messages.tsx`
  - Position at top of conversation list
  - Style input: pl-9 for icon padding
  - Show loading state during search
  - Handle no results found
  - _Requirements: 3.1_

### 4.2 Create E2EEBadge component

- [ ] 4.2.1 Create e2ee-badge.tsx
  - Add `components/direct/e2ee-badge.tsx`
  - Display lock icon (h-3 w-3)
  - Show "Encrypted" text label
  - Wrap in Tooltip for detailed info
  - Style: bg-emerald-500/10, text-emerald-500
  - Padding: px-2 py-0.5, rounded-full
  - Accept encrypted boolean prop
  - _Requirements: 3.2_
  - _Design: E2EE Indicator section

- [ ] 4.2.2 Add tooltip content
  - Tooltip: "Messages in this conversation are end-to-end encrypted."
  - Secondary line: "Only participants can read these messages."
  - Use TooltipProvider and Tooltip components
  - _Requirements: 3.2_

- [ ] 4.2.3 Integrate badge into DM list
  - Add to conversation list item
  - Position near conversation info
  - Show only for encrypted conversations
  - Match design specifications
  - _Requirements: 3.2_

### 4.3 Create DMListSkeleton component

- [ ] 4.3.1 Create dm-list-skeleton.tsx
  - Add `components/direct/dm-list-skeleton.tsx`
  - Replicate conversation list structure:
    - Avatar placeholder (h-10 w-10 rounded-full)
    - Name placeholder (h-4 w-1/2)
    - Last message placeholder (h-3 w-3/4)
  - Display 4 skeleton items
  - Use space-y-2 for item spacing
  - Add p-2 padding
  - _Requirements: 3.3_
  - _Design: Loading Skeleton section

- [ ] 4.3.2 Integrate skeleton into DM list
  - Add to `components/direct/direct-messages.tsx`
  - Show while conversations are loading
  - Hide once data is loaded
  - Match existing loading state handling
  - _Requirements: 3.3_

## Phase 5: Chat Input Improvements

### 5.1 Create E2EEIndicator component

- [ ] 5.1.1 Create e2ee-indicator.tsx
  - Add `components/chat/e2ee-indicator.tsx`
  - Accept channelId prop
  - Display lock icon (h-4 w-4)
  - Color: emerald-500 for encrypted, muted-foreground otherwise
  - Show "Encrypted" label for encrypted channels
  - Wrap in Tooltip for status description
  - Use useChannelEncryption hook (or create)
  - _Requirements: 4.1_
  - _Design: E2EE Status Indicator section

- [ ] 5.1.2 Add tooltip content
  - Encrypted: "Messages are end-to-end encrypted"
  - Not encrypted: "Messages are not encrypted"
  - _Requirements: 4.1_

- [ ] 5.1.3 Integrate indicator into chat input
  - Add to `components/chat/chat-input.tsx`
  - Position near input field
  - Add gap-1.5 for spacing
  - _Requirements: 4.1_

### 5.2 Create EnhancedEmojiPicker component

- [ ] 5.2.1 Install emoji-picker-react
  - Add to package.json: emoji-picker-react
  - Run npm install or yarn add
  - Verify installation
  - _Requirements: 4.2_

- [ ] 5.2.2 Create emoji-picker.tsx
  - Add `components/chat/emoji-picker.tsx`
  - Use Popover with emoji-picker-react
  - Add recent emojis section (row of 8 emojis)
  - Track recent emojis in localStorage
  - Handle emoji selection callback
  - _Requirements: 4.2_
  - _Design: Enhanced Emoji Picker section

- [ ] 5.2.3 Implement recent emojis tracking
  - Create addToRecentEmojis function
  - Store in localStorage with emoji and timestamp
  - Limit to last 20 emojis
  - Load on component mount
  - _Requirements: 4.2_

- [ ] 5.2.4 Style the emoji picker
  - Popover width: w-auto
  - Emoji picker dimensions: 350x400
  - Skin tone button location: separate
  - Search enabled
  - Preview enabled with default emoji
  - Category tabs for navigation
  - _Requirements: 4.2_

- [ ] 5.2.5 Integrate emoji picker into chat input
  - Add to `components/chat/chat-input.tsx`
  - Use Smile icon for trigger button
  - Pass onEmojiSelect callback
  - Pass recentEmojis prop
  - Position: near other input tools
  - _Requirements: 4.2_

## Phase 6: Integration and Testing

### 6.1 Component integration

- [ ] 6.1.1 Update server members page
  - Integrate MemberListSkeleton
  - Replace role displays with MemberRoleBadge
  - Add MemberActions to member items
  - Verify loading states work
  - _Requirements: 1.1, 1.2, 1.3_

- [ ] 6.1.2 Update chat messages component
  - Integrate ChatMessagesSkeleton
  - Replace timestamps with RelativeTimestamp
  - Add ChatEmptyState for empty chats
  - Verify skeleton shows/hides correctly
  - _Requirements: 2.1, 2.2, 2.3_

- [ ] 6.1.3 Update direct messages component
  - Add DMSearch at top of list
  - Integrate DMListSkeleton
  - Add E2EEBadge to conversation items
  - Test search functionality
  - _Requirements: 3.1, 3.2, 3.3_

- [ ] 6.1.4 Update chat input component
  - Add E2EEIndicator
  - Add EnhancedEmojiPicker
  - Position elements correctly
  - Test emoji insertion
  - _Requirements: 4.1, 4.2_

### 6.2 Global styles application

- [ ] 6.2.1 Apply scrollbar styles
  - Add scrollbar-thin class to:
    - Chat messages container
    - Member list container
    - DM conversation list
    - Any overflow containers
  - Verify styling works in light/dark modes
  - Test across browsers
  - _Requirements: 5.1_

- [ ] 6.2.2 Verify focus states
  - Test keyboard navigation on all new components
  - Verify focus-visible outline appears
  - Test focus ring utility class
  - Ensure accessibility
  - _Requirements: 5.2_

### 6.3 Accessibility testing

- [ ] 6.3.1 Keyboard navigation tests
  - Tab through all new interactive elements
  - Verify focus order is logical
  - Test dropdown menus
  - Test emoji picker navigation
  - _Requirements: 1.3, 5.2_

- [ ] 6.3.2 Screen reader tests
  - Verify tooltips announce correctly
  - Test emoji picker announcements
  - Check search input labeling
  - Verify button labels are descriptive
  - _Requirements: 1.3, 2.3, 4.2_

### 6.4 Visual regression testing

- [ ] 6.4.1 Screenshot comparisons
  - Capture before/after for:
    - Member list with roles
    - Chat messages
    - Direct messages list
    - Chat input area
  - Compare light and dark modes
  - Verify no unintended visual changes
  - _Design: Testing Strategy section

### 6.5 Performance testing

- [ ] 6.5.1 Loading performance
  - Verify skeletons render immediately
  - Check for layout shifts after loading
  - Test emoji picker lazy loading
  - Monitor debounce effectiveness
  - _Requirements: All loading states_

## Checkpoint

- [ ] All acceptance criteria verified
- [ ] No visual regressions detected
- [ ] Accessibility tests pass
- [ ] Performance benchmarks met
- [ ] User feedback incorporated (if any)

## Task Dependency Graph

```
Phase 1: UI Foundation Components
├── 1.1.1 LoadingSpinner → Used by: 1.1.2, 3.1.1, 4.3.1
├── 1.1.2 EmptyState → Used by: 3.3.1
├── 1.1.3 Scrollbar styles → Used by: 6.2.1
└── 1.2.1 Focus styles → Used by: 6.2.2

Phase 2: Member List Improvements
├── 2.1.1 MemberRoleBadge
└── 2.1.2 Update members → Depends on: 2.1.1
├── 2.2.1 MemberListSkeleton
└── 2.2.2 Integrate skeleton → Depends on: 2.2.1
├── 2.3.1 MemberActions
└── 2.3.2 Dropdown actions → Depends on: 2.3.1

Phase 3: Chat Messages Improvements
├── 3.1.1 ChatMessagesSkeleton
└── 3.1.2 Integrate skeleton → Depends on: 3.1.1, 1.1.1
├── 3.2.1 RelativeTimestamp
└── 3.2.2 Update chat → Depends on: 3.2.1
├── 3.3.1 ChatEmptyState → Depends on: 1.1.2
└── 3.3.2 Integrate empty → Depends on: 3.3.1

Phase 4: Direct Messages Improvements
├── 4.1.1 DMSearch
├── 4.1.2 Debounce → Part of: 4.1.1
└── 4.1.3 Integrate DM → Depends on: 4.1.1
├── 4.2.1 E2EEBadge
└── 4.2.3 Integrate badge → Depends on: 4.2.1
├── 4.3.1 DMListSkeleton → Depends on: 1.1.1
└── 4.3.2 Integrate skeleton → Depends on: 4.3.1

Phase 5: Chat Input Improvements
├── 5.1.1 E2EEIndicator
├── 5.1.2 Tooltip → Part of: 5.1.1
└── 5.1.3 Integrate indicator → Depends on: 5.1.1
├── 5.2.1 Install emoji-picker
├── 5.2.2 EmojiPicker
├── 5.2.3 Recent emojis → Part of: 5.2.2
├── 5.2.4 Style picker → Part of: 5.2.2
└── 5.2.5 Integrate picker → Depends on: 5.2.1, 5.2.2

Phase 6: Integration and Testing
├── 6.1.1 Server members → Depends on: 2.1.2, 2.2.2, 2.3.1
├── 6.1.2 Chat messages → Depends on: 3.1.2, 3.2.2, 3.3.2
├── 6.1.3 Direct messages → Depends on: 4.1.3, 4.2.3, 4.3.2
└── 6.1.4 Chat input → Depends on: 5.1.3, 5.2.5
├── 6.2.1 Scrollbar styles → Depends on: 1.1.3
└── 6.2.2 Focus states → Depends on: 1.2.1
├── 6.3.1 Keyboard nav → Depends on: 6.1.x
├── 6.3.2 Screen reader → Depends on: 6.1.x
├── 6.4.1 Visual regression → Depends on: all phases
└── 6.5.1 Performance → Depends on: all phases
```

## Notes

### Prerequisites
- Ensure emoji-picker-react is installed before starting Phase 5
- Review existing component patterns before implementation
- Test all changes in both light and dark modes

### File Locations
- New components: `components/{members,chat,direct,ui}/`
- Style updates: `app/globals.css`
- Page updates: `app/(main)/(routes)/` pages

### Testing Priorities
1. Skeleton loaders display correctly before data loads
2. Relative timestamps update in real-time
3. Search filters conversations correctly with debouncing
4. E2EE indicators show for encrypted conversations
5. Emoji picker tracks and displays recent emojis
6. Scrollbar and focus styles apply consistently

### Known Dependencies
- emoji-picker-react: ^4.9.2 or latest
- Lucide React: Already in project
- Tooltip components: Use existing shadcn/ui pattern
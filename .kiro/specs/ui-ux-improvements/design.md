# Design Document

## Overview

This design document provides detailed specifications for implementing the UI/UX Improvements feature in the SyncMove application. The feature enhances user experience through improved loading states, better visual feedback, consistent styling, and accessibility enhancements across multiple components.

## Architecture

### Component Structure

The feature follows the existing component architecture in the `components/` directory, extending it with new components organized by feature area:

```
components/
├── members/     - Member list related components
├── chat/        - Chat message and input components
├── direct/      - Direct message components
└── ui/          - Reusable UI components
```

### Dependencies

- **Styling**: Tailwind CSS with the existing design system
- **Icons**: Lucide React for iconography
- **Emoji Picker**: emoji-picker-react library
- **State Management**: React hooks (useState, useMemo, useCallback)
- **Utilities**: clsx/cn for class name composition

## Design Decisions

### Component Architecture

This design follows the existing component structure in `components/` directory:
- `members/` - Member list components
- `chat/` - Chat message and input components
- `direct/` - Direct messages components
- `ui/` - Reusable UI components (to be extended)

## Components and Interfaces

### Member List Components

| Component | Type | Purpose |
|-----------|------|---------|
| `MemberRoleBadge` | New/Modified | Displays role with proper capitalization |
| `MemberListSkeleton` | New | Loading skeleton for member list |
| `MemberActions` | New/Modified | Enhanced action buttons for members |

### Chat Components

| Component | Type | Purpose |
|-----------|------|---------|
| `ChatMessagesSkeleton` | New | Loading skeleton for chat messages |
| `RelativeTimestamp` | New | Displays timestamps in relative format |
| `ChatEmptyState` | New | Empty state for no messages |
| `E2EEIndicator` | New | Encryption status indicator for chat |
| `EmojiPicker` | New | Enhanced emoji picker with recent emojis |

### Direct Message Components

| Component | Type | Purpose |
|-----------|------|---------|
| `DMSearch` | New | Search functionality for conversations |
| `E2EEBadge` | New | Encryption badge for DM list |
| `DMListSkeleton` | New | Loading skeleton for DM list |

### UI Components

| Component | Type | Purpose |
|-----------|------|---------|
| `LoadingSpinner` | New | Reusable loading spinner |
| `EmptyState` | New | Reusable empty state component |

## Data Models

### Member Role

```typescript
type MemberRole = 'ADMIN' | 'MODERATOR' | 'MEMBER' | 'GUEST';

const ROLE_LABELS: Record<MemberRole, string> = {
  ADMIN: 'Admin',
  MODERATOR: 'Moderator',
  MEMBER: 'Member',
  GUEST: 'Guest',
};
```

### Conversation (for DM Search)

```typescript
interface Conversation {
  id: string;
  name?: string;
  participants: Participant[];
  lastMessage?: Message;
  encrypted: boolean;
  createdAt: Date;
}

interface Participant {
  id: string;
  name: string;
  avatar?: string;
}
```

### Message

```typescript
interface Message {
  id: string;
  content: string;
  createdAt: Date;
  senderId: string;
  channelId: string;
}
```

### Emoji Data

```typescript
interface EmojiClickData {
  emoji: string;
  names: string[];
  unified: string;
}

interface RecentEmoji {
  emoji: string;
  timestamp: number;
}
```

---

## 1. Member List Improvements

### 1.1 Role Badge Capitalization

**File**: `components/members/member-role-badge.tsx` (new or modified)

**Design Spec**:
```tsx
// Role badge with proper capitalization
const ROLE_LABELS: Record<string, string> = {
  ADMIN: 'Admin',
  MODERATOR: 'Moderator',
  MEMBER: 'Member',
  GUEST: 'Guest',
};

// Component renders with capitalized role
<RoleBadge role={role}>{ROLE_LABELS[role] || role}</RoleBadge>
```

**Style**:
- Background: `bg-indigo-500/10` (light), `bg-indigo-500/20` (dark)
- Text: `text-indigo-500` (light), `text-indigo-400` (dark)
- Padding: `px-2.5 py-0.5`
- Border radius: `rounded-full`
- Font size: `text-xs`
- Font weight: `font-medium`

### 1.2 Loading Skeleton

**File**: `components/members/member-list-skeleton.tsx` (new)

**Structure**:
```tsx
// Skeleton matches actual member list layout
<Card>
  <div class="animate-pulse space-y-4 p-4">
    {/* Header */}
    <div class="h-4 bg-muted rounded w-1/4" />

    {/* Member items */}
    {Array.from({ length: 5 }).map((_, i) => (
      <div class="flex items-center space-x-4">
        <div class="h-10 w-10 bg-muted rounded-full" />
        <div class="space-y-2 flex-1">
          <div class="h-4 bg-muted rounded w-1/3" />
          <div class="h-3 bg-muted rounded w-1/4" />
        </div>
      </div>
    ))}
  </div>
</Card>
```

### 1.3 Action Buttons Enhancement

**File**: `components/members/member-actions.tsx` (new/modified)

**Design Spec**:
```tsx
// Action buttons with proper spacing and styling
<div class="flex items-center gap-2">
  <Button variant="ghost" size="sm">
    <UserPlus class="h-4 w-4 mr-2" />
    Add
  </Button>
  <DropdownMenu>
    <DropdownMenuTrigger asChild>
      <Button variant="outline" size="sm">
        <MoreHorizontal class="h-4 w-4" />
      </Button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="end">
      <DropdownMenuItem>Edit</DropdownMenuItem>
      <DropdownMenuItem>Remove</DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>
</div>
```

**Styling**:
- Button height: `h-8` (32px minimum touch target)
- Icon size: `h-4 w-4`
- Gap between buttons: `gap-2`

---

## 2. Chat Messages Improvements

### 2.1 Skeleton Loading

**File**: `components/chat/chat-messages-skeleton.tsx` (new)

**Structure**:
```tsx
// Skeleton matches chat message structure
<div class="space-y-4 p-4">
  {Array.from({ length: 6 }).map((_, i) => (
    <div class={`flex gap-3 ${i % 2 === 0 ? 'flex-row-reverse' : ''}`}>
      <div class="h-10 w-10 bg-muted rounded-full flex-shrink-0" />
      <div class="space-y-2 max-w-[70%]">
        <div class="h-4 bg-muted rounded w-24" />
        <div class="h-16 bg-muted rounded-lg" />
      </div>
    </div>
  ))}
</div>
```

### 2.2 Relative Timestamps

**File**: `components/ui/relative-timestamp.tsx` (new)

**Logic**:
```tsx
interface RelativeTimestampProps {
  date: Date | string;
  className?: string;
}

function formatRelativeTime(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - new Date(date).getTime();
  const diffSecs = Math.floor(diffMs / 1000);
  const diffMins = Math.floor(diffSecs / 60);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffSecs < 60) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;

  // Fallback to absolute date
  return formatDate(date);
}
```

**Component**:
```tsx
<RelativeTimestamp date={message.createdAt}>
  <span className="text-xs text-muted-foreground hover:text-foreground transition-colors">
    {formatRelativeTime(date)}
    <AbsoluteDateTooltip date={date} />
  </span>
</RelativeTimestamp>
```

### 2.3 Empty States

**File**: `components/chat/chat-empty-state.tsx` (new)

**Design Spec**:
```tsx
interface ChatEmptyStateProps {
  type?: 'text' | 'media' | 'mixed';
}

<EmptyState>
  <EmptyStateIcon>
    <MessageSquare class="h-12 w-12 text-muted-foreground" />
  </EmptyStateIcon>
  <EmptyStateTitle>No messages yet</EmptyStateTitle>
  <EmptyStateDescription>
    Be the first to send a message in this channel!
  </EmptyStateDescription>
  <EmptyStateAction>
    <Button>Send Message</Button>
  </EmptyStateAction>
</EmptyState>
```

**Styling**:
- Center alignment with flexbox
- Padding: `py-12 px-4`
- Icon size: `h-12 w-12`
- Description text: `text-muted-foreground text-sm`

---

## 3. Direct Messages Improvements

### 3.1 Search Functionality

**File**: `components/direct/dm-search.tsx` (new)

**Implementation**:
```tsx
interface DMSearchProps {
  conversations: Conversation[];
  onSearch: (query: string) => void;
}

function DMSearch({ conversations, onSearch }: DMSearchProps) {
  const [query, setQuery] = useState('');

  const filteredConversations = useMemo(() => {
    if (!query.trim()) return conversations;

    const lowerQuery = query.toLowerCase();
    return conversations.filter(conv =>
      conv.name?.toLowerCase().includes(lowerQuery) ||
      conv.participants.some(p =>
        p.name.toLowerCase().includes(lowerQuery)
      )
    );
  }, [conversations, query]);

  return (
    <div class="relative">
      <Search class="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
      <Input
        placeholder="Search conversations..."
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          debouncedOnSearch(e.target.value);
        }}
        class="pl-9"
      />
      {query && (
        <Button
          variant="ghost"
          size="sm"
          class="absolute right-2 top-1/2 -translate-y-1/2 h-6 w-6 p-0"
          onClick={() => {
            setQuery('');
            onSearch('');
          }}
        >
          <X class="h-4 w-4" />
        </Button>
      )}
    </div>
  );
}
```

**Debounce Logic**:
```tsx
const debouncedSearch = useMemo(
  () => debounce((query: string) => onSearch(query), 300),
  [onSearch]
);
```

### 3.2 E2EE Indicator

**File**: `components/direct/e2ee-badge.tsx` (new)

**Design Spec**:
```tsx
interface E2EEIndicatorProps {
  encrypted: boolean;
  className?: string;
}

<E2EEIndicator encrypted={encrypted}>
  <Lock className="h-3 w-3" />
  {encrypted && (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger>
          <span className="text-xs">Encrypted</span>
        </TooltipTrigger>
        <TooltipContent>
          <p>Messages in this conversation are end-to-end encrypted.</p>
          <p className="text-xs text-muted-foreground mt-1">
            Only participants can read these messages.
          </p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )}
</E2EEIndicator>
```

**Styling**:
- Background: `bg-emerald-500/10`
- Text: `text-emerald-500`
- Icon color: `text-emerald-500`
- Padding: `px-2 py-0.5`
- Border radius: `rounded-full`

### 3.3 Loading Skeleton

**File**: `components/direct/dm-list-skeleton.tsx` (new)

**Structure**:
```tsx
<div class="space-y-2 p-2">
  {Array.from({ length: 4 }).map((_, i) => (
    <div class="flex items-center gap-3 p-3">
      <div class="h-10 w-10 bg-muted rounded-full" />
      <div class="space-y-2 flex-1">
        <div class="h-4 bg-muted rounded w-1/2" />
        <div class="h-3 bg-muted rounded w-3/4" />
      </div>
    </div>
  ))}
</div>
```

---

## 4. Chat Input Improvements

### 4.1 E2EE Status Indicator

**File**: `components/chat/e2ee-indicator.tsx` (new)

**Design Spec**:
```tsx
interface E2EEStatusIndicatorProps {
  channelId: string;
}

function E2EEStatusIndicator({ channelId }: E2EEStatusIndicatorProps) {
  const isEncrypted = useChannelEncryption(channelId);

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div class="flex items-center gap-1.5 text-muted-foreground">
            <Lock
              className={cn(
                "h-4 w-4",
                isEncrypted ? "text-emerald-500" : "text-muted-foreground"
              )}
            />
            {isEncrypted && (
              <span className="text-xs font-medium text-emerald-500">
                Encrypted
              </span>
            )}
          </div>
        </TooltipTrigger>
        <TooltipContent>
          {isEncrypted ? (
            <p>Messages are end-to-end encrypted</p>
          ) : (
            <p>Messages are not encrypted</p>
          )}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
```

### 4.2 Enhanced Emoji Picker

**File**: `components/chat/emoji-picker.tsx` (new, leveraging emoji-picker-react)

**Implementation**:
```tsx
import EmojiPicker, { Emoji } from 'emoji-picker-react';

interface EnhancedEmojiPickerProps {
  onEmojiSelect: (emoji: string) => void;
  recentEmojis: string[];
}

function EnhancedEmojiPicker({ onEmojiSelect, recentEmojis }: EnhancedEmojiPickerProps) {
  const [isOpen, setIsOpen] = useState(false);

  const handleEmojiClick = (emojiData: EmojiClickData) => {
    onEmojiSelect(emojiData.emoji);
    // Track recent emoji (store in localStorage)
    addToRecentEmojis(emojiData.emoji);
  };

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" className="h-auto p-1">
          <Smile class="h-5 w-5 text-muted-foreground hover:text-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <div class="flex border-b">
          {/* Category tabs */}
          <Tabs defaultValue="recent">
            <TabsList className="h-9 bg-transparent">
              <TabsTrigger value="recent" className="h-8 px-2">
                <Clock class="h-4 w-4" />
              </TabsTrigger>
              <TabsTrigger value="smileys" className="h-8 px-2">
                😀
              </TabsTrigger>
              {/* More categories... */}
            </TabsList>
          </Tabs>
        </div>

        {/* Recently used emojis */}
        {recentEmojis.length > 0 && (
          <div class="flex gap-1 p-2 border-b">
            {recentEmojis.slice(0, 8).map(emoji => (
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0"
                onClick={() => handleEmojiClick({ emoji } as EmojiClickData)}
              >
                {emoji}
              </Button>
            ))}
          </div>
        )}

        <EmojiPicker
          onEmojiClick={handleEmojiClick}
          width={350}
          height={400}
          skinToneButtonLocation="separate"
          searchDisabled={false}
          previewConfig={{
            showPreview: true,
            defaultEmoji: '1f92a',
            defaultCaption: 'Choose an emoji',
          }}
        />
      </PopoverContent>
    </Popover>
  );
}
```

---

## 5. General UI/UX Enhancements

### 5.1 Scrollbar Styling

**File**: `app/globals.css` (additions)

**CSS**:
```css
@layer utilities {
  /* Custom scrollbar styles */
  .scrollbar-thin {
    scrollbar-width: thin;
    scrollbar-color: hsl(var(--muted-foreground) / 0.3) transparent;
  }

  .scrollbar-thin::-webkit-scrollbar {
    width: 8px;
    height: 8px;
  }

  .scrollbar-thin::-webkit-scrollbar-track {
    background: transparent;
  }

  .scrollbar-thin::-webkit-scrollbar-thumb {
    background-color: hsl(var(--muted-foreground) / 0.3);
    border-radius: 4px;
  }

  .scrollbar-thin::-webkit-scrollbar-thumb:hover {
    background-color: hsl(var(--muted-foreground) / 0.5);
  }
}
```

**Usage Class**: Add `scrollbar-thin` to containers with overflow

### 5.2 Focus States

**File**: `app/globals.css` (additions)

**CSS**:
```css
@layer base {
  :focus-visible {
    outline: 2px solid hsl(var(--ring));
    outline-offset: 2px;
  }
}

/* Custom focus styles for specific components */
.focus-ring {
  @apply focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2;
}
```

### 5.3 Loading States

**File**: `components/ui/loading-spinner.tsx` (new)

**Implementation**:
```tsx
interface LoadingSpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const sizeClasses = {
  sm: 'h-4 w-4',
  md: 'h-6 w-6',
  lg: 'h-8 w-8',
};

function LoadingSpinner({ size = 'md', className }: LoadingSpinnerProps) {
  return (
    <Loader2
      className={cn(
        'animate-spin text-muted-foreground',
        sizeClasses[size],
        className
      )}
    />
  );
}
```

**Loading Overlay**:
```tsx
function LoadingOverlay({ isLoading, children }: PropsWithChildren<LoadingOverlayProps>) {
  return (
    <div className="relative">
      {children}
      {isLoading && (
        <div className="absolute inset-0 bg-background/80 flex items-center justify-center">
          <LoadingSpinner size="lg" />
        </div>
      )}
    </div>
  );
}
```

---

## File Structure

```
components/
├── members/
│   ├── member-role-badge.tsx    (new/modified)
│   ├── member-list-skeleton.tsx (new)
│   └── member-actions.tsx       (new/modified)
├── chat/
│   ├── chat-messages-skeleton.tsx (new)
│   ├── relative-timestamp.tsx     (new)
│   ├── chat-empty-state.tsx       (new)
│   ├── e2ee-indicator.tsx         (new)
│   └── emoji-picker.tsx           (new)
├── direct/
│   ├── dm-search.tsx           (new)
│   ├── e2ee-badge.tsx          (new)
│   └── dm-list-skeleton.tsx    (new)
└── ui/
    ├── loading-spinner.tsx     (new)
    └── empty-state.tsx         (new)
```

---

## Testing Strategy

### Unit Tests
- Role badge capitalization logic
- Relative timestamp calculations
- Search filtering logic
- Emoji picker integration

### Visual Regression
- Compare before/after screenshots for each component
- Test across different themes (light/dark)
- Test responsive layouts

### Accessibility
- Test with keyboard navigation
- Verify screen reader announcements
- Check color contrast ratios

## Correctness Properties

### Role Badge Properties
- The role badge must display the correct capitalized label for any valid MemberRole
- The component must handle unknown roles gracefully by displaying the raw value
- The styling must match the design specification for each role type

### Relative Timestamp Properties
- Timestamps less than 60 seconds must display "Just now"
- Timestamps less than 60 minutes must display in minutes (e.g., "5m ago")
- Timestamps less than 24 hours must display in hours (e.g., "12h ago")
- Timestamps less than 7 days must display in days (e.g., "3d ago")
- Timestables 7 days or older must display the absolute date format
- The component must handle invalid date inputs gracefully

### Search Properties
- The search must filter conversations by name (if present)
- The search must filter conversations by participant names
- Empty search query must return all conversations
- Search must be case-insensitive
- Debouncing must delay the search callback by 300ms

### E2EE Indicator Properties
- The indicator must display a lock icon for encrypted conversations
- The icon color must be emerald green for encrypted conversations
- The tooltip must describe the encryption status
- The indicator must be hidden for non-encrypted conversations

### Emoji Picker Properties
- Recently used emojis must be displayed in the picker
- Clicking an emoji must trigger the onEmojiSelect callback
- Selected emojis must be added to the recent list
- The recent list must persist across sessions

## Error Handling

### Loading State Errors
- If skeleton loading fails or times out, display a retry button
- Show error state with "Failed to load" message if data fetch fails
- Allow users to retry loading by clicking the error state

### Search Error Handling
- If search fails, show an error message and allow retry
- Handle empty search results gracefully with a user-friendly message
- Debouncing must be cleared on component unmount to prevent memory leaks

### Emoji Picker Errors
- If emoji library fails to load, fallback to system emoji input
- Handle corrupted recent emoji data by resetting the list
- Log errors to console for debugging without breaking the UI

### E2EE Status Errors
- If encryption status check fails, show neutral (non-encrypted) state
- Cache encryption status to prevent repeated API calls
- Show error tooltip when status cannot be determined

### Relative Timestamp Errors
- Handle invalid date inputs by displaying nothing or placeholder
- Handle timezone differences by using UTC for calculations
- Ensure timestamp updates don't cause performance issues
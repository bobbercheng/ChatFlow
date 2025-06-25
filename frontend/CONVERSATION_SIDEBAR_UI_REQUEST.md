# Conversation Sidebar UI Feature Request

## 📋 Feature Summary
Implement a collapsible navigation panel for conversation management that improves user experience by providing easy access to conversations, reducing right margin for more content width, and enabling efficient conversation switching.

## 🎯 User Stories

### Primary Stories
- **As a user**, I want to see all my conversations in a sidebar so I can quickly switch between them
- **As a user**, I want to collapse the sidebar to maximize chat content width
- **As a user**, I want to create new conversations by entering participant emails
- **As a user**, I want to see conversation participants and last update times
- **As a user**, I want to refresh my conversation list to see new conversations

### Secondary Stories
- **As a mobile user**, I want the sidebar to auto-collapse on small screens
- **As a power user**, I want to see unread message counts per conversation
- **As a user**, I want smooth animations when toggling the sidebar

## 🎨 UI/UX Requirements

### Navigation Sidebar
```
┌─────────────────────┬─────────────────────────────┐
│ [☰] Conversations   │ 💬 ChatFlow            👋 │
│ ┌─────────────────┐ │ ─────────────────────────── │
│ │ 🆕 New Conv     │ │ 💬 Chat    |    🔍 Search  │
│ └─────────────────┘ │ ─────────────────────────── │
│ 🔄 Refresh         │ │ Conversation ID: [____]    │
│ ─────────────────── │ │ 🤖 Delegate to Local LLM   │
│ Alice, Bob          │ │ 🔗 Connected              │
│ "Hey, how's..."     │ │ ─────────────────────────── │
│ 2 hrs ago      [3]  │ │                            │
│ ─────────────────── │ │   📱 Message Area          │
│ Charlie, Dave       │ │                            │
│ "Project update"    │ │                            │
│ 1 day ago           │ │                            │
│ ─────────────────── │ │                            │
└─────────────────────┴─────────────────────────────┘
```

### Collapsed State
```
┌───┬─────────────────────────────────────┐
│[☰]│ 💬 ChatFlow                    👋 │
│ 🆕│ ─────────────────────────────────── │
│ 🔄│ 💬 Chat    |    🔍 Search        │
│ ─ │ ─────────────────────────────────── │
│ A │ Conversation ID: [____________]    │
│ ─ │ 🤖 Delegate to Local LLM           │
│ C │ 🔗 Connected                      │
│ ─ │ ─────────────────────────────────── │
└───┴─────────────────────────────────────┘
```

## 🛠️ Technical Specifications

### Component Architecture
```typescript
ConversationSidebar/
├── SidebarHeader
│   ├── ToggleButton
│   ├── NewConversationButton
│   └── RefreshButton
├── ConversationList
│   └── ConversationItem[]
│       ├── ParticipantNames
│       ├── LastMessage
│       ├── UpdateTime
│       └── UnreadBadge
└── NewConversationModal
    ├── EmailInput
    ├── CreateButton
    └── CancelButton
```

### State Management
```typescript
interface ConversationSidebarState {
  isCollapsed: boolean;
  conversations: Conversation[];
  selectedConversationId: string;
  isNewModalOpen: boolean;
  isLoading: boolean;
  isRefreshing: boolean;
}

interface Conversation {
  id: string;
  participants: User[];
  lastMessage?: {
    content: string;
    senderId: string;
    createdAt: string;
  };
  updatedAt: string;
  unreadCount: number;
}
```

### API Requirements
```typescript
// Required Backend Endpoints
GET /api/v1/conversations?page=1&limit=50
POST /api/v1/conversations { participantEmails: string[] }
GET /api/v1/conversations/:id/messages?page=1&limit=20

// WebSocket Events
'conversation:created' | 'conversation:updated' | 'conversation:new_message'
```

## 📱 Responsive Design

### Desktop (>= 1024px)
- Sidebar width: 320px (expanded) / 60px (collapsed)
- Main content margin: 320px / 60px
- Smooth transitions: 300ms ease

### Tablet (768px - 1023px)
- Sidebar width: 280px (expanded) / 50px (collapsed)
- Auto-collapse option available

### Mobile (< 768px)
- Sidebar: Fixed overlay (320px width)
- Auto-collapse by default
- Swipe gestures support

## 🎯 Acceptance Criteria

### ✅ Core Functionality
- [ ] Sidebar toggles between expanded/collapsed states
- [ ] Conversation list loads from API
- [ ] Clicking conversation loads messages in chat area
- [ ] New conversation modal accepts comma-separated emails
- [ ] Refresh button reloads conversation list
- [ ] Main content width adjusts with sidebar state

### ✅ User Experience
- [ ] Smooth animations (< 300ms)
- [ ] Loading states for all async operations
- [ ] Error handling with user feedback
- [ ] Persistent sidebar state (localStorage)
- [ ] Keyboard navigation support
- [ ] Screen reader accessibility

### ✅ Visual Design
- [ ] Consistent with ChatFlow brand colors
- [ ] Hover states for interactive elements
- [ ] Active conversation highlighting
- [ ] Unread message badges
- [ ] Clean typography and spacing
- [ ] Mobile-optimized touch targets

### ✅ Performance
- [ ] Virtual scrolling for 100+ conversations
- [ ] Optimistic UI updates
- [ ] Debounced search (if implemented)
- [ ] Lazy loading of conversation messages
- [ ] Bundle size impact < 10KB

## 🧪 Testing Requirements

### Unit Tests
- [ ] Sidebar toggle functionality
- [ ] Conversation list rendering
- [ ] New conversation creation
- [ ] API service methods
- [ ] State management logic

### Integration Tests
- [ ] Conversation selection workflow
- [ ] Message loading integration
- [ ] WebSocket event handling
- [ ] Modal interactions
- [ ] Responsive behavior

### E2E Tests
- [ ] Complete conversation creation flow
- [ ] Sidebar collapse/expand user journey
- [ ] Multi-conversation switching
- [ ] Mobile responsive behavior

## 🚀 Implementation Phases

### Phase 1: Basic Structure (Day 1)
- [ ] Create sidebar layout components
- [ ] Implement toggle functionality
- [ ] Add basic conversation list (static)
- [ ] Update main layout structure

### Phase 2: Conversation Management (Day 2)
- [ ] Integrate with conversations API
- [ ] Implement conversation loading
- [ ] Add conversation selection logic
- [ ] Create conversation item component

### Phase 3: New Conversation Feature (Day 3)
- [ ] Build new conversation modal
- [ ] Add email input validation
- [ ] Implement creation API call
- [ ] Handle success/error states

### Phase 4: Enhancement & Polish (Day 4)
- [ ] Add refresh functionality
- [ ] Implement unread counts
- [ ] Optimize responsive design
- [ ] Add keyboard navigation
- [ ] Performance optimizations

## 📊 Success Metrics

### User Experience
- **Conversation switching time**: < 2 seconds
- **Sidebar animation smoothness**: 60fps
- **Mobile usability score**: > 90%
- **Accessibility compliance**: WCAG 2.1 AA

### Technical Performance
- **Bundle size increase**: < 10KB gzipped
- **API response time**: < 500ms
- **Memory usage**: No significant increase
- **Test coverage**: > 90%

## 🔒 Security Considerations

- [ ] Validate participant emails on frontend and backend
- [ ] Sanitize conversation content display
- [ ] Secure WebSocket connections
- [ ] Rate limiting for conversation creation
- [ ] XSS prevention in message content

## 🎨 Design Assets Needed

- [ ] Sidebar toggle icon (hamburger menu)
- [ ] New conversation icon
- [ ] Refresh icon
- [ ] Loading spinner for conversations
- [ ] Unread badge design
- [ ] Empty state illustration

## 📈 Future Enhancements (Post-MVP)

- [ ] Conversation search/filter
- [ ] Conversation categories/folders
- [ ] Pinned conversations
- [ ] Conversation muting
- [ ] Advanced participant management
- [ ] Conversation templates
- [ ] Dark mode support

---

**Priority**: High  
**Complexity**: Medium  
**Estimated Effort**: 4 days  
**Dependencies**: Backend conversation API  
**Risk Level**: Low 
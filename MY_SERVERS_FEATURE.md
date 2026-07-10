# My Servers Feature - Implementation Summary

## Overview
Complete implementation of the "My Servers" feature that allows users to view, manage, and control their virtual servers through the Telegram bot.

## Features Implemented

### 1. **Server List View** (`my_servers`)
- Display all user's servers with status indicators
- Shows server count
- Button to create new server or go back to main menu
- Clickable list of servers

### 2. **Server Details View** (`server_view:{serverId}`)
Shows comprehensive server information:
- **Server Status**: Visual indicator (🟢 Active, 🔴 Stopped, ⚪ Other)
- **Specifications**:
  - Plan name and specs (CPU cores, RAM, Disk)
  - Operating System
  - Datacenter location
- **Access Information**:
  - IPv4 address (or "Pending" if not yet assigned)
  - IPv6 address (or "Pending" if not yet assigned)
  - Root username
- **Billing Information**:
  - Hourly price
  - Renewal period
  - Creation date

### 3. **Server Management Actions**
Implemented server control buttons with Infomaniak API integration:

#### Start Server
- `POST /servers/{SERVER_ID}/action` with `{"os-start": null}`
- Updates server status to ACTIVE
- Shows success confirmation

#### Stop Server
- `POST /servers/{SERVER_ID}/action` with `{"os-stop": null}`
- Updates server status to STOPPED
- Shows success confirmation

#### Soft Reboot
- `POST /servers/{SERVER_ID}/action` with `{"reboot": {"type": "SOFT"}}`
- Graceful restart
- Server stays ACTIVE

#### Hard Reboot
- `POST /servers/{SERVER_ID}/action` with `{"reboot": {"type": "HARD"}}`
- Immediate restart
- Server stays ACTIVE

#### Delete Server
- `DELETE /servers/{SERVER_ID}` (no body required)
- Updates server status to DELETED
- Removes from user's server list

## Code Changes

### 1. **InfomaniakProvider** (`src/modules/datacenter/providers/InfomaniakProvider.ts`)
Added methods:
- `startServer(externalServerId: string): Promise<void>`
- `rebootServer(externalServerId: string, type: 'SOFT' | 'HARD'): Promise<void>`
- `deleteServer(externalServerId: string): Promise<void>`

Updated:
- `stopServer()` - Now implements actual API call instead of placeholder

### 2. **DatacenterProvider Interface** (`src/modules/datacenter/providers/DatacenterProvider.ts`)
Updated interface to include:
- `startServer?()`
- `rebootServer?()`
- `deleteServer?()`

### 3. **ServerRepository** (`src/modules/servers/repositories/ServerRepository.ts`)
Added methods:
- `findUserServers(userId: string)` - List all user's servers with relations
- `findServerByIdWithRelations(serverId: string)` - Get server with all related data

### 4. **ServerService** (`src/modules/servers/services/ServerService.ts`)
Added methods:
- `getUserServers(userId: string)` - Retrieve user's servers
- `getServerDetails(serverId: string)` - Get detailed server info
- `startServer(serverId: string)` - Start a server
- `stopServer(serverId: string)` - Stop a server
- `rebootServer(serverId: string, type: 'SOFT' | 'HARD')` - Reboot a server
- `deleteServer(serverId: string)` - Delete a server

### 5. **Keyboard Menus** (`src/bot/keyboard/menus.ts`)
Added builders:
- `buildServersListKeyboard(servers)` - Clickable list of servers
- `buildServerDetailsKeyboard(serverId)` - Action buttons (Start, Stop, Reboot, Delete)

### 6. **BotApp** (`src/bot/BotApp.ts`)
Added callback handlers:
- `my_servers` - Show servers list
- `server_view:{serverId}` - Show server details
- `server_action:{serverId}:{action}` - Handle server actions

## User Flow

```
Main Menu
    ↓
📦 Click "My Servers"
    ↓
Server List (with status)
    ↓
Click on server name
    ↓
Server Details Page
    ├─ ▶️ Start
    ├─ ⏹️ Stop
    ├─ 🔄 Soft Reboot
    ├─ ⚡ Hard Reboot
    ├─ 🗑️ Delete
    └─ 🔙 Back to Servers
```

## Error Handling
- Unauthorized access prevention (only own servers)
- API error handling with user-friendly messages
- Action confirmation with feedback
- Logging for all operations

## Infomaniak API Endpoints Used

| Action | Method | Endpoint | Body |
|--------|--------|----------|------|
| Start | POST | `/servers/{ID}/action` | `{"os-start": null}` |
| Stop | POST | `/servers/{ID}/action` | `{"os-stop": null}` |
| Soft Reboot | POST | `/servers/{ID}/action` | `{"reboot": {"type": "SOFT"}}` |
| Hard Reboot | POST | `/servers/{ID}/action` | `{"reboot": {"type": "HARD"}}` |
| Delete | DELETE | `/servers/{ID}` | (no body) |
| Get Details | GET | `/servers/{ID}` | (no body) |

## Status Tracking
- Server status automatically updates in database after actions
- Status reflects in UI (Active, Stopped, Deleted)
- Real-time feedback to user

## Testing Recommendations
1. Create a server and wait for IP assignment
2. View the server details page
3. Test each action:
   - ▶️ Start an ACTIVE server (may have no effect)
   - ⏹️ Stop a server
   - 🔄 Soft reboot
   - ⚡ Hard reboot
   - Try to access another user's servers (should fail)
   - 🗑️ Delete a server

## Notes
- All times display in user's local timezone (Farsi calendar)
- IPv6 addresses display with brackets for SSH command format
- Pending IPs show as `<Pending>` until datacenter assigns them
- Users see refresh button after actions to update server details

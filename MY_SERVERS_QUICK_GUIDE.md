# 📦 My Servers Feature - Quick Start Guide

## What's New

You now have a fully functional **My Servers** management interface where users can:

### 1. View All Servers
- Click "📦 My Servers" from main menu
- See list of all their servers with current status
- Each server shows a 🖥️ icon with the server name

### 2. View Server Details  
- Click on any server from the list
- See complete information:
  - **Server Status**: 🟢 Active, 🔴 Stopped, ⚪ Other
  - **Specs**: CPU cores, RAM, Disk, OS type
  - **Access Info**: IPv4, IPv6, Username
  - **Billing**: Hourly price, renewal period
  - **Location**: Datacenter region

### 3. Manage Servers with Control Buttons

#### ▶️ Start Server
- Starts a stopped server
- Sends: `POST /servers/{ID}/action` with `{"os-start": null}`
- Updates status to ACTIVE

#### ⏹️ Stop Server  
- Gracefully stops the server
- Sends: `POST /servers/{ID}/action` with `{"os-stop": null}`
- Updates status to STOPPED

#### 🔄 Soft Reboot
- Graceful restart (like `reboot` command)
- Sends: `POST /servers/{ID}/action` with `{"reboot": {"type": "SOFT"}}`
- Server stays ACTIVE during restart

#### ⚡ Hard Reboot
- Immediate restart (like power cycle)
- Sends: `POST /servers/{ID}/action` with `{"reboot": {"type": "HARD"}}`
- Server stays ACTIVE during restart

#### 🗑️ Delete Server
- Permanently deletes the server
- Sends: `DELETE /servers/{ID}`
- Updates status to DELETED
- Removes from user's list

### 4. Real-time Feedback
- Each action shows loading message
- Success/error messages with details
- Refresh button to update server details
- Back button to return to server list

## Technical Implementation

### New Files/Changes

1. **InfomaniakProvider** - Now implements all API calls:
   - ✅ Start server
   - ✅ Stop server  
   - ✅ Reboot server (soft & hard)
   - ✅ Delete server

2. **ServerRepository** - New query methods:
   - `findUserServers()` - Get all user servers
   - `findServerByIdWithRelations()` - Get server with all details

3. **ServerService** - New business logic:
   - `getUserServers()` - List user's servers
   - `getServerDetails()` - Get server info
   - `startServer()` - Start action
   - `stopServer()` - Stop action
   - `rebootServer()` - Reboot action
   - `deleteServer()` - Delete action

4. **BotApp** - New handlers:
   - `my_servers` callback - Show servers list
   - `server_view:{id}` callback - Show server details
   - `server_action:{id}:{action}` callback - Execute actions

5. **Keyboard Menus** - New builders:
   - `buildServersListKeyboard()` - Servers list UI
   - `buildServerDetailsKeyboard()` - Control buttons UI

## API Integration

All Infomaniak Cloud API endpoints are fully integrated:

```
PUT /servers/{ID}/action - Start (os-start)
PUT /servers/{ID}/action - Stop (os-stop)  
PUT /servers/{ID}/action - Reboot (soft/hard)
DELETE /servers/{ID} - Delete
GET /servers/{ID} - Get details (already existed)
```

## Security

- ✅ User authorization checks
- ✅ Only users can manage their own servers
- ✅ Error handling for invalid operations
- ✅ Comprehensive logging
- ✅ Status validation before operations

## Testing Checklist

- [ ] Click "My Servers" and see server list
- [ ] Click on a server to see details
- [ ] Try Start/Stop actions
- [ ] Try Soft/Hard Reboot
- [ ] Try to delete a server
- [ ] Verify status updates in real-time
- [ ] Try accessing another user's server (should fail)
- [ ] Check error messages for failed operations

## Notes

- All times display in Farsi calendar format
- Pending IPs show as `<Pending>` until assigned by datacenter
- IPv6 addresses automatically formatted with brackets for SSH
- Users see "Refresh" button after actions to update details
- All operations logged for debugging

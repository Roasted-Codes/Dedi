# Snapshot and Instance Management

This document provides an overview of the snapshot and instance management functionality in the Dedi Bot.

## Overview

The bot supports creating, managing, and using snapshots to create game server instances. This allows for rapid deployment of pre-configured servers.

## Commands

| Command | Description | Who Can Use | Parameters |
|---------|-------------|------------|------------|
| `/create-snapshot` | Creates a snapshot from a stopped server | Admin only | `instance-id`, `description` |
| `/list-snapshots` | Lists all available snapshots | Everyone | None |
| `/create` | Creates a new server from the latest snapshot | Everyone | `name` (optional) |
| `/status` | Shows the status of a server | Everyone | `instance-id` (optional) |
| `/start` | Starts a stopped server | Owner of the server | `instance-id` (optional) |
| `/stop` | Stops a running server | Owner of the server | `instance-id` (optional) |
| `/list` | Lists all active servers | Everyone | None |
| `/debug` | Shows detailed debugging information | Admin only | None |

## Workflow

### For Admins

1. Create a base server with the desired configuration
2. Stop the server using `/stop`
3. Create a snapshot using `/create-snapshot`
4. The snapshot is now available for users to create servers with

### For Users

1. Create a new server from a snapshot using `/create`
2. Wait for the server to be ready (usually 5-10 minutes)
3. Use `/status` to check when the server is ready
4. When not using the server, use `/stop` to stop it and save costs
5. When needed again, use `/start` to start it back up

## Technical Implementation

The bot uses a robust wrapper around the Vultr API that handles:

1. Parameter format inconsistencies
2. Automatic retries with exponential backoff
3. Response validation and error handling
4. Proper status monitoring

### Key Components

- **vultrWrapper.js**: Robust API wrapper with error handling and retries
- **instanceTracker.js**: Keeps track of instances and their owners
- **Command Files**: Handle Discord command interactions

## Common Issues and Solutions

### Issue: Failed to create instance

**Cause**: The most common cause is incompatible parameter formats when calling the Vultr API.

**Solution**: The wrapper now automatically tries both kebab-case (`snapshot-id`) and snake_case (`snapshot_id`) parameter formats.

### Issue: Cannot see server status

**Cause**: The server might be owned by another user.

**Solution**: All users can now see all active servers using `/list` and check any server's status using `/status instance-id:[ID]`.

### Issue: Snapshot Creation Fails

**Cause**: The server must be completely stopped before taking a snapshot.

**Solution**: Use `/stop` and wait for the status to show as "Stopped" before using `/create-snapshot`.

## Testing Changes

To test the new snapshot functionality:

1. Run the bot
2. Use `/list-snapshots` to see available snapshots
3. Try `/create` to create a new server from a snapshot
4. Monitor progress with `/status`

For admins, you can use `/debug` to get detailed information about all tracked instances.

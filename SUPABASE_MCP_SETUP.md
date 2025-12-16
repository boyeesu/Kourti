# Supabase MCP Setup Guide

## Overview
This guide will help you set up the Supabase Model Context Protocol (MCP) server for your Kouti Legal Hub project.

## What Has Been Done

### 1. MCP Configuration Created
A Claude Desktop MCP configuration file has been created at:
```
%APPDATA%\Claude\claude_desktop_config.json
```

The configuration includes:
```json
{
  "mcpServers": {
    "supabase": {
      "command": "npx",
      "args": [
        "-y",
        "@modelcontextprotocol/server-supabase",
        "postgresql://postgres:postgres@127.0.0.1:54322/postgres"
      ]
    }
  }
}
```

This configuration connects to your local Supabase instance on port 54322 (as defined in `supabase/config.toml`).

## What You Need to Do

### 2. Start Local Supabase Instance

You have several options to start your local Supabase instance:

#### Option A: Using Supabase CLI (Recommended)

1. **Install Supabase CLI** (if not already installed):
   
   **Windows (PowerShell):**
   ```powershell
   # Using Scoop
   scoop bucket add supabase https://github.com/supabase/scoop-bucket.git
   scoop install supabase
   
   # OR using Chocolatey
   choco install supabase
   ```

2. **Start Supabase:**
   ```bash
   supabase start
   ```
   
   Or use the npm script:
   ```bash
   npm run supabase:start
   ```

#### Option B: Direct Docker Compose

If the CLI isn't working, you can use Docker Compose directly:

1. Navigate to your project directory
2. Run:
   ```bash
   docker compose -f supabase/docker-compose.yml up -d
   ```

### 3. Verify Supabase is Running

Check the status:
```bash
supabase status
```

Or check Docker containers:
```bash
docker ps | findstr supabase
```

You should see containers running for:
- PostgreSQL (port 54322)
- API Gateway (port 54321)
- Auth (port 54323)
- And other Supabase services

### 4. Restart Claude Desktop

After Supabase is running:
1. **Completely quit Claude Desktop** (not just close the window)
2. **Restart Claude Desktop**
3. The Supabase MCP server should now be available

### 5. Verify MCP Connection

Once Claude Desktop restarts, you should see the Supabase MCP server connected. You can verify by:
- Looking for a Supabase icon or indicator in Claude Desktop
- Trying to query your database through Claude

## MCP Server Capabilities

Once connected, the Supabase MCP server will allow Claude to:
- Query your database schema
- Read data from tables
- Execute SQL queries (read-only by default)
- Understand your database structure
- Help with database-related tasks

## Troubleshooting

### Issue: Supabase won't start
- **Check Docker is running**: `docker info`
- **Check for port conflicts**: Make sure ports 54321, 54322, 54323 are not in use
- **View Docker logs**: `docker logs <container-id>`

### Issue: MCP server not connecting
- **Verify Supabase is running**: `supabase status`
- **Check the connection string** in `claude_desktop_config.json`
- **Restart Claude Desktop** completely
- **Check Claude Desktop logs** for MCP connection errors

### Issue: Permission denied errors
- Make sure Docker Desktop is running with proper permissions
- On Windows, ensure WSL2 is properly configured if using Docker Desktop

## Connection Details

Your local Supabase instance uses:
- **Database Port**: 54322
- **API Port**: 54321
- **Auth Port**: 54323
- **Default User**: postgres
- **Default Password**: postgres
- **Database Name**: postgres

## Next Steps

After successful setup:
1. You can interact with your Supabase database through Claude
2. Ask Claude to help you understand your schema
3. Use Claude to help write queries or manage your data
4. The MCP connection will persist across Claude Desktop sessions

## Project Information

- **Project ID**: zjbvnvydgsxqmmrrmvif
- **Supabase Config**: `supabase/config.toml`
- **Migrations**: `supabase/migrations/`
- **Functions**: `supabase/functions/`

## Additional Resources

- [Supabase CLI Documentation](https://supabase.com/docs/guides/cli)
- [MCP Documentation](https://modelcontextprotocol.io/)
- [Supabase MCP Server](https://github.com/modelcontextprotocol/servers/tree/main/src/supabase)

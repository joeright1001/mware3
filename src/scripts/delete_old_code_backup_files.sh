#!/bin/bash

# Directory containing the backup files
BACKUP_DIR="/workspaces/mware3/src/scripts"

# Pattern for backup files
PATTERN="code_backup_*.txt"

# List all backup files sorted by date (newest last), skip the newest one
find "$BACKUP_DIR" -name "$PATTERN" | \
    sort | \
    head -n -1 | \
    while read file; do
        echo "Deleting: $file"
        rm "$file"
    done

# Count remaining files
remaining=$(find "$BACKUP_DIR" -name "$PATTERN" | wc -l)
echo "Cleanup complete. $remaining backup file(s) remaining."
#!/bin/bash

# Configurable variables
TARGET_SSID="YourPreferredSSID"
WIFI_INTERFACE="en0" # Typically "en0" on Mac, change if needed
LOG_FILE="$HOME/wifi-check.log"

# Logging function
log() {
    echo "$(date '+%Y-%m-%d %H:%M:%S') - $1" | tee -a "$LOG_FILE"
}

# Check if Wi-Fi is off
WIFI_STATUS=$(networksetup -getairportpower "$WIFI_INTERFACE" | awk '{print $4}')

if [[ "$WIFI_STATUS" == "Off" ]]; then
    log "Wi-Fi is disabled. Enabling..."
    networksetup -setairportpower "$WIFI_INTERFACE" on
    sleep 5  # Give it time to initialise
else
    log "Wi-Fi is already enabled."
fi

# Get current connected SSID
CURRENT_SSID=$(networksetup -getairportnetwork "$WIFI_INTERFACE" | awk -F': ' '{print $2}')

if [[ -z "$CURRENT_SSID" || "$CURRENT_SSID" != "$TARGET_SSID" ]]; then
    log "Current SSID is '$CURRENT_SSID'. Attempting to connect to '$TARGET_SSID'..."
    networksetup -setairportnetwork "$WIFI_INTERFACE" "$TARGET_SSID"
    
    # Wait a moment to ensure connection
    sleep 5

    # Verify connection
    NEW_SSID=$(networksetup -getairportnetwork "$WIFI_INTERFACE" | awk -F': ' '{print $2}')
    if [[ "$NEW_SSID" == "$TARGET_SSID" ]]; then
        log "Successfully connected to '$TARGET_SSID'."
    else
        log "Failed to connect to '$TARGET_SSID'."
    fi
else
    log "Already connected to '$TARGET_SSID'. No action needed."
fi
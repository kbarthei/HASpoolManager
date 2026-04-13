# iOS Shortcut: Scan Bambu Lab Spool

Scan an NFC tag on a Bambu Lab filament spool with your iPhone and instantly see the spool details in HASpoolManager.

## Prerequisites

- iPhone 7 or newer
- iOS 13+ (for background NFC reading)
- Shortcuts app (built-in)

## Setup

### Step 1: Create the Shortcut

1. Open the **Shortcuts** app on your iPhone
2. Tap **+** to create a new shortcut
3. Name it **"Scan Spool"**

### Step 2: Add Actions

Add these actions in order:

**Action 1: Scan NFC Tag**
- Search for "NFC" → select **"Scan NFC Tag"**
- No configuration needed

**Action 2: Get Details of NFC Tag**
- Search for "Get Details" → select **"Get Details of NFC Tag"**
- Set "Get" to **"Serial Number"** (this is the tag UID)
- Input: the NFC Tag from Step 1

**Action 3: Replace Text**
- Search for "Replace Text" → select **"Replace Text"**
- Find: `:` (colon)
- Replace with: (empty — removes the colons from the serial number format)
- Input: Serial Number from Step 2

**Action 4: Open URL**
- Search for "URL" → select **"Open URL"**
- URL: `http://homeassistant:3001/ingress/scan?tag=` followed by the cleaned text
- To build this: type the URL, then tap the variable button and insert the result from Step 3

The full URL pattern: `http://homeassistant:3001/ingress/scan?tag={cleaned_serial}`

### Step 3: Add to Home Screen

1. Tap the shortcut name at the top
2. Tap **"Add to Home Screen"**
3. Choose an icon (suggestion: the NFC icon or a 3D printer icon)
4. Tap **Add**

## Usage

1. Tap **"Scan Spool"** on your Home Screen
2. Hold your iPhone near the RFID tag on the Bambu Lab spool (bottom of the spool)
3. The app opens in Safari showing the spool details

## What Happens

- **Known spool (RFID mapped):** Instantly redirects to the spool detail page
- **Unknown tag:** Shows the tag UID and best-guess matches, with an option to assign the tag to a spool

## Troubleshooting

- **"No NFC tag found"**: Hold the phone closer to the spool's RFID tag (located on the bottom rim)
- **"Unknown tag"**: The spool's RFID tag hasn't been mapped yet. It will be auto-mapped when loaded into the AMS.
- **iPhone doesn't scan**: Make sure NFC is enabled (Settings → Control Center, or it's always on for iPhone XS+)

## Tag UID Format

Bambu Lab tags use 16-character hex UIDs like `B568B1A400000100`. iOS reads them with colons (`B5:68:B1:A4:00:00:01:00`), which the Shortcut strips automatically.

## Alternative: NFC Automation

Instead of a manual shortcut, you can set up an **NFC Automation**:

1. Open Shortcuts → **Automation** tab
2. Tap **+** → **NFC**
3. Scan a specific spool's tag
4. Action: Open URL `http://homeassistant:3001/ingress/scan?tag={UID}`

This triggers automatically when you tap the spool — no need to open the Shortcuts app. However, you need to create one automation per spool.

# Development

1. Open `codecall.code-workspace` in Cursor
2. Run `npm install`
3. Run `npm run dev` to launch the extension
4. After making changes, use `Cmd+Shift+P` → "Developer: Reload Window" to see updates on new window

## macOS Dependencies

For screen click functionality, install `cliclick`:

```bash
brew install cliclick
```

Without `cliclick`, the extension falls back to AppleScript which requires accessibility permissions for Cursor in System Settings → Privacy & Security → Accessibility.

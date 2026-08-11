# Sending your shopping list to iOS Reminders

The app builds your shopping list as plain text and hands it to iOS through the
standard **Share Sheet** (`navigator.share`) when you tap **Send to Reminders**.
There are two ways to receive it, depending on how much control you want.

## Option A — Quick and built-in (one reminder for the whole list)

1. Tap **Send to Reminders** in the app.
2. In the Share Sheet, choose **Reminders**.
3. iOS creates a single new reminder titled with your list. Everything is there,
   just in one item rather than a checklist.

No setup required — this works immediately on any iPhone or iPad running iOS 13+.

## Option B — One reminder per item (recommended)

This uses a small personal Shortcut that splits the shared text into lines and
adds each line as its own reminder in a list called **Shopping List**.

1. Open the **Shortcuts** app on your iPhone.
2. Tap **+** to create a new shortcut, name it **Add Shopping List**.
3. Add these actions in order:
   1. **Receive** input: `Text`, from `Share Sheet`.
   2. **Split Text** — split `Shortcut Input` by `New Lines`.
   3. **Repeat with Each** item in the split result.
      - Inside the repeat: **Add New Reminder** — title: `Repeat Item`,
        list: `Shopping List` (create this list in Reminders first, or let the
        action create it).
4. In the shortcut's settings (the ⓘ icon), turn on **Show in Share Sheet**
   and set the accepted type to **Text**.
5. Save.

Now, when you tap **Send to Reminders** in Card Catalog and pick your
**Add Shopping List** shortcut from the Share Sheet, every ingredient lands in
your Reminders app as its own checkable item.

### Why not do this automatically from the website?

iOS does not expose a public web API for creating Reminders directly from
Safari — the Share Sheet and Shortcuts are the supported, no-permissions way
to bridge a website to the Reminders app. This keeps Card Catalog fully static
(no backend, no account, no data leaving your device) while still getting you
a checklist you can shop from.

If `navigator.share` isn't available (for example, in desktop browsers), the
app falls back to **Copy list**, which you can paste anywhere.

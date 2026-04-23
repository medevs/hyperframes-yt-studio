---
name: yt-approve
description: Move approved run from work/ to ready-to-upload/ and release lock.
---

```bash
RUN=$(cat .last-run)
TARGET="ready-to-upload/$(basename "$RUN")"
mkdir -p ready-to-upload
mv "$RUN" "$TARGET"
node -e "import('./pipeline/lib/run-id.js').then(m => m.releaseRun(process.argv[1]))" "$TARGET"
echo "$TARGET" > .last-run
echo "$TARGET"
```

Tell the user: "Ready to upload: `$TARGET`. Drag `renders/video.mp4` and `snapshots/thumbnail.png` into YouTube Studio, copy fields from `metadata.txt`."
